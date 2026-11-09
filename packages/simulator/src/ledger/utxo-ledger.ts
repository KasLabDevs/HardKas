import type { SimulatorUtxo } from "../types.js";

/**
 * rusty-kaspa v2.1.0 coinbase maturity at 10 BPS: `Bps::<10>::coinbase_maturity()` = 10 × 100 s = 1000 DAA
 * (consensus/core/src/config/bps.rs:119-121, params.rs:742; same value for mainnet, testnet-10 and simnet).
 * A coinbase output is spendable at virtual DAA score >= its block DAA score + this value.
 */
export const DEFAULT_COINBASE_MATURITY = 1000n;

export class UtxoLedger {
  private utxosByOutpoint = new Map<string, SimulatorUtxo>();
  private outpointsByAddress = new Map<string, Set<string>>();

  constructor(private readonly coinbaseMaturity: bigint = DEFAULT_COINBASE_MATURITY) {}

  public static outpointKey(txId: string, index: number): string {
    return `${txId.toLowerCase()}:${index}`;
  }

  /**
   * Adds a UTXO. A UTXO created by an output with a covenant binding carries that binding's covenant id
   * (UtxoEntry.covenant_id): it is recorded as `covenantId`, which is what continuation/genesis classification and
   * OpInputCovenantId read.
   */
  public addUtxo(utxo: SimulatorUtxo): void {
    const key = UtxoLedger.outpointKey(utxo.transactionId, utxo.index);
    const covenantId = utxo.covenantId ?? utxo.covenant?.covenantId;
    const stored: SimulatorUtxo =
      covenantId !== undefined && utxo.covenantId !== covenantId.toLowerCase()
        ? { ...utxo, covenantId: covenantId.toLowerCase() }
        : utxo;
    this.utxosByOutpoint.set(key, stored);

    let addressSet = this.outpointsByAddress.get(utxo.address);
    if (!addressSet) {
      addressSet = new Set<string>();
      this.outpointsByAddress.set(utxo.address, addressSet);
    }
    addressSet.add(key);
  }

  public spendUtxo(txId: string, index: number): SimulatorUtxo | undefined {
    const key = UtxoLedger.outpointKey(txId, index);
    const existing = this.utxosByOutpoint.get(key);
    if (!existing) return undefined;

    this.utxosByOutpoint.delete(key);
    const addressSet = this.outpointsByAddress.get(existing.address);
    if (addressSet) {
      addressSet.delete(key);
      if (addressSet.size === 0) {
        this.outpointsByAddress.delete(existing.address);
      }
    }
    return existing;
  }

  public getUtxo(txId: string, index: number): SimulatorUtxo | undefined {
    return this.utxosByOutpoint.get(UtxoLedger.outpointKey(txId, index));
  }

  public hasUtxo(txId: string, index: number): boolean {
    return this.utxosByOutpoint.has(UtxoLedger.outpointKey(txId, index));
  }

  public isSpendable(utxo: SimulatorUtxo, currentDaaScore: bigint): boolean {
    if (!utxo.isCoinbase) return true;
    return currentDaaScore >= utxo.blockDaaScore + this.coinbaseMaturity;
  }

  public getUtxosByAddress(
    address: string,
    currentDaaScoreOrFilter?: bigint | boolean,
    currentDaaScore?: bigint
  ): SimulatorUtxo[] {
    let filterSpendable = false;
    let score = currentDaaScore;
    if (typeof currentDaaScoreOrFilter === "bigint") {
      filterSpendable = true;
      score = currentDaaScoreOrFilter;
    } else if (typeof currentDaaScoreOrFilter === "boolean") {
      filterSpendable = currentDaaScoreOrFilter;
    }

    const keys = this.outpointsByAddress.get(address);
    if (!keys) return [];

    const result: SimulatorUtxo[] = [];
    for (const key of keys) {
      const u = this.utxosByOutpoint.get(key);
      if (u) {
        if (!filterSpendable || score === undefined || this.isSpendable(u, score)) {
          result.push(u);
        }
      }
    }
    return result;
  }

  public getUtxosByAddresses(
    addresses: string[],
    currentDaaScoreOrFilter?: bigint | boolean,
    currentDaaScore?: bigint
  ): SimulatorUtxo[] {
    const all: SimulatorUtxo[] = [];
    for (const addr of addresses) {
      all.push(...this.getUtxosByAddress(addr, currentDaaScoreOrFilter, currentDaaScore));
    }
    return all;
  }

  public getBalance(address: string, currentDaaScore?: bigint): bigint {
    const utxos = this.getUtxosByAddress(address, currentDaaScore);
    return utxos.reduce((acc, u) => acc + u.amountSompi, 0n);
  }

  public getAllUtxos(): SimulatorUtxo[] {
    return Array.from(this.utxosByOutpoint.values());
  }

  public getTotalSupply(): bigint {
    let total = 0n;
    for (const u of this.utxosByOutpoint.values()) {
      total += u.amountSompi;
    }
    return total;
  }

  public clone(): UtxoLedger {
    const next = new UtxoLedger(this.coinbaseMaturity);
    for (const utxo of this.utxosByOutpoint.values()) {
      next.addUtxo({ ...utxo });
    }
    return next;
  }

  public clear(): void {
    this.utxosByOutpoint.clear();
    this.outpointsByAddress.clear();
  }

  public restoreFrom(utxos: ReadonlyArray<SimulatorUtxo>): void {
    this.utxosByOutpoint.clear();
    this.outpointsByAddress.clear();
    for (const u of utxos) {
      this.addUtxo({ ...u });
    }
  }
}
