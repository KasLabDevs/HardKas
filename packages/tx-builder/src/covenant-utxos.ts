/*
 * COVENANT-UTXO-PAYMENT-FILTER-1: a UTXO the node lists with a covenant id (KIP-20) belongs to a covenant. Spending it
 * in an ordinary payment ends the covenant: consensus lets an input go without a continuation unless its script forbids
 * it. The pinned kaspa-wasm Generator selects such a UTXO like any other (rusty-kaspa 2.1.0; the upstream guard is not
 * in a release yet), so HardKAS payments, consolidations and fundings never hand it one: a covenant is spent only
 * through its own commands (`hardkas silver covenant …`), which build the continuation.
 */

const IDS = ["covenantId", "covenant_id"] as const;

function idOf(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  const text = typeof value === "string" ? value : typeof (value as { toString?: unknown }).toString === "function" ? String(value) : "";
  return text.trim() === "" ? undefined : text;
}

/**
 * The covenant id a UTXO carries, if any, in every shape HardKAS handles: its own UTXOs and plan inputs
 * (`covenantId`), the node's JSON entries (`utxoEntry.covenantId`, snake case too) and kaspa-wasm references
 * (`entry.covenantId`).
 */
export function covenantIdOf(utxo: unknown): string | undefined {
  if (utxo === null || typeof utxo !== "object") return undefined;
  const u = utxo as Record<string, any>;
  for (const holder of [u, u.utxoEntry, u.entry]) {
    if (holder === null || typeof holder !== "object") continue;
    for (const name of IDS) {
      const id = idOf(holder[name]);
      if (id !== undefined) return id;
    }
  }
  return undefined;
}

/** True when the UTXO belongs to a covenant: an ordinary payment never spends it. */
export function isCovenantUtxo(utxo: unknown): boolean {
  return covenantIdOf(utxo) !== undefined;
}

/** Splits UTXOs into those a payment may spend and those that belong to a covenant, each in the order given. */
export function partitionCovenantUtxos<T>(utxos: readonly T[]): { spendable: T[]; covenant: T[] } {
  const spendable: T[] = [];
  const covenant: T[] = [];
  for (const u of utxos) (isCovenantUtxo(u) ? covenant : spendable).push(u);
  return { spendable, covenant };
}
