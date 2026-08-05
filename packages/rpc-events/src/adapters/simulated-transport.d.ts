import { TransportAdapter, TransportCapabilities, TransportSubscriptionRequest, TransportSubscription } from "../contracts/transport.js";
import { EventEnvelope } from "../contracts/events.js";
export declare class SimulatedTransportAdapter implements TransportAdapter {
    id: string;
    capabilities: TransportCapabilities;
    private connected;
    private messageHandlers;
    private disconnectHandlers;
    private activeSubscriptions;
    failConnect: boolean;
    connectDelay: number;
    connect(signal?: AbortSignal): Promise<void>;
    disconnect(): Promise<void>;
    simulateDisconnect(reason: string): void;
    simulateMessage(envelope: EventEnvelope<any>): void;
    subscribe(request: TransportSubscriptionRequest): Promise<TransportSubscription>;
    unsubscribe(subscription: TransportSubscription): Promise<void>;
    onMessage(handler: (message: unknown) => void): () => void;
    onDisconnect(handler: (reason?: unknown) => void): () => void;
    getActiveRemoteSubscriptionsCount(): number;
}
//# sourceMappingURL=simulated-transport.d.ts.map