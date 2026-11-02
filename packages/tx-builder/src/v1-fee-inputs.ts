import { filterMatureUtxos } from "./kaspa-wallet-adapter.js";
import { covenantIdOf } from "./covenant-utxos.js";
import { v1PlanError } from "./v1-plan.js";

/*
 * F1.7 · the funder's P2PK coins that pay a v1 transaction's fee (a transition need not take it from the covenant's
 * value). The choice is HardKAS's and deterministic: the kaspa-wasm 2.1.0 Generator neither takes a compute budget per
 * input (IGeneratorSettingsObject) nor builds v1 transactions, so it cannot be used here until upstream generates v1.
 * A coin is a candidate only when it is mature (the SDK's coinbase maturity for the network), carries no covenant id
 * (it would end a covenant) and is not being spent by a transaction in the node's mempool. Candidates are taken by
 * amount (largest first), then by outpoint, until the target is covered. The same coins give the same selection,
 * whatever order the node listed them in.
 */

export interface V1FeeCoin {
  readonly outpoint: { readonly transactionId: string; readonly index: number };
  readonly amountSompi: bigint;
  /** "<2-byte version><script>" hex, as the node lists it. */
  readonly scriptPublicKey: string;
  readonly blockDaaScore?: bigint | undefined;
  readonly isCoinbase?: boolean | undefined;
  readonly covenantId?: string | undefined;
}

export interface V1FeeSelection {
  readonly selected: readonly V1FeeCoin[];
  readonly totalSompi: bigint;
  /** Why each listed coin was left out (never chosen): "covenant", "immature" or "pending". */
  readonly excluded: ReadonlyArray<{ readonly outpoint: string; readonly reason: "covenant" | "immature" | "pending" }>;
}

const keyOf = (c: V1FeeCoin) => `${c.outpoint.transactionId.toLowerCase()}:${c.outpoint.index}`;

/**
 * The coins that cover `targetSompi` (the fee plus the smallest change the caller accepts). V1_FEE_INPUTS_INSUFFICIENT
 * when the candidates do not reach it.
 */
export function selectV1FeeInputs(input: {
  readonly networkId: string;
  readonly virtualDaaScore: bigint;
  readonly coins: readonly V1FeeCoin[];
  /** Outpoints ("txid:index") transactions in the node's mempool are spending (observePendingSpends). */
  readonly pendingOutpoints: ReadonlySet<string>;
  readonly targetSompi: bigint;
}): V1FeeSelection {
  const excluded: Array<{ outpoint: string; reason: "covenant" | "immature" | "pending" }> = [];
  const free = input.coins.filter((c) => {
    if (covenantIdOf(c) !== undefined) {
      excluded.push({ outpoint: keyOf(c), reason: "covenant" });
      return false;
    }
    if (input.pendingOutpoints.has(keyOf(c))) {
      excluded.push({ outpoint: keyOf(c), reason: "pending" });
      return false;
    }
    return true;
  });
  const { mature, immature } = filterMatureUtxos<V1FeeCoin>({
    networkId: input.networkId,
    virtualDaaScore: input.virtualDaaScore,
    utxos: free,
    readEntry: (c: V1FeeCoin) => ({ blockDaaScore: BigInt(c.blockDaaScore ?? 0), isCoinbase: Boolean(c.isCoinbase) })
  });
  for (const c of immature) excluded.push({ outpoint: keyOf(c), reason: "immature" });
  const ordered = [...mature].sort((a, b) => (a.amountSompi !== b.amountSompi ? (a.amountSompi > b.amountSompi ? -1 : 1) : keyOf(a) < keyOf(b) ? -1 : keyOf(a) > keyOf(b) ? 1 : 0));
  const selected: V1FeeCoin[] = [];
  let total = 0n;
  for (const c of ordered) {
    if (total >= input.targetSompi) break;
    selected.push(c);
    total += c.amountSompi;
  }
  if (total < input.targetSompi) {
    throw v1PlanError(
      "V1_FEE_INPUTS_INSUFFICIENT",
      `the funder's spendable coins (mature, no covenant id, not pending) add up to ${total} sompi; ${input.targetSompi} are needed for the fee and the change`,
      { availableSompi: String(total), neededSompi: String(input.targetSompi), excluded: excluded.length }
    );
  }
  excluded.sort((a, b) => (a.outpoint < b.outpoint ? -1 : a.outpoint > b.outpoint ? 1 : 0));
  return { selected, totalSompi: total, excluded };
}
