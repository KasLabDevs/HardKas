import { EventType, EventEnvelope, EventMap, ConnectionStateChangedEvent } from "./events.js";

export type SubscriptionRequest<T extends EventType> =
  T extends "blockAdded" ? { type: T } :
  T extends "utxosChanged" ? { type: T; addresses: readonly string[] } :
  T extends "transactionObserved" ? { type: T; txIds: readonly string[] } :
  T extends "transactionAcceptanceChanged" ? { type: T; txIds: readonly string[] } :
  T extends "transactionFinalityChanged" ? { type: T; txIds: readonly string[] } :
  never;

export interface Subscription<T> {
  readonly id: string;
  unsubscribe(): Promise<void>;
}

export type EventHandler<T> = (event: EventEnvelope<T>) => void | Promise<void>;

export interface ReactiveEventProvider {
  subscribe<T extends EventType>(
    request: SubscriptionRequest<T>,
    handler: EventHandler<EventMap[T]>,
  ): Promise<Subscription<EventMap[T]>>;

  onConnectionState(
    handler: (event: ConnectionStateChangedEvent) => void | Promise<void>,
  ): Subscription<ConnectionStateChangedEvent>;

  close(): Promise<void>;
}
