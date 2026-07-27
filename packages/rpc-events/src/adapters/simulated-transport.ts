import { TransportAdapter, TransportCapabilities, TransportSubscriptionRequest, TransportSubscription } from "../contracts/transport.js";
import { EventEnvelope } from "../contracts/events.js";

let subCounter = 0;

export class SimulatedTransportAdapter implements TransportAdapter {
  public id = "simulated-transport";
  public capabilities: TransportCapabilities = {
    supportsHeartbeat: true,
    supportsReplay: false,
    supportsServerSubscriptions: true
  };

  private connected = false;
  private messageHandlers = new Set<(message: unknown) => void>();
  private disconnectHandlers = new Set<(reason?: unknown) => void>();
  private activeSubscriptions = new Map<string, TransportSubscriptionRequest>();
  
  public failConnect = false;
  public connectDelay = 10;

  async connect(signal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (this.failConnect) {
          reject(new Error("Simulated connection failure"));
        } else {
          this.connected = true;
          resolve();
        }
      }, this.connectDelay);

      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(new Error("Aborted"));
        });
      }
    });
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    this.activeSubscriptions.clear();
  }

  public simulateDisconnect(reason: string) {
    this.connected = false;
    this.activeSubscriptions.clear();
    for (const h of this.disconnectHandlers) {
      h(reason);
    }
  }

  public simulateMessage(envelope: EventEnvelope<any>) {
    if (!this.connected) return;
    for (const h of this.messageHandlers) {
      h(envelope);
    }
  }

  async subscribe(request: TransportSubscriptionRequest): Promise<TransportSubscription> {
    if (!this.connected) throw new Error("Not connected");
    const id = `remote_sub_${++subCounter}`;
    this.activeSubscriptions.set(id, request);
    return id;
  }

  async unsubscribe(subscription: TransportSubscription): Promise<void> {
    this.activeSubscriptions.delete(subscription as string);
  }

  onMessage(handler: (message: unknown) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onDisconnect(handler: (reason?: unknown) => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }

  public getActiveRemoteSubscriptionsCount() {
    return this.activeSubscriptions.size;
  }
}
