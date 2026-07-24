export interface TransportCapabilities {
  readonly supportsHeartbeat: boolean;
  readonly supportsReplay: boolean;
  readonly supportsServerSubscriptions: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TransportSubscriptionRequest = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type TransportSubscription = any;

export interface TransportAdapter {
  readonly id: string;
  readonly capabilities: TransportCapabilities;

  connect(signal?: AbortSignal): Promise<void>;
  disconnect(): Promise<void>;

  subscribe(
    request: TransportSubscriptionRequest,
  ): Promise<TransportSubscription>;

  unsubscribe(
    subscription: TransportSubscription
  ): Promise<void>;

  onMessage(
    handler: (message: unknown) => void,
  ): () => void; // UnsubscribeFn

  onDisconnect(
    handler: (reason?: unknown) => void,
  ): () => void;
}
