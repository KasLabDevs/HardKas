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
   * Waits for a target spendable funding amount on the specified address.
   */
  async waitForSpendableFunding(options: {
    address: string;
    minSpendableSompi: bigint;
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

        const { getCoinbaseMaturity } = await import("@hardkas/core");
        // defaultNetwork should be populated by the runner/caller that constructed the SDK.
        const network = this.sdk.config.config.defaultNetwork || "simnet";
        const maturityThreshold = getCoinbaseMaturity(network);

        const spendableUtxos = utxosResult.filter((u: any) => {
          if (!u.isCoinbase) return true; // Normal UTXOs are immediately spendable
          if (u.blockDaaScore === undefined) return false;
          // Add a safety margin to ensure DAG has fully merged the block, preventing "orphan" rejections
          return virtualDaaScore - BigInt(u.blockDaaScore) >= (maturityThreshold + 10n);
        });

        const total = spendableUtxos.reduce((sum: bigint, u: any) => sum + BigInt(u.amountSompi), 0n);

        if (total >= options.minSpendableSompi) {
          return { ok: true, value: spendableUtxos, lastObservedState: { matureValue: total.toString(), virtualDaaScore: virtualDaaScore.toString() } };
        }

        return { ok: false, lastObservedState: { matureValue: total.toString(), required: options.minSpendableSompi.toString(), virtualDaaScore: virtualDaaScore.toString() } };
      },
      "LOCALNET_FUND_MATURITY_TIMEOUT",
      "Timeout waiting for spendable funding",
      options
    );
  }
}
