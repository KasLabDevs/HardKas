export interface TransportCapabilities {
    readonly supportsHeartbeat: boolean;
    readonly supportsReplay: boolean;
    readonly supportsServerSubscriptions: boolean;
}
export type TransportSubscriptionRequest = any;
export type TransportSubscription = any;
export interface TransportAdapter {
    readonly id: string;
    readonly capabilities: TransportCapabilities;
    connect(signal?: AbortSignal): Promise<void>;
    disconnect(): Promise<void>;
    subscribe(request: TransportSubscriptionRequest): Promise<TransportSubscription>;
    unsubscribe(subscription: TransportSubscription): Promise<void>;
    onMessage(handler: (message: unknown) => void): () => void;
    onDisconnect(handler: (reason?: unknown) => void): () => void;
}
//# sourceMappingURL=transport.d.ts.map