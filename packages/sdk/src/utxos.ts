import type { Hardkas } from "./index.js";
import { pollCondition, WaitOptions } from "./waiters.js";

export class HardkasUtxos {
  constructor(private readonly sdk: Hardkas) {}

  /**
   * Waits for a normal UTXO to become spendable on the specified address.
   */
  async waitForSpendable(options: {
    address: string;
    outpoint?: { transactionId: string; index: number };
    minAmount?: bigint;
    timeoutMs?: number;
    pollIntervalMs?: number;
    signal?: AbortSignal;
  }) {
    return pollCondition(
      async () => {
        const result = await this.sdk.rpc.getUtxosByAddress(options.address);
        let utxos = result.map((u: any) => u);

        if (options.outpoint) {
          utxos = utxos.filter(
            (u) =>
              u.outpoint.transactionId === options.outpoint!.transactionId &&
              u.outpoint.index === options.outpoint!.index
          );
        }

        if (options.minAmount !== undefined) {
          const total = utxos.reduce((sum, u) => sum + BigInt(u.amountSompi), 0n);
          if (total >= options.minAmount) {
            return { ok: true, value: utxos, lastObservedState: { availableValue: total.toString() } };
          }
          return { ok: false, lastObservedState: { availableValue: total.toString(), required: options.minAmount.toString() } };
        }

        if (utxos.length > 0) {
          return { ok: true, value: utxos, lastObservedState: { count: utxos.length } };
        }

        return { ok: false, lastObservedState: { count: 0 } };
      },
      "UTXO_SPENDABILITY_TIMEOUT",
      "Timeout waiting for spendable UTXOs",
      options
    );
  }

  /**
   * Waits for a coinbase UTXO to mature on the specified address.
   */
  async waitForCoinbaseSpendable(options: {
    address: string;
    minAmount?: bigint;
    timeoutMs?: number;
    pollIntervalMs?: number;
    signal?: AbortSignal;
  }) {
    return pollCondition(
      async () => {
        const [utxosResult, infoResult] = await Promise.all([
          this.sdk.rpc.getUtxosByAddress(options.address),
          this.sdk.rpc.getInfo()
        ]);
        
        const virtualDaaScore = BigInt((infoResult as any).virtualDaaScore || 0);
        
        // Find mature coinbase utxos
        const matureUtxos = utxosResult.filter((u: any) => {
          if (!u.isCoinbase) return false;
          if (u.blockDaaScore === undefined) return false;
          return virtualDaaScore - BigInt(u.blockDaaScore) >= 100n; // Default maturity threshold. (Can be adjusted based on network)
        });

        const total = matureUtxos.reduce((sum: bigint, u: any) => sum + BigInt(u.amountSompi), 0n);

        if (options.minAmount !== undefined) {
          if (total >= options.minAmount) {
            return { ok: true, value: matureUtxos, lastObservedState: { matureValue: total.toString(), virtualDaaScore: virtualDaaScore.toString() } };
          }
          return { ok: false, lastObservedState: { matureValue: total.toString(), required: options.minAmount.toString(), virtualDaaScore: virtualDaaScore.toString() } };
        }

        if (matureUtxos.length > 0) {
          return { ok: true, value: matureUtxos, lastObservedState: { matureCount: matureUtxos.length, virtualDaaScore: virtualDaaScore.toString() } };
        }

        return { ok: false, lastObservedState: { matureCount: 0, virtualDaaScore: virtualDaaScore.toString() } };
      },
      "COINBASE_MATURITY_TIMEOUT",
      "Timeout waiting for coinbase maturity",
      options
    );
  }
}
