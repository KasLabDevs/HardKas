import {
  assertMainnetTransactionsDisabled,
  encodeSilverEntryArgs,
  loadManagedKaspaWasmSync,
  silverSigFromInputSignature,
  silverUnlockScript,
  type SilArtifactValue
} from "@hardkas/core";
import { calculateContentHash, checkArtifactIdentity, createLineageTransition, CURRENT_HASH_VERSION, HARDKAS_VERSION } from "@hardkas/artifacts";
import { parseWasmTxToRpc } from "./internal/wasm-rpc-serialization.js";
import { v1ArgToSil, v1ContractFactsAtState, type V1ContractFacts, type V1SuccessorFacts } from "./v1-contract-facts.js";
import { validateV1Transition, type V1NodeUtxo, type V1ValidationResult } from "./v1-validate.js";

/*
 * F1.3 + F1.5 · the v1 engine: one function turns a v1 plan into a signed transaction with its official txid, and nothing
 * is signed that F1.4 did not validate. Fixed order:
 *   1. freeze the plan (a deep copy) and check its identity; refuse mainnet;
 *   2. read the inputs from the node, now;
 *   3. obtain the contract facts (silverc) and the successor facts of each transition;
 *   4. validate (F1.4);
 *   5. only then resolve keys, once per account, and check each one is the key F1.4 validated;
 *   6. build the transaction: version 1, a compute budget per input, bindings, genesis groups, storage mass (node rules);
 *   7. finalize() (after populateGenesisCovenants: the id is recomputed only there);
 *   8. authorize each input (F1.3): P2PK Schnorr, contract entry, covenant entry; signature slots filled with the
 *      SIGHASH_ALL signature of the slot's key over the final transaction;
 *   9. the signed artifact (hardkas.signedTx) with lineage to the plan, contentHash and the txid kaspa-wasm gives.
 */

export function v1EngineError(code: string, message: string, detail?: Record<string, unknown>): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  if (detail) (err as any).detail = detail;
  return err;
}
const fail = v1EngineError;

export interface V1EngineNode {
  readonly networkId: string;
  /** The UTXOs the node lists for these addresses, by "txid:index". */
  readonly utxosByAddresses: (addresses: readonly string[]) => Promise<ReadonlyMap<string, V1NodeUtxo>>;
}

export interface V1EngineFacts {
  /** Facts of a compiled contract reference (silverc reproduction). Throws its own code when they cannot be established. */
  readonly contract: (ref: { readonly compileRecord: { readonly contentHash: string; readonly artifactSha256: string }; readonly contract: string; readonly constructorArgs: readonly unknown[] }) => Promise<V1ContractFacts>;
  /** Successor facts of a covenant input, from the plan's declared next state (silverc). */
  readonly successor: (plan: Record<string, any>, inputIndex: number, current: V1ContractFacts) => Promise<V1SuccessorFacts>;
}

export interface V1KeyResolver {
  /** The x-only public key (hex) of an account, from the account store: never opens a keystore. */
  readonly publicKeyOf: (account: string) => string | undefined;
  /** The account's private key (hex). Called only after validation, at most once per account. */
  readonly privateKeyOf: (account: string) => Promise<string>;
}

export interface BuildV1TransactionInput {
  readonly plan: Record<string, any>;
  readonly node: V1EngineNode;
  readonly facts: V1EngineFacts;
  readonly keys: V1KeyResolver;
  /** Library use only: no HardKAS path passes it (MAINNET_SIGNING_DISABLED). */
  readonly allowMainnet?: boolean | undefined;
}

export interface BuildV1TransactionResult {
  readonly signed: Record<string, any>;
  readonly txId: string;
  readonly transaction: any;
  readonly rpcTransaction: any;
  readonly validation: V1ValidationResult;
  /** The signature script of each input (hex), as sent. */
  readonly signatureScripts: readonly string[];
}

const keyOf = (o: { transactionId: string; index: number }) => `${o.transactionId}:${o.index}`;
const HEX = /^(?:[0-9a-f]{2})+$/i;

function xOnly(k: any, privateKey: string): string {
  return String(new k.PrivateKey(privateKey).toPublicKey().toXOnlyPublicKey().toString()).toLowerCase();
}

/**
 * The v1 transaction of a validated plan: bindings and genesis groups before the id is finalized. Built without signature
 * scripts to sign, then built again with them (neither the txid nor the v1 sighash covers signature scripts).
 */
export function buildV1WasmTransaction(k: any, plan: Record<string, any>, signatureScripts?: readonly string[]): any {
  const inputs: any[] = plan.inputs;
  const outputs: any[] = plan.outputs;
  const spkOf = (hex: string) => new k.ScriptPublicKey(parseInt(hex.slice(0, 4), 16), hex.slice(4));
  const tx = new k.Transaction({
    version: 1,
    inputs: inputs.map((i, idx) => ({
      previousOutpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index },
      signatureScript: signatureScripts?.[idx] ?? "",
      sequence: BigInt(i.sequence ?? 0),
      sigOpCount: 0,
      computeBudget: i.computeBudget,
      utxo: {
        outpoint: { transactionId: i.outpoint.transactionId, index: i.outpoint.index },
        amount: BigInt(i.amountSompi),
        scriptPublicKey: spkOf(String(i.scriptPublicKey)),
        blockDaaScore: BigInt(i.blockDaaScore ?? 0),
        isCoinbase: Boolean(i.isCoinbase),
        // kaspa-wasm 2.1.0 reads a UTXO's covenant id only from this key (consensus/client/src/utxo.rs)
        ...(i.covenantId !== undefined ? { covenant_id: i.covenantId } : {})
      }
    })),
    outputs: outputs.map((o) => ({
      value: BigInt(o.amountSompi),
      scriptPublicKey: k.payToAddressScript(new k.Address(o.address)),
      ...(o.covenant ? { covenant: { authorizingInput: o.covenant.authorizingInput, covenantId: o.covenant.covenantId } } : {})
    })),
    lockTime: 0n,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0n,
    payload: typeof plan.payload === "string" ? plan.payload : ""
  });
  const groups: any[] = plan.genesisCovenantGroups ?? [];
  // Bindings before any signature (the v1 sighash commits to them), finalize() after populateGenesisCovenants.
  if (groups.length > 0) tx.populateGenesisCovenants(groups.map((g) => ({ authorizingInput: g.authorizingInput, outputs: [...g.outputs] })));
  tx.storageMass = BigInt(plan.storageMass);
  tx.finalize();
  return tx;
}

/**
 * F1.3 / F1.9 · the unlock of a contract input: its entry and arguments with each signer slot's 65-byte signature
 * (signature + SIGHASH byte), of the length the fee was checked for (SILVER_SPEND_UNLOCK_SIZE_CHANGED otherwise).
 */
export function v1ContractUnlock(index: number, v: V1ValidationResult["inputs"][number], signatures: ReadonlyMap<number, Uint8Array>): string {
  const c = v.contract!;
  const args = c.args.map((a, i) => {
    if (a.kind !== "signer") return v1ArgToSil(a, `input ${index}.args[${i}]`);
    const sig = signatures.get(i);
    if (!sig) throw fail("SILVER_SPEND_SIGNATURE_MISSING", `input ${index}: the signature for '${c.slots.find((s) => s.argIndex === i)?.param ?? i}' is missing`, { input: index });
    return { kind: "bytes", value: sig } as SilArtifactValue;
  });
  const unlock = silverUnlockScript(c.facts.bytecodeHex, encodeSilverEntryArgs({ artifact: c.facts.artifact, contractName: c.facts.contractName, entry: c.entry, args }));
  if (unlock.length / 2 !== v.signatureScriptBytes) {
    throw fail("SILVER_SPEND_UNLOCK_SIZE_CHANGED", `input ${index}: the signed unlock is ${unlock.length / 2} bytes, the fee was checked for ${v.signatureScriptBytes}`, { input: index });
  }
  return unlock;
}

/** F1.3 · the signature script of one input, from its validated description and the resolved keys. */
function authorizeInput(k: any, tx: any, index: number, v: V1ValidationResult["inputs"][number], keyOfAccount: (account: string) => string): string {
  if (v.kind === "p2pk") {
    const key = keyOfAccount(v.signer!.account);
    if (xOnly(k, key) !== v.signer!.publicKey) {
      throw fail("PRIVATE_KEY_DOES_NOT_CONTROL_INPUT", `input ${index}: the key of '${v.signer!.account}' does not control this P2PK output`, { input: index });
    }
    return String(k.createInputSignature(tx, index, new k.PrivateKey(key), k.SighashType.All));
  }
  const c = v.contract!;
  const sigs = new Map<number, Uint8Array>();
  for (const slot of c.slots) {
    const key = keyOfAccount(slot.signer);
    if (xOnly(k, key) !== slot.publicKey) {
      throw fail("SIGNER_SLOT_KEY_MISMATCH", `input ${index}: the key of '${slot.signer}' is not the one the contract checks '${slot.param}' against`, { input: index, param: slot.param });
    }
    const inputSignature = String(k.createInputSignature(tx, index, new k.PrivateKey(key), k.SighashType.All));
    sigs.set(slot.argIndex, silverSigFromInputSignature(inputSignature));
  }
  return v1ContractUnlock(index, v, sigs);
}

/** F1.5 / F1.9 · the signed artifact (hardkas.signedTx, txVersion 1) of a transaction built from `plan`, bound to it. */
export function v1SignedArtifact(plan: Record<string, any>, tx: any): { signed: Record<string, any>; txId: string; rpcTransaction: any } {
  const txId = String(tx.id);
  const rpcTransaction = parseWasmTxToRpc(tx.serializeToObject());
  const signed: Record<string, any> = {
    schema: "hardkas.signedTx",
    hardkasVersion: HARDKAS_VERSION,
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    status: "signed",
    createdAt: new Date().toISOString(),
    txId,
    sourcePlanId: plan.planId,
    networkId: plan.networkId,
    mode: plan.mode,
    from: { address: plan.from.address },
    to: { address: plan.to.address },
    amountSompi: plan.amountSompi,
    txVersion: 1,
    signedTransaction: { format: "hex", payload: JSON.stringify(rpcTransaction) },
    lineage: createLineageTransition(plan, "hardkas.signedTx"),
    ...(plan.execution ? { execution: plan.execution } : {}),
    ...(plan.workflowId ? { workflowId: plan.workflowId } : {}),
    ...(plan.assumptionLevel ? { assumptionLevel: plan.assumptionLevel } : {})
  };
  const contentHash = calculateContentHash(signed, CURRENT_HASH_VERSION);
  signed.signedId = `signed-${contentHash.slice(0, 16)}`;
  signed.contentHash = contentHash;
  if (signed.lineage) signed.lineage.artifactId = contentHash;
  return { signed, txId, rpcTransaction };
}

/**
 * The facts F1.4 needs for a plan: one per compiled contract it names (its inputs' and its genesis groups'), and the
 * successor of each covenant input. Shared by signing (the engine) and sending (F1.6), so both check the same things.
 */
export async function resolveV1PlanFacts(
  plan: Record<string, any>,
  facts: V1EngineFacts
): Promise<{ contract: (ref: any) => V1ContractFacts | undefined; successor: (inputIndex: number) => V1SuccessorFacts | undefined }> {
  const factsByRef = new Map<string, V1ContractFacts>();
  const refKey = (r: any) => `${r.compileRecord.contentHash}:${r.contract}`;
  const refs = [...(plan.inputs as any[]).filter((i) => i.contract).map((i) => i.contract), ...((plan.genesisCovenantGroups ?? []) as any[]).filter((g) => g.contract).map((g) => g.contract)];
  for (const r of refs) if (!factsByRef.has(refKey(r))) factsByRef.set(refKey(r), await facts.contract(r));
  // phase 2: a UTXO holding another state than its record's is the record's template with that state encoded
  const atState = new Map<string, V1ContractFacts>();
  const contractOf = (ref: any): V1ContractFacts | undefined => {
    const base = factsByRef.get(refKey(ref));
    if (!base || ref.state === undefined) return base;
    const key = `${refKey(ref)}:${JSON.stringify(Object.keys(ref.state).sort().map((f) => [f, ref.state[f]]))}`;
    if (!atState.has(key)) atState.set(key, v1ContractFactsAtState(base, Object.fromEntries(Object.entries(ref.state).map(([f, v]) => [f, v1ArgToSil(v as any, `state.${f}`)]))));
    return atState.get(key);
  };
  // the recompiled successors (phase 1 form); encoded states need no compiler
  const successors = new Map<number, V1SuccessorFacts>();
  for (const n of (plan.nextState ?? []) as any[]) {
    if (n?.successor === undefined) continue;
    const i = (plan.inputs as any[])[n.input];
    if (i?.kind === "covenant" && i.contract) successors.set(n.input, await facts.successor(plan, n.input, contractOf(i.contract)!));
  }
  return { contract: contractOf, successor: (idx) => successors.get(idx) };
}

/**
 * Steps 1–4 of the engine, without any private key: the plan frozen and its identity checked, mainnet refused, the
 * inputs as the node lists them now, the contract facts, F1.4. What `buildV1Transaction` does before it reads a key; a
 * caller learns whether a plan would be signed, and the id its transaction will have (signature scripts are not part of
 * it), without opening a keystore. Local validation only: the node still executes the scripts.
 */
export async function checkV1Plan(
  input: Omit<BuildV1TransactionInput, "keys"> & { readonly keys?: Pick<V1KeyResolver, "publicKeyOf"> | undefined }
): Promise<{ readonly plan: Record<string, any>; readonly validation: V1ValidationResult; readonly txId: string }> {
  // 1. A frozen copy: whatever happens to the caller's object afterwards, the engine works on what it checked.
  const plan = JSON.parse(JSON.stringify(input.plan));
  const identity = checkArtifactIdentity(plan);
  if (!identity.ok) throw fail("V1_PLAN_IDENTITY_INVALID", `the plan's identity does not verify (${identity.issues.map((i) => i.code).join(", ")})`);
  if (plan.schema !== "hardkas.txPlan" || plan.txVersion !== 1) throw fail("V1_PLAN_INVALID", "the engine signs v1 TxPlan artifacts only");
  if (!input.allowMainnet) assertMainnetTransactionsDisabled("sign", [plan.networkId, input.node.networkId], "v1 engine");
  const k = loadManagedKaspaWasmSync();

  // 2. The inputs as the node lists them now
  const addresses = [...new Set((plan.inputs as any[]).map((i) => String(i.address)))];
  const listed = await input.node.utxosByAddresses(addresses);

  // 3. Contract facts (silverc) and successor facts
  const planFacts = await resolveV1PlanFacts(plan, input.facts);

  // 4. F1.4: nothing past this line runs for a plan it refuses
  const validation = validateV1Transition({
    plan,
    node: { networkId: input.node.networkId, utxos: listed },
    facts: planFacts.contract,
    successor: planFacts.successor,
    ...(input.keys ? { publicKeyOf: input.keys.publicKeyOf } : {})
  });
  return { plan, validation, txId: String(buildV1WasmTransaction(k, plan).id) };
}

export async function buildV1Transaction(input: BuildV1TransactionInput): Promise<BuildV1TransactionResult> {
  // 1–4. The plan frozen, its identity, mainnet, the node's inputs, the facts, F1.4 (checkV1Plan)
  const { plan, validation } = await checkV1Plan(input);
  const k = loadManagedKaspaWasmSync();

  // 5. Keys, only now, once per account
  const accounts = new Set<string>();
  for (const v of validation.inputs) {
    if (v.signer) accounts.add(v.signer.account);
    for (const s of v.contract?.slots ?? []) accounts.add(s.signer);
  }
  const resolved = new Map<string, string>();
  for (const a of accounts) resolved.set(a, await input.keys.privateKeyOf(a));
  const keyOfAccount = (a: string) => {
    const key = resolved.get(a);
    if (!key) throw fail("MISSING_INPUT_AUTHORIZER", `no key resolved for account '${a}'`);
    return key;
  };

  // 6-7. The transaction, finalized with its bindings
  const unsigned = buildV1WasmTransaction(k, plan);

  // 8. F1.3: one authorization per input, over the final transaction
  const scripts = validation.inputs.map((v, idx) => {
    const script = authorizeInput(k, unsigned, idx, v, keyOfAccount);
    if (typeof script !== "string" || script.length === 0 || !HEX.test(script)) {
      throw fail("INVALID_SIGNATURE_SCRIPT", `input ${idx}: the authorizer returned no hex signature script`, { input: idx });
    }
    return script;
  });
  const tx = buildV1WasmTransaction(k, plan, scripts);
  if (String(tx.id) !== String(unsigned.id)) {
    throw fail("V1_TXID_UNSTABLE", `the signed transaction's id ${String(tx.id)} is not the id of the transaction signed (${String(unsigned.id)})`);
  }

  // 9. The signed artifact, bound to the plan
  const { signed, txId, rpcTransaction } = v1SignedArtifact(plan, tx);
  return { signed, txId, transaction: tx, rpcTransaction, validation, signatureScripts: scripts };
}

export { keyOf as v1OutpointKey };
