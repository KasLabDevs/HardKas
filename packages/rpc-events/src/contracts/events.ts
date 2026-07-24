import { UTXO, UTXORef } from "@hardkas/core";

export interface EventMetadata {
  readonly sequence?: bigint;
  readonly observedAt: number;
  readonly source: "live" | "reconciliation";
}

export interface EventEnvelope<T> {
  readonly id: string;
  readonly type: string;
  readonly subscriptionId: string;
  readonly payload: T;
  readonly metadata: EventMetadata;
}

export interface BlockAddedEvent {
  readonly hash: string;
  readonly daaScore: bigint;
}

export interface UtxoChangedEvent {
  readonly added: UTXO[];
  readonly removed: UTXORef[];
}

export interface TransactionObservedEvent {
  readonly txId: string;
  readonly blockHash?: string;
}

export interface TransactionAcceptanceChangedEvent {
  readonly txId: string;
  readonly accepted: boolean;
}

export interface TransactionFinalityChangedEvent {
  readonly txId: string;
  readonly status: "observed" | "accepted" | "confirming" | "confirmed";
  readonly confirmationScore?: bigint;
}

export type ConnectionStatus = 
  | "idle" 
  | "connecting" 
  | "connected" 
  | "degraded" 
  | "reconnecting" 
  | "closing" 
  | "closed" 
  | "failed";

export interface ConnectionStateChangedEvent {
  readonly previous: ConnectionStatus;
  readonly current: ConnectionStatus;
  readonly attempt: number;
  readonly retryInMs?: number;
  readonly reason?: string;
}

export type EventType = 
  | "blockAdded" 
  | "utxosChanged" 
  | "transactionObserved" 
  | "transactionAcceptanceChanged" 
  | "transactionFinalityChanged";

export interface EventMap {
  blockAdded: BlockAddedEvent;
  utxosChanged: UtxoChangedEvent;
  transactionObserved: TransactionObservedEvent;
  transactionAcceptanceChanged: TransactionAcceptanceChangedEvent;
  transactionFinalityChanged: TransactionFinalityChangedEvent;
}
