import { AddressObservationArtifact, ObservedTransaction, ObservedUtxo } from "@hardkas/artifacts";

export interface AddressObservationSnapshot {
  address: string;
  execution: AddressObservationArtifact["execution"];
  mempool: {
    incoming: ObservedTransaction[];
    outgoing: ObservedTransaction[];
  };
  utxos: ObservedUtxo[];
  totals: {
    mempoolIncomingSompi: bigint;
    acceptedUtxoSompi: bigint;
  };
  virtual: {
    daaScore?: bigint;
  };
  observedAt: Date;
}

export interface HardkasObserveAddressOptions {
  address: string;
  target?: string;
  /**
   * If true, an artifact will always be produced.
   * Default: false
   */
  produceArtifact?: boolean;
}

export interface HardkasObserveWatchOptions extends HardkasObserveAddressOptions {
  pollIntervalMs?: number;
  /**
   * Defines when an artifact should be produced during the watch loop.
   * 'none' (default) - no artifacts
   * 'changes' - produce artifact only when snapshot state changes (ignores observedAt)
   * 'all' - produce artifact on every poll tick
   */
  artifactPolicy?: "none" | "changes" | "all";
  signal?: AbortSignal;
}

export interface HardkasObserveWaitOptions extends HardkasObserveWatchOptions {
  predicate: (snapshot: AddressObservationSnapshot) => boolean;
  timeoutMs?: number;
}

export interface HardkasObserverBackend {
  observeAddress(address: string): Promise<AddressObservationSnapshot>;
}
