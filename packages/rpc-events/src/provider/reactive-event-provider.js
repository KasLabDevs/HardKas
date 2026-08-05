import { SubscriptionManager } from "../manager/subscription-manager.js";
import { ReconciliationEngine } from "../manager/reconciliation.js";
// Helper for generating unique IDs
let subIdCounter = 0;
function nextId() {
    return `sub_${++subIdCounter}`;
}
export class DefaultReactiveEventProvider {
    transport;
    manager;
    reconciliation = new ReconciliationEngine();
    subscriptions = new Map();
    transportMessageUnsubscribe;
    constructor(transport) {
        this.transport = transport;
        this.manager = new SubscriptionManager(transport, () => this.handleResubscribe());
        this.transportMessageUnsubscribe = this.transport.onMessage((msg) => this.handleRawMessage(msg));
    }
    async connect() {
        await this.manager.connect();
    }
    async close() {
        if (this.transportMessageUnsubscribe) {
            this.transportMessageUnsubscribe();
            this.transportMessageUnsubscribe = undefined;
        }
        // Clear local subs
        this.subscriptions.clear();
        await this.manager.close();
    }
    onConnectionState(handler) {
        const unsub = this.manager.onStateChange((evt) => {
            // Isolate failures
            try {
                handler(evt);
            }
            catch (err) {
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
    async subscribe(request, handler) {
        const id = nextId();
        const sub = {
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
                    }
                    catch (e) {
                        // Ignore unsubscribe errors if transport is closing
                    }
                }
            }
        };
    }
    async subscribeRemotely(request) {
        // In a real implementation, you'd map the domain request to a transport request.
        // For P3 tests, we pass it down directly to the simulated transport.
        const transportReq = { ...request };
        return await this.transport.subscribe(transportReq);
    }
    async handleResubscribe() {
        // Re-subscribe all active scopes
        for (const sub of this.subscriptions.values()) {
            try {
                sub.remoteSubId = await this.subscribeRemotely(sub.request);
            }
            catch (err) {
                console.error(`Failed to resubscribe ${sub.id}`, err);
            }
        }
        // Note: Here is where P3 requires obtaining a snapshot and reconciling with live events.
        // We mock that behavior for now. The reconciliation engine handles deduplication.
    }
    handleRawMessage(message) {
        // Transport passes an EventEnvelope
        const envelope = message;
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
                    const reqAddrs = sub.request.addresses;
                    // Basic filtering simulation
                    if (reqAddrs && reqAddrs.length > 0) {
                        const eventAddrs = [
                            ...envelope.payload.added.map((u) => u.scriptPublicKey.scriptPublicKey),
                            ...envelope.payload.removed.map((u) => u.transactionId) // Hack for sim
                        ];
                        // If they intersect, matches = true
                        matches = reqAddrs.some(a => eventAddrs.includes(a));
                    }
                }
                if (matches) {
                    try {
                        // Create a specific envelope for this subscription
                        const scopedEnvelope = {
                            ...envelope,
                            subscriptionId: sub.id
                        };
                        sub.handler(scopedEnvelope);
                    }
                    catch (err) {
                        console.error(`Subscription ${sub.id} handler threw error`, err);
                    }
                }
            }
        }
    }
}
//# sourceMappingURL=reactive-event-provider.js.map