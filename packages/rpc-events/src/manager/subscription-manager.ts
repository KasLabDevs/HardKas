import { ConnectionStatus, ConnectionStateChangedEvent } from "../contracts/events.js";
import { TransportAdapter } from "../contracts/transport.js";
import { DeterministicBackoff } from "./backoff.js";

type StateChangeHandler = (event: ConnectionStateChangedEvent) => void;

export class SubscriptionManager {
  private status: ConnectionStatus = "idle";
  private backoff: DeterministicBackoff;
  private stateListeners: Set<StateChangeHandler> = new Set();
  private reconnectTimer?: NodeJS.Timeout;
  private abortController?: AbortController;
  private cleanupFns: Array<() => void> = [];

  constructor(
    private transport: TransportAdapter,
    private onResubscribe: () => Promise<void>
  ) {
    this.backoff = new DeterministicBackoff({
      initialDelayMs: 100,
      maxDelayMs: 10000,
      factor: 2
    });
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public onStateChange(handler: StateChangeHandler): () => void {
    this.stateListeners.add(handler);
    return () => this.stateListeners.delete(handler);
  }

  private transition(newStatus: ConnectionStatus, reason?: string, retryInMs?: number) {
    if (this.status === newStatus) return;
    
    const event: ConnectionStateChangedEvent = {
      previous: this.status,
      current: newStatus,
      attempt: this.backoff.attempt,
      retryInMs,
      reason
    };
    
    this.status = newStatus;
    
    // Safely emit to all listeners without throwing if one fails
    for (const listener of this.stateListeners) {
      try {
        listener(event);
      } catch (err) {
        console.error("SubscriptionManager: state listener threw error", err);
      }
    }
  }

  public async connect(): Promise<void> {
    if (this.status === "connected" || this.status === "connecting" || this.status === "reconnecting") {
      return;
    }

    this.abortController = new AbortController();
    this.transition("connecting");
    this.backoff.reset();

    await this.doConnect();
  }

  private async doConnect(): Promise<void> {
    try {
      await this.transport.connect(this.abortController?.signal);
      this.transition("connected");
      this.backoff.reset();
      
      this.cleanupFns.push(
        this.transport.onDisconnect((reason) => {
          this.handleDisconnect(reason);
        })
      );
      
      // Resubscribe active scopes and trigger reconciliation
      await this.onResubscribe();
      
    } catch (err: any) {
      this.handleConnectFailure(err.message || "Connection failed");
    }
  }

  private handleDisconnect(reason?: unknown) {
    if (this.status === "closing" || this.status === "closed") return;
    
    this.clearCleanupFns();
    this.scheduleReconnect(String(reason));
  }

  private handleConnectFailure(reason: string) {
    if (this.status === "closing" || this.status === "closed") return;
    this.scheduleReconnect(reason);
  }

  private scheduleReconnect(reason: string) {
    const delay = this.backoff.nextDelay();
    
    if (delay === undefined) {
      this.transition("failed", "Max reconnect attempts reached");
      return;
    }

    this.transition(this.status === "connected" ? "degraded" : "reconnecting", reason, delay);
    
    this.reconnectTimer = setTimeout(() => {
      this.doConnect();
    }, delay);
  }

  public async close(): Promise<void> {
    this.transition("closing", "Explicit close requested");
    
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
    
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }

    this.clearCleanupFns();

    try {
      await this.transport.disconnect();
    } catch (err) {
      // Ignore disconnect errors during close
    }

    this.transition("closed");
  }

  private clearCleanupFns() {
    for (const fn of this.cleanupFns) {
      try { fn(); } catch (e) {}
    }
    this.cleanupFns = [];
  }
}
