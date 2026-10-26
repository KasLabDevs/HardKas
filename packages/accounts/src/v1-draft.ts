import { assertMainnetTransactionsDisabled, loadManagedKaspaWasmSync, silverSigFromInputSignature } from "@hardkas/core";
import { calculateContentHash, checkArtifactIdentity, CURRENT_HASH_VERSION, HARDKAS_VERSION } from "@hardkas/artifacts";
import { buildV1WasmTransaction, resolveV1PlanFacts, v1ContractUnlock, v1EngineError, v1SignedArtifact, type V1EngineFacts, type V1EngineNode } from "./v1-engine.js";
import { validateV1Transition, type V1ValidationResult } from "./v1-validate.js";

/*
 * F1.9 · a v1 transaction signed in turns by several parties, without presenting it as a PSKT. The draft is the plan's
 * transaction (bindings and budgets fixed) and its signature slots: each P2PK input and each signer slot of a contract
 * entry, with the account and the public key F1.4 resolved for it. It is prepared once (F1.4 against the node), signed
 * slot by slot (SIGHASH_ALL over the final v1 transaction, the key checked against the slot, F1.3), combined, finalized
 * (every slot signed, each unlock the length the fee was checked for, the final txid the draft's) and sent with F1.6.
 * A draft is an artifact with a contentHash; any change to it, or to the plan it names, refuses it.
 * A signature another party made is not verified here: an invalid one is the node's to refuse (SCRIPT_POLICY_REJECTED).
 */

export const V1_TX_DRAFT_SCHEMA = "hardkas.v1TxDraft";

export interface V1DraftSlot {
  readonly input: number;
  readonly kind: "p2pk" | "contract";
  /** Contract slots: the entry argument and parameter the signature fills. */
  readonly argIndex?: number | undefined;
  readonly param?: string | undefined;
  readonly signer: string;
  /** The x-only key the input or the contract checks this slot against. */
  readonly publicKey: string;
  /** 65 bytes (Schnorr signature + SIGHASH byte), hex, once signed. */
  readonly signature?: string | undefined;
}

export interface V1TxDraft {
  readonly schema: typeof V1_TX_DRAFT_SCHEMA;
  readonly hardkasVersion: string;
  readonly hashVersion: number;
  readonly networkId: string;
  readonly planArtifactId: string;
  /** The id of the plan's transaction (ids do not cover signature scripts, so signing never changes it). */
  readonly txId: string;
  readonly slots: readonly V1DraftSlot[];
  readonly contentHash: string;
}

const fail = v1EngineError;
const HEX130 = /^[0-9a-f]{130}$/;

function seal(draft: Omit<V1TxDraft, "contentHash">): V1TxDraft {
  const body: any = JSON.parse(JSON.stringify(draft));
  delete body.contentHash;
  return { ...body, contentHash: calculateContentHash(body, CURRENT_HASH_VERSION) };
}

/** The draft as sealed, and the plan it names (SILVER_SPEND_DRAFT_INVALID otherwise). */
function checkDraft(draft: V1TxDraft, plan: Record<string, any>): void {
  const body: any = { ...draft };
  delete body.contentHash;
  if (draft?.schema !== V1_TX_DRAFT_SCHEMA || calculateContentHash(body, CURRENT_HASH_VERSION) !== draft.contentHash) {
    throw fail("SILVER_SPEND_DRAFT_INVALID", "the draft is not one HardKAS sealed (its contentHash does not verify)");
  }
  const identity = checkArtifactIdentity(plan);
  if (!identity.ok || identity.artifactId !== draft.planArtifactId) {
    throw fail("SILVER_SPEND_DRAFT_INVALID", `the draft was prepared for plan ${draft.planArtifactId}, not for this one`);
  }
  const k = loadManagedKaspaWasmSync();
  const id = String(buildV1WasmTransaction(k, plan).id);
  if (id !== draft.txId) throw fail("SILVER_SPEND_DRAFT_INVALID", `the draft's transaction is ${draft.txId}; its plan builds ${id}`);
  for (const s of draft.slots) {
    if (s.signature !== undefined && !HEX130.test(s.signature)) throw fail("SILVER_SPEND_DRAFT_INVALID", `input ${s.input}: a slot signature is 65 bytes of hex`);
  }
}

async function validateFor(plan: Record<string, any>, node: V1EngineNode, facts: V1EngineFacts, publicKeyOf?: (account: string) => string | undefined): Promise<V1ValidationResult> {
  const addresses = [...new Set((plan.inputs as any[]).map((i) => String(i.address)))];
  const listed = await node.utxosByAddresses(addresses);
  const planFacts = await resolveV1PlanFacts(plan, facts);
  return validateV1Transition({ plan, node: { networkId: node.networkId, utxos: listed }, facts: planFacts.contract, successor: planFacts.successor, ...(publicKeyOf ? { publicKeyOf } : {}) });
}

/**
 * Prepares a draft: F1.4 against the node now (with each slot's key from the account store, never a private key), and
 * the slots to sign. Nothing is signed.
 */
export async function prepareV1Draft(input: {
  readonly plan: Record<string, any>;
  readonly node: V1EngineNode;
  readonly facts: V1EngineFacts;
  readonly publicKeyOf: (account: string) => string | undefined;
}): Promise<V1TxDraft> {
  const plan = JSON.parse(JSON.stringify(input.plan));
  const identity = checkArtifactIdentity(plan);
  if (!identity.ok) throw fail("V1_PLAN_IDENTITY_INVALID", `the plan's identity does not verify (${identity.issues.map((i) => i.code).join(", ")})`);
  assertMainnetTransactionsDisabled("sign", [plan.networkId, input.node.networkId], "v1 draft");
  const validation = await validateFor(plan, input.node, input.facts, input.publicKeyOf);
  const slots: V1DraftSlot[] = [];
  for (const v of validation.inputs) {
    if (v.kind === "p2pk") slots.push({ input: v.index, kind: "p2pk", signer: v.signer!.account, publicKey: v.signer!.publicKey });
    for (const s of v.contract?.slots ?? []) slots.push({ input: v.index, kind: "contract", argIndex: s.argIndex, param: s.param, signer: s.signer, publicKey: s.publicKey });
  }
  const k = loadManagedKaspaWasmSync();
  return seal({
    schema: V1_TX_DRAFT_SCHEMA,
    hardkasVersion: HARDKAS_VERSION,
    hashVersion: CURRENT_HASH_VERSION,
    networkId: String(plan.networkId),
    planArtifactId: identity.artifactId,
    txId: String(buildV1WasmTransaction(k, plan).id),
    slots
  });
}

/**
 * Signs every slot of `account` with `privateKey` (SIGHASH_ALL over the final v1 transaction the plan describes). The key
 * must be the one each slot is checked against (SIGNER_SLOT_KEY_MISMATCH, nothing signed otherwise).
 */
export function signV1Draft(input: { readonly draft: V1TxDraft; readonly plan: Record<string, any>; readonly account: string; readonly privateKey: string }): V1TxDraft {
  checkDraft(input.draft, input.plan);
  const k = loadManagedKaspaWasmSync();
  const mine = input.draft.slots.filter((s) => s.signer === input.account);
  if (mine.length === 0) throw fail("SILVER_SPEND_SIGNER_NOT_IN_DRAFT", `no slot of the draft is '${input.account}''s`);
  const key = new k.PrivateKey(input.privateKey);
  const xOnly = String(key.toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
  for (const s of mine) {
    if (s.publicKey !== xOnly) {
      throw fail("SIGNER_SLOT_KEY_MISMATCH", `input ${s.input}: this key is not the one ${s.kind === "p2pk" ? "the P2PK output pays to" : `the contract checks '${s.param}' against`}`, { input: s.input });
    }
  }
  const tx = buildV1WasmTransaction(k, input.plan);
  const slots = input.draft.slots.map((s) => {
    if (s.signer !== input.account) return s;
    const inputSignature = String(k.createInputSignature(tx, s.input, key, k.SighashType.All));
    return { ...s, signature: Buffer.from(silverSigFromInputSignature(inputSignature)).toString("hex") };
  });
  const { contentHash: _drop, ...rest } = input.draft;
  return seal({ ...rest, slots });
}

/** Combines drafts signed by different parties: the same draft, every signature kept, none contradicted. */
export function combineV1Drafts(drafts: readonly V1TxDraft[], plan: Record<string, any>): V1TxDraft {
  if (drafts.length === 0) throw fail("SILVER_SPEND_DRAFT_INVALID", "no draft to combine");
  for (const d of drafts) checkDraft(d, plan);
  const shape = (d: V1TxDraft) => JSON.stringify(d.slots.map(({ signature: _s, ...slot }) => slot));
  const first = drafts[0]!;
  if (drafts.some((d) => d.txId !== first.txId || d.planArtifactId !== first.planArtifactId || shape(d) !== shape(first))) {
    throw fail("SILVER_SPEND_DRAFT_INVALID", "the drafts are not of the same transaction and slots");
  }
  const slots = first.slots.map((s, i) => {
    const signatures = [...new Set(drafts.map((d) => d.slots[i]!.signature).filter((x): x is string => x !== undefined))];
    if (signatures.length > 1) throw fail("SILVER_SPEND_DRAFT_INVALID", `input ${s.input}: two different signatures for one slot`);
    return signatures.length === 1 ? { ...s, signature: signatures[0] } : s;
  });
  const { contentHash: _drop, ...rest } = first;
  return seal({ ...rest, slots });
}

/**
 * Finalizes a fully signed draft into the signed artifact (hardkas.signedTx, txVersion 1), the same one the engine makes
 * with every key at hand: every slot signed (SILVER_SPEND_SIGNATURE_MISSING), each contract unlock the length the fee
 * was checked for (SILVER_SPEND_UNLOCK_SIZE_CHANGED), the final txid the draft's (SILVER_SPEND_DRAFT_INVALID). F1.4 runs
 * again against the node (no key).
 */
export async function finalizeV1Draft(input: {
  readonly draft: V1TxDraft;
  readonly plan: Record<string, any>;
  readonly node: V1EngineNode;
  readonly facts: V1EngineFacts;
}): Promise<{ signed: Record<string, any>; txId: string; rpcTransaction: any; signatureScripts: string[] }> {
  checkDraft(input.draft, input.plan);
  const missing = input.draft.slots.filter((s) => s.signature === undefined);
  if (missing.length > 0) {
    throw fail("SILVER_SPEND_SIGNATURE_MISSING", `unsigned slot(s): ${missing.map((s) => `input ${s.input}${s.param ? ` '${s.param}'` : ""} (${s.signer})`).join(", ")}`);
  }
  const validation = await validateFor(input.plan, input.node, input.facts);
  const scripts = validation.inputs.map((v) => {
    const slots = input.draft.slots.filter((s) => s.input === v.index);
    if (v.kind === "p2pk") return `41${slots[0]!.signature}`;
    const sigs = new Map<number, Uint8Array>(slots.map((s) => [s.argIndex!, Uint8Array.from(Buffer.from(s.signature!, "hex"))]));
    return v1ContractUnlock(v.index, v, sigs);
  });
  const k = loadManagedKaspaWasmSync();
  const tx = buildV1WasmTransaction(k, input.plan, scripts);
  if (String(tx.id) !== input.draft.txId) throw fail("SILVER_SPEND_DRAFT_INVALID", `the finalized transaction is ${String(tx.id)}, the draft's ${input.draft.txId}`);
  const { signed, txId, rpcTransaction } = v1SignedArtifact(input.plan, tx);
  return { signed, txId, rpcTransaction, signatureScripts: scripts };
}
