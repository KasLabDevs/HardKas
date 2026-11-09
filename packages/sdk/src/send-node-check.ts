// INT9 · I-2 (TX-SEND-IDEMPOTENT-3) — what the node already holds of a transaction this workspace has no record of.
//
// A payment with no submission recorded here (sent from another workspace, or its record lost) is never broadcast again
// when the node shows, POSITIVELY, that it already has it:
//   1. its mempool holds the txId (getMempoolEntry)                                   → MEMPOOL
//   2. this workspace's stored looks at the txId, looked at once more, derive acceptance → ACCEPTED | CONFIRMED | FINALIZED
//   3. an output of THIS txId is listed at the address it pays, with the very amount and script the transaction gives
//      that output (the txId commits to its outputs, so such an entry exists only once the virtual chain accepted it)
//                                                                                     → IN_CHAIN
// Nothing is ever concluded from what the node does NOT list. The UTXO index lags behind the chain and the mempool
// (TX-BATCH-1, TX-WAIT-CHAINED-SPEND-1) and an output may have been spent since, so a missing output gives only a false
// negative: the state is NOT_OBSERVED and the broadcast goes ahead — the node judges, and its answer is recorded once.
// A read the node could not answer makes the state UNKNOWN, and the broadcast goes ahead too (documented policy for the
// uncertain case, docs/status/send-routes-security.md). "Inputs not listed" never means "already confirmed".
// Read-only; nothing here sends or records.

import { v1NodeUtxoOf } from "@hardkas/accounts";
import { parseSignedTransactionPayload, type DerivedTxStatus } from "@hardkas/artifacts";

/** The typed states of the pre-broadcast node check. The first five refuse the broadcast (ALREADY_SUBMITTED). */
export type SendNodeCheckState = "MEMPOOL" | "IN_CHAIN" | "ACCEPTED" | "CONFIRMED" | "FINALIZED" | "NOT_OBSERVED" | "UNKNOWN";

export const SEND_NODE_CHECK_HOLDS: ReadonlySet<SendNodeCheckState> = new Set(["MEMPOOL", "IN_CHAIN", "ACCEPTED", "CONFIRMED", "FINALIZED"]);

export type SendNodeCheckRead = {
  check: "mempool" | "observations" | "utxo-outputs";
  result: "found" | "not-found" | "skipped" | "unavailable";
  detail?: string;
};

export type SendNodeEvidence =
  | { kind: "mempool-entry"; isOrphan: boolean; feeSompi?: string }
  | {
      kind: "virtual-chain";
      acceptingBlockHash: string;
      confirmations?: { blue: string; daa?: string; unit: "blue-score" };
      observationArtifactIds: string[];
      policy: string;
    }
  | {
      kind: "utxo-index";
      outputs: Array<{ outpoint: string; address: string; amountSompi: string; blockDaaScore?: string }>;
      virtualDaaScore?: string;
      daaScoreDepth?: string;
    };

export interface SendNodeCheck {
  txId: string;
  state: SendNodeCheckState;
  checks: SendNodeCheckRead[];
  evidence?: SendNodeEvidence;
}

/** One output of the transaction as it will be sent: index, amount, script (hex, no version), and the address it pays. */
export interface SendOutput {
  index: number;
  amountSompi: bigint;
  script: string;
  version?: number;
  address?: string;
}

export interface SendNodeCheckReads {
  txId: string;
  /** null when the node answers "not found"; throws when it cannot answer. */
  mempoolEntry(): Promise<{ isOrphan: boolean; feeSompi?: string } | null>;
  /** The derived state of a fresh look from this workspace's stored looks; undefined when none is stored. */
  storedLooks?(): Promise<DerivedTxStatus | undefined>;
  outputs: readonly SendOutput[];
  /** Raw UTXO entries the node lists at these addresses (one read). */
  utxosAt(addresses: string[]): Promise<unknown[]>;
  virtualDaaScore?(): Promise<bigint | undefined>;
}

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));
const HEX64 = /^[0-9a-f]{64}$/;

/** The transaction's outputs, with the address each pays: the plan's (outputs then change, as the signed check verified), else `addressOf(script)`. */
export function sendOutputsOf(rawTransaction: unknown, plan: any, addressOf?: (script: string, version: number) => string | undefined): SendOutput[] {
  const parsed = parseSignedTransactionPayload(rawTransaction);
  if (!parsed.ok) return [];
  const planAddresses: Array<string | undefined> = [
    ...((Array.isArray(plan?.outputs) ? plan.outputs : []) as any[]).map((o) => (typeof o?.address === "string" ? o.address : undefined)),
    ...(plan?.change && typeof plan.change.address === "string" ? [plan.change.address as string] : [])
  ];
  const versions = versionsOf(rawTransaction);
  const usePlan = planAddresses.length === parsed.outputs.length;
  return parsed.outputs
    .map((o, index): SendOutput | undefined => {
      if (!o.script) return undefined;
      const version = versions[index] ?? 0;
      let address = usePlan ? planAddresses[index] : o.address;
      if (!address && addressOf) {
        try {
          address = addressOf(o.script, version);
        } catch {
          address = undefined;
        }
      }
      return { index, amountSompi: o.amount, script: o.script.toLowerCase(), version, ...(address ? { address } : {}) };
    })
    .filter((o): o is SendOutput => o !== undefined);
}

function versionsOf(rawTransaction: unknown): number[] {
  let tx: any = rawTransaction;
  for (let depth = 0; typeof tx === "string" && depth < 3; depth++) {
    try {
      tx = JSON.parse(tx);
    } catch {
      return [];
    }
  }
  const outputs = tx?.outputs ?? tx?.tx?.inner?.outputs;
  return Array.isArray(outputs) ? outputs.map((o: any) => Number(o?.scriptPublicKey?.version ?? 0)) : [];
}

/** An entry the node lists for `txId:index` is evidence only when it carries the transaction's own amount and script. */
function sameOutput(listed: { amountSompi: bigint; scriptPublicKey: string }, output: SendOutput): boolean {
  if (listed.amountSompi !== output.amountSompi) return false;
  const spk = listed.scriptPublicKey.toLowerCase();
  const versioned = Number(output.version ?? 0).toString(16).padStart(4, "0") + output.script;
  return spk === output.script || spk === versioned;
}

/** The node check, in order mempool → stored looks → UTXO index. Never throws: a read that fails is recorded as unavailable. */
export async function checkWhatTheNodeHolds(reads: SendNodeCheckReads): Promise<SendNodeCheck> {
  const txId = reads.txId.toLowerCase();
  const checks: SendNodeCheckRead[] = [];

  // 1. the mempool, by txId
  let inMempool: { isOrphan: boolean; feeSompi?: string } | undefined;
  try {
    const entry = await reads.mempoolEntry();
    if (entry) {
      checks.push({ check: "mempool", result: "found" });
      inMempool = entry;
    } else {
      checks.push({ check: "mempool", result: "not-found" });
    }
  } catch (e) {
    checks.push({ check: "mempool", result: "unavailable", detail: messageOf(e) });
  }
  const mempoolState = (): SendNodeCheck => ({
    txId,
    state: "MEMPOOL",
    checks,
    evidence: { kind: "mempool-entry", isOrphan: inMempool!.isOrphan === true, ...(inMempool!.feeSompi ? { feeSompi: inMempool!.feeSompi } : {}) }
  });

  // 2. this workspace's stored looks, looked at once more (only when some are stored: no scan from the pruning point
  //    here). Also when the mempool lists it: an acceptance the chain shows is the stronger fact (a node can keep an entry
  //    its virtual chain already accepted, rusty-kaspa #1146; MEMPOOL-CHAIN-PRECEDENCE-FIX-1)
  if (reads.storedLooks) {
    try {
      const derived = await reads.storedLooks();
      if (!derived) {
        checks.push({ check: "observations", result: "skipped", detail: "no look at this txId is stored in this workspace" });
      } else if ((derived.status === "ACCEPTED" || derived.status === "CONFIRMED" || derived.status === "FINALIZED") && derived.acceptingBlockHash) {
        checks.push({ check: "observations", result: "found", detail: derived.reasons.join(" · ") });
        return {
          txId,
          state: derived.status,
          checks,
          evidence: {
            kind: "virtual-chain",
            acceptingBlockHash: derived.acceptingBlockHash,
            ...(derived.confirmations ? { confirmations: derived.confirmations } : {}),
            observationArtifactIds: [...derived.evidence.observationArtifactIds],
            policy: `${derived.policy.policyId} v${derived.policy.policyVersion}`
          }
        };
      } else {
        checks.push({ check: "observations", result: "not-found", detail: `derived ${derived.status}` });
      }
    } catch (e) {
      checks.push({ check: "observations", result: "unavailable", detail: messageOf(e) });
    }
  }
  if (inMempool) return mempoolState();

  // 3. the UTXO index: an output of THIS txId, with its own amount and script, at the address it pays
  const outputs = reads.outputs.filter((o) => typeof o.address === "string" && o.address !== "");
  if (outputs.length === 0) {
    checks.push({ check: "utxo-outputs", result: "skipped", detail: "no output address of the transaction is known" });
  } else {
    try {
      const entries = await reads.utxosAt([...new Set(outputs.map((o) => o.address!))]);
      const byKey = new Map<string, { amountSompi: bigint; scriptPublicKey: string; blockDaaScore?: bigint | undefined }>();
      for (const raw of entries) {
        const n = v1NodeUtxoOf(raw);
        if (n) byKey.set(n.key, { amountSompi: n.utxo.amountSompi, scriptPublicKey: n.utxo.scriptPublicKey, blockDaaScore: n.utxo.blockDaaScore });
      }
      const matched: Array<{ outpoint: string; address: string; amountSompi: string; blockDaaScore?: string }> = [];
      const differing: string[] = [];
      for (const o of outputs) {
        const key = `${txId}:${o.index}`;
        const listed = byKey.get(key);
        if (!listed) continue;
        if (sameOutput(listed, o)) {
          matched.push({
            outpoint: key,
            address: o.address!,
            amountSompi: o.amountSompi.toString(),
            ...(listed.blockDaaScore !== undefined ? { blockDaaScore: listed.blockDaaScore.toString() } : {})
          });
        } else {
          differing.push(key);
        }
      }
      if (matched.length > 0) {
        checks.push({ check: "utxo-outputs", result: "found", detail: `${matched.length} of ${outputs.length} output(s) listed unspent` });
        let virtualDaaScore: bigint | undefined;
        try {
          virtualDaaScore = await reads.virtualDaaScore?.();
        } catch {
          virtualDaaScore = undefined;
        }
        const accepted = matched.map((m) => (m.blockDaaScore !== undefined ? BigInt(m.blockDaaScore) : undefined)).find((d) => d !== undefined);
        return {
          txId,
          state: "IN_CHAIN",
          checks,
          evidence: {
            kind: "utxo-index",
            outputs: matched,
            ...(virtualDaaScore !== undefined ? { virtualDaaScore: virtualDaaScore.toString() } : {}),
            ...(virtualDaaScore !== undefined && accepted !== undefined && virtualDaaScore >= accepted ? { daaScoreDepth: (virtualDaaScore - accepted).toString() } : {})
          }
        };
      }
      if (differing.length > 0) {
        checks.push({
          check: "utxo-outputs",
          result: "unavailable",
          detail: `the node lists ${differing.join(", ")} with another amount or script than this transaction gives it: not evidence either way`
        });
      } else {
        checks.push({ check: "utxo-outputs", result: "not-found", detail: `none of the ${outputs.length} output(s) is listed (the index may lag, or an output was spent since)` });
      }
    } catch (e) {
      checks.push({ check: "utxo-outputs", result: "unavailable", detail: messageOf(e) });
    }
  }

  const state: SendNodeCheckState = checks.some((c) => c.result === "unavailable") ? "UNKNOWN" : "NOT_OBSERVED";
  return { txId, state, checks };
}

/** The refusal's sentence for a positive state. */
export function nodeHoldsSentence(check: SendNodeCheck): string {
  const e = check.evidence;
  switch (check.state) {
    case "MEMPOOL":
      return "the node already holds it in its mempool";
    case "IN_CHAIN": {
      if (e?.kind !== "utxo-index") return "it is already in the chain";
      const first = e.outputs[0]!;
      return (
        `it is already in the chain: the node's UTXO index lists ${e.outputs.length === 1 ? "its output" : `${e.outputs.length} of its outputs`} ` +
        `${e.outputs.map((o) => `${o.outpoint} (${o.amountSompi} sompi to ${o.address})`).join(", ")} unspent, with the amount and script this transaction gives it` +
        (first.blockDaaScore ? ` (accepted at DAA score ${first.blockDaaScore}${e.virtualDaaScore ? `; virtual DAA score ${e.virtualDaaScore}` : ""})` : "") +
        `. Its blue-score confirmations were not measured here`
      );
    }
    case "ACCEPTED":
    case "CONFIRMED":
    case "FINALIZED":
      return e?.kind === "virtual-chain"
        ? `it is already ${check.state}: accepted by chain block ${e.acceptingBlockHash}${e.confirmations ? ` with ${e.confirmations.blue} blue-score confirmations` : ""} (${e.policy}), seen by a look from this workspace's stored observations`
        : `it is already ${check.state}`;
    default:
      return "";
  }
}

export const isHex64 = (s: unknown): s is string => typeof s === "string" && HEX64.test(s);
