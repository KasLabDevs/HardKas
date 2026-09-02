import { TransportAdapter, TransportCapabilities, TransportSubscriptionRequest, TransportSubscription } from "@hardkas/rpc-events";
import { KaspaRpcClient } from "@hardkas/kaspa-rpc";

let subCounter = 0;

export class KaspaRpcTransportAdapter implements TransportAdapter {
  public id = "kaspa-rpc-transport";
  public capabilities: TransportCapabilities = {
    supportsHeartbeat: false,
    supportsReplay: false,
    supportsServerSubscriptions: true
  };

  private connected = true;
  private messageHandlers = new Set<(message: unknown) => void>();
  private disconnectHandlers = new Set<(reason?: unknown) => void>();
  private activeSubscriptions = new Map<string, { unsubscribe: () => Promise<void> }>();
  
  constructor(private rpc: KaspaRpcClient) {}

  async connect(signal?: AbortSignal): Promise<void> {
    this.connected = true;
  }

  async disconnect(): Promise<void> {
    this.connected = false;
    for (const sub of this.activeSubscriptions.values()) {
      await sub.unsubscribe().catch(() => {});
    }
    this.activeSubscriptions.clear();
    for (const h of this.disconnectHandlers) {
      h("client_disconnect");
    }
  }

  async subscribe(request: TransportSubscriptionRequest): Promise<TransportSubscription> {
    if (!this.connected) throw new Error("Not connected");
    
    const id = `remote_sub_${++subCounter}`;
    
    // Map request to KaspaRpcClient subscription
    let kaspaSub;
    if (request.type === "utxosChanged") {
      kaspaSub = await this.rpc.subscribeToUtxosChanged(request.addresses || [], (payload) => {
        for (const h of this.messageHandlers) {
          h({ id: `env_${Date.now()}_${Math.random()}`, type: "utxosChanged", payload, metadata: { observedAt: Date.now(), source: "live" } });
        }
      });
    } else if (request.type === "virtualChainChanged") {
      kaspaSub = await this.rpc.subscribeToVirtualChainChanged({ includeAcceptedTransactionIds: true }, (payload) => {
        for (const h of this.messageHandlers) {
          h({ id: `env_${Date.now()}_${Math.random()}`, type: "virtualChainChanged", payload, metadata: { observedAt: Date.now(), source: "live" } });
        }
      });
    } else {
      throw new Error(`Unsupported event type: ${request.type}`);
    }

    this.activeSubscriptions.set(id, kaspaSub);
    return id;
  }

  async unsubscribe(subscription: TransportSubscription): Promise<void> {
    const sub = this.activeSubscriptions.get(subscription as string);
    if (sub) {
      await sub.unsubscribe().catch(() => {});
      this.activeSubscriptions.delete(subscription as string);
    }
  }

  onMessage(handler: (message: unknown) => void): () => void {
    this.messageHandlers.add(handler);
    return () => this.messageHandlers.delete(handler);
  }

  onDisconnect(handler: (reason?: unknown) => void): () => void {
    this.disconnectHandlers.add(handler);
    return () => this.disconnectHandlers.delete(handler);
  }
}
