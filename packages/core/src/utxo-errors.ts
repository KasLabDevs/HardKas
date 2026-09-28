export class UtxoSetNotStableError extends Error {
  readonly code = "UTXO_SET_NOT_STABLE";
  readonly address: string;
  readonly utxoCount: number;
  readonly spendableCount: number;
  readonly spendableSompi: string;
  readonly required: string;
  readonly virtualDaaScore: string;

  constructor(opts: {
    address: string;
    utxoCount: number;
    spendableCount: number;
    spendableSompi: string;
    required: string;
    virtualDaaScore: string;
  }) {
    super(
      `UTXO_SET_NOT_STABLE: UTXO set for ${opts.address} did not converge to required spendable amount. ` +
      `spendable=${opts.spendableSompi} required=${opts.required} utxos=${opts.utxoCount} ` +
      `spendable_count=${opts.spendableCount} virtualDaaScore=${opts.virtualDaaScore}`
    );
    this.name = "UtxoSetNotStableError";
    this.address = opts.address;
    this.utxoCount = opts.utxoCount;
    this.spendableCount = opts.spendableCount;
    this.spendableSompi = opts.spendableSompi;
    this.required = opts.required;
    this.virtualDaaScore = opts.virtualDaaScore;
  }
}

/**
 * Demo-ready · E02: planning validity is UTXO-scoped, not virtual-state-scoped. Every planning
 * attempt re-reads the node at its end; an attempt whose selected inputs are no longer in
 * the address UTXO set, or are being spent by a transaction in the observed mempool, is
 * discarded and retried. This error means the bounded retries ran out. The DAG advancing
 * while a plan is built is never a reason for it.
 */
export class SelectedUtxoInvalidatedError extends Error {
  readonly code = "SELECTED_UTXO_INVALIDATED";
  readonly address: string;
  readonly attempts: number;
  /** Selected outpoints (`txId:index`) of the last attempt missing from the re-read UTXO set. */
  readonly missing: string[];
  /** Selected outpoints of the last attempt that the observed mempool showed being spent. */
  readonly pending: string[];
  readonly virtualDaaScore: string;

  constructor(opts: {
    address: string;
    attempts: number;
    missing: string[];
    pending: string[];
    virtualDaaScore: string;
  }) {
    const list = (xs: string[]) => (xs.length > 0 ? xs.join(", ") : "none");
    super(
      `SELECTED_UTXO_INVALIDATED: the inputs selected for ${opts.address} did not survive re-validation in ${opts.attempts} attempts ` +
      `(missing from the UTXO set: ${list(opts.missing)}; being spent in the observed mempool: ${list(opts.pending)}; ` +
      `last read at virtualDaaScore=${opts.virtualDaaScore}). ` +
      `They were spent or are being spent by another transaction: plan again once it is accepted or dropped.`
    );
    this.name = "SelectedUtxoInvalidatedError";
    this.address = opts.address;
    this.attempts = opts.attempts;
    this.missing = opts.missing;
    this.pending = opts.pending;
    this.virtualDaaScore = opts.virtualDaaScore;
  }
}

export class UtxoVirtualStateUnstableError extends Error {
  readonly code = "UTXO_VIRTUAL_STATE_UNSTABLE";
  readonly address: string;
  readonly attempts: number;
  readonly virtualDaaScore: string;

  constructor(opts: {
    address: string;
    attempts: number;
    virtualDaaScore: string;
  }) {
    super(
      `UTXO_VIRTUAL_STATE_UNSTABLE: Virtual state changed during UTXO selection after ${opts.attempts} attempts. ` +
      `address=${opts.address} virtualDaaScore=${opts.virtualDaaScore}. ` +
      `This typically occurs when the DAG has not fully settled after mining.`
    );
    this.name = "UtxoVirtualStateUnstableError";
    this.address = opts.address;
    this.attempts = opts.attempts;
    this.virtualDaaScore = opts.virtualDaaScore;
  }
}
