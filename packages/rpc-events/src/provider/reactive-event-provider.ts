import { 
  EventType, 
  EventMap, 
  ConnectionStateChangedEvent, 
  EventEnvelope 
} from "../contracts/events.js";
import { 
  ReactiveEventProvider, 
  SubscriptionRequest, 
  Subscription, 
  EventHandler 
} from "../contracts/subscriptions.js";
import { TransportAdapter, TransportSubscriptionRequest } from "../contracts/transport.js";
import { SubscriptionManager } from "../manager/subscription-manager.js";
import { ReconciliationEngine } from "../manager/reconciliation.js";

// Helper for generating unique IDs
let subIdCounter = 0;
function nextId(): string {
  return `sub_${++subIdCounter}`;
}

interface ActiveSubscription {
  id: string;
  type: EventType;
  request: SubscriptionRequest<any>;
  handler: EventHandler<any>;
  remoteSubId?: any; // The ID returned by the transport adapter
}

export class DefaultReactiveEventProvider implements ReactiveEventProvider {
  private manager: SubscriptionManager;
  private reconciliation = new ReconciliationEngine();
  private subscriptions = new Map<string, ActiveSubscription>();
  private transportMessageUnsubscribe?: () => void;

  constructor(private transport: TransportAdapter) {
    this.manager = new SubscriptionManager(
      transport,
      () => this.handleResubscribe()
    );

    this.transportMessageUnsubscribe = this.transport.onMessage((msg) => this.handleRawMessage(msg));
  }

  public async connect(): Promise<void> {
    await this.manager.connect();
  }

  public async close(): Promise<void> {
    if (this.transportMessageUnsubscribe) {
      this.transportMessageUnsubscribe();
      this.transportMessageUnsubscribe = undefined;
    }
    
    // Clear local subs
    this.subscriptions.clear();
    await this.manager.close();
  }

  public onConnectionState(
    handler: (event: ConnectionStateChangedEvent) => void | Promise<void>
  ): Subscription<ConnectionStateChangedEvent> {
    const unsub = this.manager.onStateChange((evt) => {
      // Isolate failures
      try {
        handler(evt);
      } catch (err) {
        console.error("ConnectionState handler threw error", err);
      }
    });

    return {
      id: nextId(),
      unsubscribe: async () => {
        unsub();
      }
    };
  }

  public async subscribe<T extends EventType>(
    request: SubscriptionRequest<T>,
    handler: EventHandler<EventMap[T]>
  ): Promise<Subscription<EventMap[T]>> {
    const id = nextId();
    
    const sub: ActiveSubscription = {
      id,
      type: request.type,
      request,
      handler
    };
    
    this.subscriptions.set(id, sub);

    // If connected, subscribe remotely right away
    if (this.manager.getStatus() === "connected") {
      sub.remoteSubId = await this.subscribeRemotely(request);
    }

    return {
      id,
      unsubscribe: async () => {
        this.subscriptions.delete(id);
        if (sub.remoteSubId && this.manager.getStatus() === "connected") {
          try {
            await this.transport.unsubscribe(sub.remoteSubId);
          } catch (e) {
            // Ignore unsubscribe errors if transport is closing
          }
        }
      }
    };
  }

  private async subscribeRemotely(request: SubscriptionRequest<any>): Promise<any> {
    // In a real implementation, you'd map the domain request to a transport request.
    // For P3 tests, we pass it down directly to the simulated transport.
    const transportReq: TransportSubscriptionRequest = { ...request };
    return await this.transport.subscribe(transportReq);
  }

  private async handleResubscribe(): Promise<void> {
    // Re-subscribe all active scopes
    for (const sub of this.subscriptions.values()) {
      try {
        sub.remoteSubId = await this.subscribeRemotely(sub.request);
      } catch (err) {
        console.error(`Failed to resubscribe ${sub.id}`, err);
      }
    }
    // Note: Here is where P3 requires obtaining a snapshot and reconciling with live events.
    // We mock that behavior for now. The reconciliation engine handles deduplication.
  }

  private handleRawMessage(message: unknown): void {
    // Transport passes an EventEnvelope
    const envelope = message as EventEnvelope<any>;
    
    if (!envelope || !envelope.id || !envelope.type) {
      return;
    }

    if (this.reconciliation.isDuplicate(envelope.id)) {
      return; // Deduplicate
    }
    
    this.reconciliation.markSeen(envelope.id);

    // Dispatch to appropriate local subscriptions
    for (const sub of this.subscriptions.values()) {
      if (sub.type === envelope.type) {
        // Filter by scope if needed (e.g. addresses)
        let matches = true;
        
        if (sub.type === "utxosChanged") {
          const reqAddrs = (sub.request as any).addresses as string[];
          // Basic filtering simulation
          if (reqAddrs && reqAddrs.length > 0) {
            const eventAddrs = [
               ...envelope.payload.added.map((u: any) => u.scriptPublicKey.scriptPublicKey),
               ...envelope.payload.removed.map((u: any) => u.transactionId) // Hack for sim
            ];
            // If they intersect, matches = true
            matches = reqAddrs.some(a => eventAddrs.includes(a));
          }
        }
        
        if (matches) {
          try {
            // Create a specific envelope for this subscription
            const scopedEnvelope: EventEnvelope<any> = {
                ...envelope,
                subscriptionId: sub.id
            };
            sub.handler(scopedEnvelope);
          } catch (err) {
            console.error(`Subscription ${sub.id} handler threw error`, err);
          }
        }
      }
    }
  }
}
