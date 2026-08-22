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
