import fs from "node:fs";
import path from "node:path";
import { HardkasError, HardkasSchemas, kaspaCovenantId, stripBom } from "@hardkas/core";
import { checkArtifactIdentity, enumerateWorkspaceArtifactsSync, submitOutcomeOf } from "@hardkas/artifacts";

/*
 * V1-ENGINE-2 · a covenant's history and lineage, from what this workspace recorded. The node has no query by covenant
 * id (no such RPC): a covenant is followed through its own outpoints, the addresses its outputs went to and this
 * workspace's artifacts — the v1 plans, signed transactions and submissions of the engine, and the covenant records of
 * `hardkas silver covenant`. The lineage is anchored by recomputing the genesis covenant id (consensus covenant_id) from
 * the genesis transaction itself, linked by outpoints, and its tip checked against the node's unspent outputs at those
 * addresses. Transactions this workspace did not record are not seen; their effect is (an expected output not listed).
 */

export const COVENANT_LINEAGE_SCOPE =
  "Reconstructed from this workspace's own records (v1 plans, signed transactions and submissions; `hardkas silver covenant` records), " +
  "anchored by recomputing the genesis covenant id, linked by outpoints, and checked against the node's unspent outputs at the covenant's addresses. " +
  "The node has no query by covenant id: a transaction this workspace did not record is not seen, only its effect (an output expected unspent is not listed).";

/** An output a transaction bound to the covenant. */
export interface CovenantLineageOutput {
  /** "txid:index" */
  readonly outpoint: string;
  readonly address: string;
  readonly amountSompi: bigint;
  /** "vvvv" + script, hex */
  readonly scriptPublicKey?: string | undefined;
  /** The state the transaction declared for it (field → value, the plan's or the record's), when one was declared. */
  readonly declaredState?: Readonly<Record<string, unknown>> | undefined;
  /** How the declared state can be checked against the address: the contract of the plan, or the compile record of the state. */
  readonly stateSource?:
    | { readonly kind: "v1-contract"; readonly contract: any; readonly state?: Readonly<Record<string, unknown>> | undefined }
    | { readonly kind: "silver-compile-record"; readonly compileRecord: { readonly path?: string; readonly contentHash: string; readonly artifactSha256?: string }; readonly contract: string }
    | undefined;
}

/** One transaction of a covenant, as this workspace recorded it. */
export interface CovenantLineageTx {
  readonly txId: string;
  readonly kind: "genesis" | "transition";
  /** The records it comes from: the engine's signed artifact, a `hardkas silver covenant` record, or both. */
  readonly sources: ReadonlyArray<{ readonly kind: "v1-signed" | "silver-record"; readonly artifactId: string }>;
  /** The covenant outpoints of this covenant it spends ("txid:index"). */
  readonly spends: readonly string[];
  readonly outputs: readonly CovenantLineageOutput[];
  /** A genesis: the authorizing input's outpoint (absent when the record does not hold the genesis transaction). */
  readonly anchor?: { readonly transactionId: string; readonly index: number } | undefined;
  /** A genesis recorded by `silver covenant genesis --wait`: the covenant id the node reported for its output. */
  readonly covenantIdFromNode?: string | undefined;
  /** What this workspace knows of its fate: its submission's recorded outcome, else the record's status. */
  readonly recorded: "accepted" | "rejected" | "unknown" | "confirmed" | "submitted" | "not-submitted";
}

export interface CovenantLineageSkeleton {
  readonly covenantId: string;
  readonly genesis?: (CovenantLineageTx & { readonly anchorCheck: "verified" | "mismatch" | "unverifiable" }) | undefined;
  /** The transitions of the chain, in order (each spends outputs of an earlier one, or is a gap). */
  readonly transitions: readonly CovenantLineageTx[];
  /** Transitions the node rejected (final): kept as history, not part of the chain. */
  readonly rejected: readonly CovenantLineageTx[];
  /** Transactions signed here but never submitted: not part of the chain (their outputs do not exist). */
  readonly unsent: readonly CovenantLineageTx[];
  /** The outputs no recorded (non-rejected) transaction of the chain spends: where the covenant should live. */
  readonly tip: ReadonlyArray<CovenantLineageOutput & { readonly createdBy: string }>;
  readonly findings: readonly string[];
}

const COVENANT_ID = /^[0-9a-f]{64}$/;
const okId = (a: unknown) => {
  const c = checkArtifactIdentity(a as any);
  return c.ok ? c.artifactId : undefined;
};
const key = (o: { transactionId: string; index: number }) => `${String(o.transactionId).toLowerCase()}:${Number(o.index)}`;

export function assertCovenantId(covenantId: string): string {
  const id = String(covenantId ?? "").toLowerCase();
  if (!COVENANT_ID.test(id)) throw new HardkasError("COVENANT_ID_INVALID", `'${covenantId}' is not a covenant id (32 bytes, hex)`);
  return id;
}

/** The covenant records `hardkas silver covenant` wrote (`.hardkas/artifacts/silver/`), each with a verified identity. */
function silverCovenantRecords(workspaceRoot: string): Array<{ record: any; artifactId: string }> {
  const dir = path.join(workspaceRoot, ".hardkas", "artifacts", "silver");
  let names: string[] = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  const out: Array<{ record: any; artifactId: string }> = [];
  for (const n of names.sort()) {
    let record: any;
    try {
      record = JSON.parse(stripBom(fs.readFileSync(path.join(dir, n), "utf8")));
    } catch {
      continue;
    }
    if (record?.schema !== HardkasSchemas.SilverCovenantV1) continue;
    const artifactId = okId(record);
    if (artifactId) out.push({ record, artifactId });
  }
  return out;
}

/**
 * Every transaction of `covenantId` this workspace recorded (only artifacts whose identity verifies count): the engine's
 * v1 signed transactions (with their plans and submissions) and the `hardkas silver covenant` records, merged by txid.
 */
export function collectCovenantTransactions(workspaceRoot: string, covenantId: string): CovenantLineageTx[] {
  const id = assertCovenantId(covenantId);
  const entries = enumerateWorkspaceArtifactsSync(workspaceRoot);
  const plans = new Map<string, any>();
  const outcomes = new Map<string, Set<string>>();
  const signed: Array<{ artifact: any; artifactId: string }> = [];
  for (const e of entries) {
    const a: any = e.artifact;
    const artifactId = okId(a);
    if (!artifactId) continue;
    if (a.schema === HardkasSchemas.TxPlan && a.txVersion === 1) plans.set(artifactId, a);
    else if (a.schema === "hardkas.signedTx" && a.txVersion === 1) signed.push({ artifact: a, artifactId });
    else if (a.schema === HardkasSchemas.TxSubmissionV1 && typeof a.txId === "string") {
      const set = outcomes.get(a.txId.toLowerCase()) ?? new Set<string>();
      set.add(submitOutcomeOf(a.submitResult));
      outcomes.set(a.txId.toLowerCase(), set);
    }
  }
  const outcomeOf = (txId: string): CovenantLineageTx["recorded"] => {
    const set = outcomes.get(txId);
    if (!set) return "not-submitted";
    return set.has("accepted") ? "accepted" : set.has("unknown") ? "unknown" : "rejected";
  };

  const byTx = new Map<string, CovenantLineageTx>();
  for (const { artifact: s, artifactId } of signed) {
    let tx: any;
    try {
      tx = JSON.parse(String(s.signedTransaction?.payload ?? ""));
    } catch {
      continue;
    }
    const plan = plans.get(String(s.lineage?.parentArtifactId ?? ""));
    if (!plan || !Array.isArray(tx?.inputs) || !Array.isArray(tx?.outputs)) continue;
    const bound = (tx.outputs as any[]).map((o, k) => ({ o, k })).filter(({ o }) => String(o?.covenant?.covenantId ?? "").toLowerCase() === id);
    const spends = (plan.inputs as any[])
      .map((i, n) => ({ i, n }))
      .filter(({ i }) => String(i?.covenantId ?? "").toLowerCase() === id)
      .map(({ n }) => key(tx.inputs[n].previousOutpoint));
    if (bound.length === 0 && spends.length === 0) continue;
    const txId = String(s.txId).toLowerCase();
    const authorizing = bound.length > 0 ? Number(bound[0]!.o.covenant.authorizingInput) : undefined;
    const isGenesis = bound.length > 0 && String(plan.inputs[authorizing!]?.covenantId ?? "").toLowerCase() !== id;
    const outputs: CovenantLineageOutput[] = bound.map(({ o, k }) => {
      const spk = `${Number(o.scriptPublicKey?.version ?? 0).toString(16).padStart(4, "0")}${String(o.scriptPublicKey?.scriptPublicKey ?? "")}`;
      const declared = declaredStateOf(plan, k, id);
      return {
        outpoint: `${txId}:${k}`,
        address: String(plan.outputs[k]?.address ?? ""),
        amountSompi: BigInt(o.amount),
        scriptPublicKey: spk,
        ...(declared.state !== undefined ? { declaredState: declared.state } : {}),
        ...(declared.source ? { stateSource: declared.source } : {})
      };
    });
    byTx.set(txId, {
      txId,
      kind: isGenesis ? "genesis" : "transition",
      sources: [{ kind: "v1-signed", artifactId }],
      spends,
      outputs,
      ...(isGenesis ? { anchor: { transactionId: String(tx.inputs[authorizing!].previousOutpoint.transactionId).toLowerCase(), index: Number(tx.inputs[authorizing!].previousOutpoint.index) } } : {}),
      recorded: outcomeOf(txId)
    });
  }

  for (const { record: r, artifactId } of silverCovenantRecords(workspaceRoot)) {
    if (String(r.covenantId ?? "").toLowerCase() !== id || typeof r.txId !== "string") continue;
    const txId = r.txId.toLowerCase();
    const output: CovenantLineageOutput = {
      outpoint: key(r.outpoint),
      address: String(r.address),
      amountSompi: BigInt(r.valueSompi),
      ...(r.lockingScript ? { scriptPublicKey: `${Number(r.lockingScript.version).toString(16).padStart(4, "0")}${r.lockingScript.script}` } : {}),
      ...(r.compileRecord ? { stateSource: { kind: "silver-compile-record" as const, compileRecord: r.compileRecord, contract: String(r.contract) } } : {})
    };
    const known = byTx.get(txId);
    if (known) {
      // the same transaction from the engine's artifacts: the record adds its source and what the node reported
      byTx.set(txId, {
        ...known,
        sources: [...known.sources, { kind: "silver-record", artifactId }],
        outputs: known.outputs.map((o) => (o.outpoint === output.outpoint && !o.stateSource ? { ...o, stateSource: output.stateSource } : o)),
        ...(r.covenantIdFromNode ? { covenantIdFromNode: String(r.covenantIdFromNode).toLowerCase() } : {}),
        recorded: known.recorded === "not-submitted" ? (r.status === "confirmed" ? "confirmed" : "submitted") : known.recorded
      });
      continue;
    }
    byTx.set(txId, {
      txId,
      kind: r.kind === "genesis" ? "genesis" : "transition",
      sources: [{ kind: "silver-record", artifactId }],
      spends: r.kind === "transition" && r.previous?.outpoint ? [key(r.previous.outpoint)] : [],
      outputs: [output],
      ...(r.covenantIdFromNode ? { covenantIdFromNode: String(r.covenantIdFromNode).toLowerCase() } : {}),
      recorded: outcomes.has(txId) ? outcomeOf(txId) : r.status === "confirmed" ? "confirmed" : "submitted"
    });
  }
  return [...byTx.values()];
}

/** The state a v1 plan declared for its output `k` bound to covenant `id`, and the contract to check it with. */
function declaredStateOf(plan: any, k: number, id: string): { state?: Record<string, unknown>; source?: CovenantLineageOutput["stateSource"] } {
  for (const n of (plan.nextState ?? []) as any[]) {
    if (String(n?.covenantId ?? "").toLowerCase() !== id || !Array.isArray(n.outputs)) continue;
    const j = n.outputs.indexOf(k);
    if (j < 0) continue;
    const contract = plan.inputs?.[n.input]?.contract;
    const state = Array.isArray(n.states) ? n.states[j] : n.successor?.state;
    return { ...(state ? { state } : {}), ...(contract && state ? { source: { kind: "v1-contract" as const, contract, state } } : {}) };
  }
  for (const g of (plan.genesisCovenantGroups ?? []) as any[]) {
    const j = Array.isArray(g?.outputs) ? g.outputs.indexOf(k) : -1;
    if (j < 0 || !g.contract) continue;
    const state = Array.isArray(g.states) ? g.states[j] : undefined;
    return { ...(state ? { state } : {}), source: { kind: "v1-contract" as const, contract: g.contract, ...(state ? { state } : {}) } };
  }
  return {};
}

/**
 * The lineage of a covenant from its recorded transactions: the genesis anchored by its recomputed covenant id, the
 * transitions linked by the outpoints they spend, the node's final rejections set apart, the tip (outputs nothing
 * recorded spends), and every gap, conflict or unverifiable point as a finding. Pure: no node, no keys.
 */
export function reconstructCovenantLineage(covenantId: string, txs: readonly CovenantLineageTx[]): CovenantLineageSkeleton {
  const id = assertCovenantId(covenantId);
  const findings: string[] = [];
  const rejected = txs.filter((t) => t.recorded === "rejected");
  const unsent = txs.filter((t) => t.recorded === "not-submitted");
  const live = txs.filter((t) => t.recorded !== "rejected" && t.recorded !== "not-submitted");
  for (const t of live) {
    if (t.recorded === "unknown") findings.push(`${t.kind} ${t.txId}: the outcome of its submission is unknown (the node may hold it); observe it before building another transaction`);
  }
  const geneses = live.filter((t) => t.kind === "genesis");
  if (geneses.length === 0) findings.push("no genesis of this covenant is recorded in this workspace: the lineage has no verified anchor");
  if (geneses.length > 1) findings.push(`${geneses.length} geneses are recorded for one covenant id (${geneses.map((g) => g.txId).join(", ")})`);
  let genesis: CovenantLineageSkeleton["genesis"];
  if (geneses.length >= 1) {
    const g = geneses[0]!;
    let anchorCheck: "verified" | "mismatch" | "unverifiable" = "unverifiable";
    if (g.anchor && g.outputs.every((o) => o.scriptPublicKey)) {
      const recomputed = kaspaCovenantId(
        g.anchor,
        g.outputs.map((o) => ({
          index: Number(o.outpoint.split(":")[1]),
          value: o.amountSompi,
          scriptPublicKey: { version: parseInt(o.scriptPublicKey!.slice(0, 4), 16), script: o.scriptPublicKey!.slice(4) }
        }))
      );
      anchorCheck = recomputed === id ? "verified" : "mismatch";
      if (anchorCheck === "mismatch") findings.push(`the genesis ${g.txId} does not give this covenant id: its anchor and outputs give ${recomputed}`);
    } else {
      findings.push(
        `the genesis ${g.txId} is known from a record that does not hold its transaction: its covenant id cannot be recomputed here` +
          (g.covenantIdFromNode ? ` (the node reported ${g.covenantIdFromNode === id ? "this" : "another"} covenant id for its output when it was recorded)` : "")
      );
      if (g.covenantIdFromNode && g.covenantIdFromNode !== id) findings.push(`the node reported covenant id ${g.covenantIdFromNode} for the genesis output ${g.outputs[0]?.outpoint}`);
    }
    genesis = { ...g, anchorCheck };
  }

  // outputs of the chain, and who spends each
  const created = new Map<string, { tx: CovenantLineageTx; output: CovenantLineageOutput }>();
  for (const t of live) for (const o of t.outputs) created.set(o.outpoint, { tx: t, output: o });
  const spentBy = new Map<string, string[]>();
  for (const t of live) for (const s of t.spends) spentBy.set(s, [...(spentBy.get(s) ?? []), t.txId]);
  for (const [outpoint, spenders] of spentBy) {
    if (spenders.length > 1) findings.push(`${outpoint} is spent by ${spenders.length} recorded transactions (${spenders.join(", ")}): the consensus accepts at most one`);
  }

  // transitions in chain order: a transition after the transactions that created what it spends
  const transitions: CovenantLineageTx[] = [];
  const placed = new Set<string>(genesis ? [genesis.txId] : []);
  const pending = live.filter((t) => t.kind === "transition");
  while (pending.length > 0) {
    const i = pending.findIndex((t) => t.spends.every((s) => !created.has(s) || placed.has(created.get(s)!.tx.txId)));
    const next = pending.splice(i >= 0 ? i : 0, 1)[0]!;
    for (const s of next.spends) {
      if (!created.has(s)) findings.push(`transition ${next.txId} spends ${s}, which no recorded transaction of this covenant created (a gap in this workspace's records)`);
    }
    transitions.push(next);
    placed.add(next.txId);
  }

  const tip = [...created.entries()].filter(([outpoint]) => !spentBy.has(outpoint)).map(([, v]) => ({ ...v.output, createdBy: v.tx.txId }));
  return { covenantId: id, ...(genesis ? { genesis } : {}), transitions, rejected, unsent, tip, findings };
}
