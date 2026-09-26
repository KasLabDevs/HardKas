// Wave 2(c) · AUD-19 — pending-spend exclusion with mempool evidence.
//
// Before a UTXO snapshot reaches the planner, every outpoint that the observer's
// node currently shows as being spent by a mempool transaction is excluded. The
// exclusion is tied to ONE mempool observation taken with the snapshot; when that
// observation cannot be made, planning fails closed instead of planning blind.
//
// This is LOCAL orchestration protection: "not in this node's mempool" never means
// "no competing spend exists on the network". The evidence record says so.

export const PENDING_SPEND_GUARANTEE =
  "local-orchestration-only: outpoints spent by transactions in the observer's mempool at the observation point were excluded; absence from that mempool does not prove absence of a competing spend on the network";

export interface PendingSpendEvidence {
  source: "mempool";
  scope: "observer-local";
  address: string;
  /** The observer's virtual DAA score when the snapshot was read (recency anchor), when known. */
  observedAtDaaScore?: string;
  /** Mempool transactions sending FROM `address` that were inspected. */
  sendingEntries: number;
  /** Outpoints (`txId:index`) excluded from coin selection, sorted. */
  excludedOutpoints: string[];
  guarantee: typeof PENDING_SPEND_GUARANTEE;
}

export class PendingSpendEvidenceUnavailableError extends Error {
  readonly code = "PENDING_SPEND_EVIDENCE_UNAVAILABLE";
  readonly cause: unknown;
  constructor(detail: string, cause?: unknown) {
    super(`PENDING_SPEND_EVIDENCE_UNAVAILABLE: ${detail}. Refusing to plan without current mempool evidence (a pending spend could be selected twice).`);
    this.name = "PendingSpendEvidenceUnavailableError";
    this.cause = cause;
  }
}

export class PendingSpendAllExcludedError extends Error {
  readonly code = "PENDING_SPEND_ALL_EXCLUDED";
  readonly evidence: PendingSpendEvidence;
  constructor(evidence: PendingSpendEvidence, candidates: number) {
    super(
      `PENDING_SPEND_ALL_EXCLUDED: all ${candidates} spendable outpoint(s) of ${evidence.address} are being spent by ${evidence.sendingEntries} transaction(s) in the observer's mempool` +
        (evidence.observedAtDaaScore ? ` (observed at DAA ${evidence.observedAtDaaScore})` : "") +
        `; wait for them to be accepted or dropped before planning again.`
    );
    this.name = "PendingSpendAllExcludedError";
    this.evidence = evidence;
  }
}

export interface PendingSpendRpc {
  getMempoolEntriesByAddresses?: (options: { addresses: string[]; includeOrphanPool: boolean; filterTransactionPool: boolean }) => Promise<unknown>;
}

const outpointKeyOf = (prev: any): string | undefined => {
  if (!prev || typeof prev !== "object") return undefined;
  const txId = prev.transactionId ?? prev.txId;
  const index = prev.index ?? prev.outputIndex;
  if (typeof txId !== "string" || index === undefined || index === null) return undefined;
  return `${txId}:${Number(index)}`;
};

/**
 * The outpoints that `address`'s SENDING mempool transactions spend, from a raw
 * `getMempoolEntriesByAddresses` response (receiving entries never exclude anything).
 */
export function derivePendingSpentOutpoints(response: unknown, address: string): { outpoints: Set<string>; sendingEntries: number } {
  const r: any = response;
  const entries: any[] = Array.isArray(r?.entries)
    ? r.entries
    : Array.isArray(r?.getMempoolEntriesByAddressesResponse?.entries)
      ? r.getMempoolEntriesByAddressesResponse.entries
      : Array.isArray(r)
        ? r
        : [];
  const outpoints = new Set<string>();
  let sendingEntries = 0;
  for (const entry of entries) {
    if (entry?.address !== address) continue;
    const sending: any[] = Array.isArray(entry.sending) ? entry.sending : [];
    for (const s of sending) {
      sendingEntries += 1;
      const inputs: any[] = Array.isArray(s?.transaction?.inputs) ? s.transaction.inputs : Array.isArray(s?.inputs) ? s.inputs : [];
      for (const input of inputs) {
        const key = outpointKeyOf(input?.previousOutpoint ?? input?.previous_outpoint);
        if (key) outpoints.add(key);
      }
    }
  }
  return { outpoints, sendingEntries };
}

/**
 * ONE mempool observation for `address`, or a fail-closed refusal
 * (`PENDING_SPEND_EVIDENCE_UNAVAILABLE`) when the node cannot answer or the client
 * cannot ask.
 */
export async function observePendingSpends(
  rpc: PendingSpendRpc,
  address: string,
  observedAtDaaScore?: bigint
): Promise<{ evidence: PendingSpendEvidence; outpoints: Set<string> }> {
  if (typeof rpc?.getMempoolEntriesByAddresses !== "function") {
    throw new PendingSpendEvidenceUnavailableError("the RPC client exposes no getMempoolEntriesByAddresses");
  }
  let response: unknown;
  try {
    response = await rpc.getMempoolEntriesByAddresses({ addresses: [address], includeOrphanPool: false, filterTransactionPool: false });
  } catch (e) {
    throw new PendingSpendEvidenceUnavailableError(`mempool evidence could not be read: ${e instanceof Error ? e.message : String(e)}`, e);
  }
  const { outpoints, sendingEntries } = derivePendingSpentOutpoints(response, address);
  return {
    outpoints,
    evidence: {
      source: "mempool",
      scope: "observer-local",
      address,
      ...(observedAtDaaScore !== undefined ? { observedAtDaaScore: observedAtDaaScore.toString() } : {}),
      sendingEntries,
      excludedOutpoints: Array.from(outpoints).sort(),
      guarantee: PENDING_SPEND_GUARANTEE
    }
  };
}

/** The outpoint key of a HardKAS/RPC UTXO in any of the shapes the toolkits use. */
export function utxoOutpointKey(u: any): string | undefined {
  if (u?.outpoint) return `${u.outpoint.transactionId}:${Number(u.outpoint.index)}`;
  if (typeof u?.id === "string") {
    const parts = u.id.split(":");
    return `${parts.slice(0, -1).join(":")}:${Number(parts[parts.length - 1])}`;
  }
  if (u?.transactionId !== undefined && u?.outputIndex !== undefined) return `${u.transactionId}:${Number(u.outputIndex)}`;
  return undefined;
}
