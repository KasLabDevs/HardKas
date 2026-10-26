import fs from "node:fs";
import path from "node:path";
import { HardkasSchemas, loadManagedKaspaWasmSync, stripBom } from "@hardkas/core";
import { checkArtifactIdentity } from "@hardkas/artifacts";
import { PENDING_SPEND_GUARANTEE } from "@hardkas/tx-builder";
import { buildV1WasmTransaction, resolveV1PlanFacts, v1EngineError, type V1EngineFacts } from "./v1-engine.js";
import { validateV1Transition, type V1NodeUtxo, type V1ValidationResult } from "./v1-validate.js";
import { gatherV1ContractFacts, gatherV1SuccessorFacts, v1ArgToSil, type SilverCompileRecordLike, type V1ContractFacts } from "./v1-contract-facts.js";

/*
 * F1.6 · what a v1 send checks besides the payment send's own checks (sdk tx.send):
 *  - checkSignedV1AgainstPlan: the signed transaction is the plan's, field by field (version, inputs in order with their
 *    compute budgets, bindings, storage mass, payload, lock time, gas, subnetwork), and the transaction the plan
 *    describes has the signed transaction's id (amounts, scripts and genesis covenant ids included);
 *  - preflightV1Send: read-only, right before the broadcast: each input still unspent at the node, unchanged, not being
 *    spent by a transaction in its mempool, a P2PK input without a covenant id; then F1.4 again with those inputs and the
 *    signed signature scripts.
 * The check narrows the window between checking and sending; it does not close it. A transaction that spends an input
 * in between is the node's to refuse, and that rejection is recorded and never retried.
 */

const HEX64 = /^[0-9a-f]{64}$/;
const SUBNETWORK_NATIVE = "0000000000000000000000000000000000000000";
const fail = v1EngineError;

/** A UTXO as a HardKAS RPC client lists it, as F1.4 compares it (undefined when it has no outpoint). */
export function v1NodeUtxoOf(u: any): { key: string; utxo: V1NodeUtxo } | undefined {
  const o = u?.outpoint ?? u;
  const txId = o?.transactionId ?? o?.transaction_id;
  const index = o?.index ?? o?.outputIndex ?? o?.output_index;
  if (typeof txId !== "string" || index === undefined || index === null) return undefined;
  const e = u?.utxoEntry ?? u?.utxo_entry ?? u;
  let spk = e?.scriptPublicKey ?? e?.script_public_key;
  if (spk && typeof spk === "object") spk = Number(spk.version ?? 0).toString(16).padStart(4, "0") + String(spk.script ?? spk.scriptPublicKey ?? "");
  const covenantId = e?.covenantId ?? e?.covenant_id;
  const daa = e?.blockDaaScore ?? e?.block_daa_score;
  return {
    key: `${txId.toLowerCase()}:${Number(index)}`,
    utxo: {
      amountSompi: BigInt(e?.amountSompi ?? e?.amount ?? 0),
      scriptPublicKey: String(spk ?? "").toLowerCase(),
      ...(covenantId !== undefined && covenantId !== null && String(covenantId) !== "" ? { covenantId: String(covenantId).toLowerCase() } : {}),
      ...(daa !== undefined && daa !== null ? { blockDaaScore: BigInt(daa) } : {}),
      ...(e?.isCoinbase !== undefined || e?.is_coinbase !== undefined ? { isCoinbase: Boolean(e?.isCoinbase ?? e?.is_coinbase) } : {})
    }
  };
}

/** The covenant outpoints a v1 plan spends, with the id and address its inputs declare, sorted by outpoint. */
export function v1CovenantSpendsOf(plan: Record<string, any>): Array<{ outpoint: string; covenantId: string; address: string }> {
  return ((plan.inputs ?? []) as any[])
    .filter((i) => i.kind === "covenant")
    .map((i) => ({ outpoint: `${String(i.outpoint.transactionId).toLowerCase()}:${Number(i.outpoint.index)}`, covenantId: String(i.covenantId).toLowerCase(), address: String(i.address) }))
    .sort((a, b) => (a.outpoint < b.outpoint ? -1 : a.outpoint > b.outpoint ? 1 : 0));
}

function parsePayload(rawTransaction: unknown): any {
  let tx: any = rawTransaction;
  for (let depth = 0; typeof tx === "string" && depth < 3; depth++) {
    try {
      tx = JSON.parse(tx);
    } catch {
      return undefined;
    }
  }
  return tx && Array.isArray(tx.inputs) && Array.isArray(tx.outputs) ? tx : undefined;
}

const num = (v: unknown, fallback = 0): bigint => {
  try {
    return BigInt((v as any) ?? fallback);
  } catch {
    return -1n;
  }
};

export type SignedV1PlanCheck = { ok: true; signatureScripts: string[] } | { ok: false; code: "SIGNED_PLAN_MISMATCH"; reason: string };

/**
 * Is the signed transaction the v1 transaction the plan describes? Field by field first (each difference named), then
 * as a whole: the plan's transaction, built as the engine builds it, must have `signedTxId` (the official id of the
 * signed payload). Neither the id nor the v1 sighash covers the compute budgets or the storage mass, which are compared
 * here one by one.
 */
export function checkSignedV1AgainstPlan(rawTransaction: unknown, plan: Record<string, any>, signedTxId: string): SignedV1PlanCheck {
  const mismatch = (reason: string): SignedV1PlanCheck => ({ ok: false, code: "SIGNED_PLAN_MISMATCH", reason });
  if (plan?.txVersion !== 1) return mismatch("the plan is not a v1 plan");
  const tx = parsePayload(rawTransaction);
  if (!tx) return mismatch("the signed payload is not a JSON transaction with inputs and outputs");
  if (Number(tx.version) !== 1) return mismatch(`the signed transaction is version ${String(tx.version)}, the plan authorizes a version 1 transaction`);
  const inputs: any[] = plan.inputs ?? [];
  const outputs: any[] = plan.outputs ?? [];
  if (tx.inputs.length !== inputs.length) return mismatch(`the signed transaction has ${tx.inputs.length} input(s), the plan ${inputs.length}`);
  const signatureScripts: string[] = [];
  for (const [idx, i] of inputs.entries()) {
    const s = tx.inputs[idx];
    const po = s?.previousOutpoint ?? s?.previous_outpoint ?? {};
    const signedKey = `${String(po.transactionId ?? po.transaction_id).toLowerCase()}:${Number(po.index)}`;
    const plannedKey = `${String(i.outpoint.transactionId).toLowerCase()}:${Number(i.outpoint.index)}`;
    if (signedKey !== plannedKey) return mismatch(`input ${idx} spends ${signedKey}, the plan's input ${idx} is ${plannedKey}`);
    if (num(s.computeBudget ?? s.compute_budget) !== BigInt(i.computeBudget)) {
      return mismatch(`input ${idx} commits a compute budget of ${String(s.computeBudget ?? s.compute_budget ?? 0)}, the plan ${i.computeBudget}`);
    }
    if (num(s.sigOpCount ?? s.sig_op_count) !== 0n) return mismatch(`input ${idx} declares ${String(s.sigOpCount ?? s.sig_op_count)} sig ops; a v1 input declares 0`);
    if (num(s.sequence) !== 0n) return mismatch(`input ${idx} has sequence ${String(s.sequence)}; the plan's transactions use 0`);
    const script = String(s.signatureScript ?? s.signature_script ?? "").toLowerCase();
    if (!/^(?:[0-9a-f]{2})+$/.test(script)) return mismatch(`input ${idx} carries no hex signature script`);
    signatureScripts.push(script);
  }
  if (tx.outputs.length !== outputs.length) return mismatch(`the signed transaction has ${tx.outputs.length} output(s), the plan ${outputs.length}`);
  const groupOf = new Map<number, any>();
  for (const g of (plan.genesisCovenantGroups ?? []) as any[]) for (const oi of g.outputs as number[]) groupOf.set(oi, g);
  for (const [oi, o] of outputs.entries()) {
    const signed = tx.outputs[oi]?.covenant;
    const group = groupOf.get(oi);
    if (!o.covenant && !group) {
      if (signed) return mismatch(`output ${oi} is bound to a covenant in the signed transaction and not in the plan`);
      continue;
    }
    if (!signed) return mismatch(`output ${oi} is bound to a covenant in the plan and not in the signed transaction`);
    const authorizing = o.covenant ? o.covenant.authorizingInput : group.authorizingInput;
    if (Number(signed.authorizingInput ?? signed.authorizing_input) !== authorizing) {
      return mismatch(`output ${oi} is authorized by input ${String(signed.authorizingInput ?? signed.authorizing_input)} in the signed transaction, by input ${authorizing} in the plan`);
    }
    const id = String(signed.covenantId ?? signed.covenant_id ?? "").toLowerCase();
    const plannedId = o.covenant ? o.covenant.covenantId : group.covenantId;
    if (plannedId !== undefined && id !== String(plannedId).toLowerCase()) return mismatch(`output ${oi} is bound to covenant ${id}, the plan to ${plannedId}`);
  }
  if (num(tx.storageMass ?? tx.storage_mass ?? tx.mass) !== BigInt(plan.storageMass)) {
    return mismatch(`the signed transaction commits a storage mass of ${String(tx.storageMass ?? tx.storage_mass ?? tx.mass)}, the plan ${plan.storageMass}`);
  }
  const payload = typeof tx.payload === "string" ? tx.payload.toLowerCase() : "";
  if (payload !== (typeof plan.payload === "string" ? plan.payload.toLowerCase() : "")) return mismatch("the signed transaction's payload is not the plan's");
  if (num(tx.lockTime ?? tx.lock_time) !== 0n) return mismatch(`the signed transaction has lock time ${String(tx.lockTime ?? tx.lock_time)}; the plan's transactions use 0`);
  if (num(tx.gas) !== 0n) return mismatch(`the signed transaction has gas ${String(tx.gas)}; the plan's transactions use 0`);
  const subnetwork = String(tx.subnetworkId ?? tx.subnetwork_id ?? SUBNETWORK_NATIVE).toLowerCase();
  if (subnetwork !== SUBNETWORK_NATIVE) return mismatch(`the signed transaction is for subnetwork ${subnetwork}; the plan's transactions are native`);
  let plannedId: string;
  try {
    plannedId = String(buildV1WasmTransaction(loadManagedKaspaWasmSync(), plan).id).toLowerCase();
  } catch (e) {
    return mismatch(`the transaction the plan describes cannot be built (${e instanceof Error ? e.message : String(e)})`);
  }
  if (!HEX64.test(String(signedTxId)) || plannedId !== String(signedTxId).toLowerCase()) {
    return mismatch(`the plan describes transaction ${plannedId}, the signed payload is transaction ${String(signedTxId)} (an amount, a script or a genesis covenant id differs)`);
  }
  return { ok: true, signatureScripts };
}

/** The node a v1 send checks against, read-only. */
export interface V1PreflightNode {
  readonly networkId: string;
  /** The UTXOs the node lists for these addresses now, by "txid:index". */
  readonly utxosByAddresses: (addresses: readonly string[]) => Promise<ReadonlyMap<string, V1NodeUtxo>>;
  /** The outpoints that transactions in this node's mempool, sending from these addresses, spend. Throws when unknown. */
  readonly pendingSpentOutpoints: (addresses: readonly string[]) => Promise<ReadonlySet<string>>;
  /** The node's virtual DAA score, for the evidence (undefined when it cannot say). */
  readonly virtualDaaScore?: (() => Promise<bigint | undefined>) | undefined;
}

/** What the submission records of the check (TxSubmissionSchema.preflight). */
export interface V1PreflightEvidence {
  readonly observedAtDaaScore?: string;
  readonly inputs: number;
  readonly scope: "observer-local";
  readonly guarantee: string;
}

/**
 * F1.6 · the read-only check right before a v1 broadcast. Codes: INPUT_NOT_UNSPENT, COVENANT_UTXO_NOT_PAYMENT_INPUT,
 * INPUT_DIFFERS_FROM_NODE (amount, script or covenant id), INPUT_PENDING_SPEND, then every F1.4 code (validateV1Transition
 * with the node's inputs and the signed signature scripts; keys are not checked: nothing is signed). Nothing is sent and
 * nothing recorded when it throws.
 */
export async function preflightV1Send(input: {
  readonly plan: Record<string, any>;
  readonly signatureScripts: readonly string[];
  readonly node: V1PreflightNode;
  readonly facts: V1EngineFacts;
}): Promise<{ evidence: V1PreflightEvidence; validation: V1ValidationResult }> {
  const plan = input.plan;
  const inputs: any[] = plan.inputs ?? [];
  const addresses = [...new Set(inputs.map((i) => String(i.address)))];
  let observedAt: bigint | undefined;
  try {
    observedAt = await input.node.virtualDaaScore?.();
  } catch {
    observedAt = undefined;
  }
  const listed = await input.node.utxosByAddresses(addresses);
  const pending = await input.node.pendingSpentOutpoints(addresses);
  inputs.forEach((i, idx) => {
    const key = `${String(i.outpoint.transactionId).toLowerCase()}:${Number(i.outpoint.index)}`;
    const u = listed.get(key);
    if (!u) throw fail("INPUT_NOT_UNSPENT", `input ${idx} (${key}) is not listed unspent by the node`, { input: idx });
    if (i.kind === "p2pk" && u.covenantId !== undefined) {
      throw fail("COVENANT_UTXO_NOT_PAYMENT_INPUT", `input ${idx} (${key}) is a covenant UTXO (${u.covenantId}) at the node; a P2PK input never spends one`, { input: idx });
    }
    if (u.amountSompi !== BigInt(i.amountSompi)) throw fail("INPUT_DIFFERS_FROM_NODE", `input ${idx}: amount ${i.amountSompi} in the plan, ${u.amountSompi} at the node`, { input: idx, field: "amount" });
    if (u.scriptPublicKey.toLowerCase() !== String(i.scriptPublicKey).toLowerCase()) {
      throw fail("INPUT_DIFFERS_FROM_NODE", `input ${idx}: its script differs from the node's`, { input: idx, field: "scriptPublicKey" });
    }
    if ((u.covenantId ?? "") !== (i.covenantId === undefined ? "" : String(i.covenantId).toLowerCase())) {
      throw fail("INPUT_DIFFERS_FROM_NODE", `input ${idx}: covenant id ${i.covenantId ?? "none"} in the plan, ${u.covenantId ?? "none"} at the node`, { input: idx, field: "covenantId" });
    }
    if (pending.has(key)) {
      throw fail("INPUT_PENDING_SPEND", `input ${idx} (${key}) is being spent by a transaction in the node's mempool; nothing was sent`, { input: idx });
    }
  });
  const planFacts = await resolveV1PlanFacts(plan, input.facts);
  const validation = validateV1Transition({
    plan,
    node: { networkId: input.node.networkId, utxos: listed },
    facts: planFacts.contract,
    successor: planFacts.successor,
    signatureScripts: input.signatureScripts
  });
  return {
    evidence: { ...(observedAt !== undefined ? { observedAtDaaScore: observedAt.toString() } : {}), inputs: inputs.length, scope: "observer-local", guarantee: PENDING_SPEND_GUARANTEE },
    validation
  };
}

/**
 * The facts of the contracts a plan names, from this workspace's compile records (`.hardkas/artifacts/silver/`, or the
 * path a reference gives, inside the workspace) reproduced by the pinned silverc. A record is used only when it is the
 * one the reference names (its recomputed contentHash and artifact digest).
 */
export function createWorkspaceV1Facts(options: { readonly workspaceRoot: string; readonly home?: string | undefined }): V1EngineFacts {
  const root = path.resolve(options.workspaceRoot);
  const records = new Map<string, SilverCompileRecordLike>();
  const contracts = new Map<string, Promise<V1ContractFacts>>();
  const recordOf = (ref: { contentHash: string; artifactSha256: string; path?: string }): SilverCompileRecordLike => {
    const cached = records.get(ref.contentHash);
    if (cached) return cached;
    const candidates = [
      ...(typeof ref.path === "string" ? [path.resolve(root, ref.path)] : []),
      path.join(root, ".hardkas", "artifacts", "silver", `silverCompile-${String(ref.contentHash).slice(0, 16)}.json`)
    ].filter((p) => {
      const rel = path.relative(root, p);
      return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
    });
    for (const file of candidates) {
      let record: any;
      try {
        record = JSON.parse(stripBom(fs.readFileSync(file, "utf8")));
      } catch {
        continue;
      }
      const identity = checkArtifactIdentity(record);
      if (record?.schema !== HardkasSchemas.SilverCompileV1 || !identity.ok || identity.artifactId !== ref.contentHash) continue;
      if (record?.provenance?.artifactSha256 !== ref.artifactSha256) continue;
      records.set(ref.contentHash, record);
      return record;
    }
    throw fail("SILVER_RECORD_NOT_FOUND", `no compile record ${ref.contentHash} (artifact ${ref.artifactSha256}) in this workspace verifies as the one the plan names`, {
      compileRecord: ref.contentHash
    });
  };
  return {
    contract: (ref) => {
      const key = `${ref.compileRecord.contentHash}:${ref.contract}:${JSON.stringify(ref.constructorArgs)}`;
      let pending = contracts.get(key);
      if (!pending) {
        pending = (async () =>
          gatherV1ContractFacts({
            record: recordOf(ref.compileRecord as any),
            contractName: ref.contract,
            constructorArgs: (ref.constructorArgs as any[]).map((a, i) => v1ArgToSil(a, `constructorArgs[${i}]`)),
            home: options.home
          }))();
        contracts.set(key, pending);
      }
      return pending;
    },
    successor: async (plan, idx, current) => {
      const declared = ((plan.nextState ?? []) as any[]).find((n) => n.input === idx);
      if (!declared) throw fail("V1_PLAN_INVALID", `input ${idx}: a transition declares the next state of its covenant (nextState)`, { input: idx });
      return gatherV1SuccessorFacts({
        record: recordOf(plan.inputs[idx].contract.compileRecord),
        contractName: current.contractName,
        constructorArgs: current.constructorArgs,
        stateToConstructorArg: declared.successor.stateToConstructorArg,
        nextState: Object.fromEntries(Object.entries(declared.successor.state ?? {}).map(([field, v]) => [field, v1ArgToSil(v as any, `nextState.${field}`)])),
        home: options.home
      });
    }
  };
}
