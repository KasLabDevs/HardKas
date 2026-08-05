import { EventType, EventMap, ConnectionStateChangedEvent } from "../contracts/events.js";
import { ReactiveEventProvider, SubscriptionRequest, Subscription, EventHandler } from "../contracts/subscriptions.js";
import { TransportAdapter } from "../contracts/transport.js";
export declare class DefaultReactiveEventProvider implements ReactiveEventProvider {
    private transport;
    private manager;
    private reconciliation;
    private subscriptions;
    private transportMessageUnsubscribe?;
    constructor(transport: TransportAdapter);
    connect(): Promise<void>;
    close(): Promise<void>;
    onConnectionState(handler: (event: ConnectionStateChangedEvent) => void | Promise<void>): Subscription<ConnectionStateChangedEvent>;
    subscribe<T extends EventType>(request: SubscriptionRequest<T>, handler: EventHandler<EventMap[T]>): Promise<Subscription<EventMap[T]>>;
    private subscribeRemotely;
    private handleResubscribe;
    private handleRawMessage;
}
//# sourceMappingURL=reactive-event-provider.d.ts.map