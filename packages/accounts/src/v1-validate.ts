import {
  encodeSilverEntryArgs,
  getSilContract,
  isMainnetNetworkId,
  loadManagedKaspaWasmSync,
  silverDeclarationBound,
  silverUnlockScript,
  type SilArtifactValue
} from "@hardkas/core";
import { assertV1PlanShape, measureV1Mass, type V1ArgValue, type V1MassMeasure } from "@hardkas/tx-builder";
import { silverSignatureSlotKeys, v1ArgToSil, v1ContractFactsAtState, type V1ContractFacts, type V1SuccessorFacts } from "./v1-contract-facts.js";

/*
 * F1.4, part 2 · validateV1Transition: never sign a v1 transaction HardKAS cannot show is the contract's.
 *
 * Pure: it runs no compiler and reads no network. Its inputs are the plan, the inputs as the node lists them AT SIGNING
 * (not the plan's own snapshot, so the plan is never checked against itself), the contract facts (v1-contract-facts.ts:
 * silverc reproduction, declarations, AST) and the public key of each account named by the plan, read from the account
 * store without opening any keystore. The engine runs it before any key is resolved. Checks, in this order, each with
 * its code: shape; real inputs; input kind; declaration; lineage; no orphan binding; termination; output scripts;
 * authorization; values; network.
 *
 * What it cannot check: whether the contract's rule accepts the transition (e.g. that a counter rises by one). kaspa-wasm
 * 2.1.0 has no script engine and the official debugger is not evidence while silverscript#253 is open. The node decides
 * when it receives the transaction, and a script rejection is final (no retry, no rebuild).
 *
 * Phase 2 · the topologies silverc 1.0.0 compiles (docs/DECL.md). The covenant inputs of one covenant id form one
 * transition: with binding auth, one input (1:1, or 1:N fanout) whose continuations it authorizes; with binding cov, a
 * leader (the first input with that id, calling the leader entry) and delegates (the others, calling the delegate entry),
 * N:M with N:1 as M = 1. Cardinalities come from the declaration (`from`/`to`, literals or constructor parameters);
 * zero continuations only where declared (a singleton with termination allowed) or explicitly planned (states []).
 * Every input of a family uses one template; each continuation is that template with its declared state encoded
 * (silverscript-abi), and an entry that takes the new states takes exactly the declared ones.
 */

export function v1ValidationError(code: string, message: string, detail?: Record<string, unknown>): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  if (detail) (err as any).detail = detail;
  return err;
}
const fail = v1ValidationError;

/** An input as the node lists it now. */
export interface V1NodeUtxo {
  readonly amountSompi: bigint;
  /** "<2-byte version><script>" hex. */
  readonly scriptPublicKey: string;
  readonly covenantId?: string | undefined;
  readonly blockDaaScore?: bigint | undefined;
  readonly isCoinbase?: boolean | undefined;
}

export interface V1ValidationInput {
  /** The v1 TxPlan artifact (its identity already checked by the caller). */
  readonly plan: Record<string, any>;
  /** The node that will receive the transaction: its network, and the plan's inputs as it lists them now. */
  readonly node: { readonly networkId: string; readonly utxos: ReadonlyMap<string, V1NodeUtxo> };
  /** Contract facts for a compiled contract reference (undefined when they could not be established). */
  readonly facts: (ref: { readonly compileRecord: { readonly contentHash: string }; readonly contract: string }) => V1ContractFacts | undefined;
  /** Successor facts of the covenant input at this index (transition). */
  readonly successor: (inputIndex: number) => V1SuccessorFacts | undefined;
  /**
   * An account's 32-byte x-only public key (hex), from the account store; never a private key. Signing passes it: every
   * key HardKAS would sign with is checked against what the input or the contract names. A send (F1.6) leaves it out:
   * nothing is signed, the signatures are already in the transaction and only the node can verify them.
   */
  readonly publicKeyOf?: ((account: string) => string | undefined) | undefined;
  /**
   * F1.6 · the signature scripts of the signed transaction, one per input, when it is checked before a send: each must be
   * what the plan describes (a P2PK input, one SIGHASH_ALL Schnorr signature; a contract input, the unlock of the
   * plan's entry and arguments with a SIGHASH_ALL signature in each signer slot), and the mass is measured with them.
   */
  readonly signatureScripts?: readonly string[] | undefined;
}

/** One signature slot the engine fills after validation: the account and the key the contract names for it. */
export interface V1SignatureSlot {
  readonly argIndex: number;
  readonly param: string;
  readonly signer: string;
  /** The signer's key ("" when validating without keys: a send, a draft's finalization). */
  readonly publicKey: string;
  /** The keys the contract checks this slot against, from its facts (empty when HardKAS cannot tell). */
  readonly allowedKeys: readonly string[];
}

export interface V1ValidatedInput {
  readonly index: number;
  readonly kind: "p2pk" | "p2sh" | "covenant";
  /** For p2sh and covenant inputs: the contract bytecode, the ABI entry and the arguments with signer slots. */
  readonly contract?: { readonly facts: V1ContractFacts; readonly entry: string; readonly args: readonly V1ArgValue[]; readonly slots: readonly V1SignatureSlot[] } | undefined;
  /** For p2pk inputs: the signing account and its public key. */
  readonly signer?: { readonly account: string; readonly publicKey: string } | undefined;
  /** The final signature script length (bytes): 66 for P2PK, the unlock with placeholder signatures otherwise. */
  readonly signatureScriptBytes: number;
}

export interface V1ValidationResult {
  readonly feeSompi: bigint;
  readonly mass: V1MassMeasure;
  readonly inputs: readonly V1ValidatedInput[];
  /** What is allowed but worth saying (e.g. a termination the documentation limits to transition mode). */
  readonly warnings: readonly string[];
}

const keyOf = (o: { transactionId: string; index: number }) => `${o.transactionId}:${o.index}`;
const PLACEHOLDER_SIG: SilArtifactValue = { kind: "bytes", value: new Uint8Array(65) };
const P2PK_SCRIPT = /^0000(20[0-9a-f]{64})ac$/;

/** "simnet", "kaspa-simnet", "Simnet" → "simnet"; "testnet-10" stays; HardKAS's "simulated" alias is simnet. */
function sameNetwork(a: string, b: string): boolean {
  const n = (s: string) => {
    const x = String(s).trim().toLowerCase().replace(/^kaspa-/, "");
    return x === "simulated" || x === "local-docker-simnet" ? "simnet" : x;
  };
  return n(a) === n(b);
}

function spkHexOfAddress(k: any, address: string, where: string): string {
  let spk: any;
  try {
    spk = k.payToAddressScript(new k.Address(address));
  } catch {
    throw fail("V1_PLAN_INVALID", `${where}: '${address}' is not a Kaspa address`);
  }
  const o = typeof spk.serializeToObject === "function" ? spk.serializeToObject() : spk;
  return Number(o.version).toString(16).padStart(4, "0") + String(o.script).toLowerCase();
}

const lockHex = (lock: { version: number; script: string }) => lock.version.toString(16).padStart(4, "0") + lock.script.toLowerCase();

/** A plan State ({field: {kind, value}}) as silverscript-abi values. */
function stateToSil(state: Record<string, V1ArgValue>, where: string): Record<string, SilArtifactValue> {
  return Object.fromEntries(Object.entries(state).map(([field, v]) => [field, v1ArgToSil(v, `${where}.${field}`)]));
}

/** Value equality of silverscript-abi values (ints by value, bytes by content, objects by field). */
function canonicalValue(v: SilArtifactValue): unknown {
  switch (v?.kind) {
    case "int":
      return ["int", BigInt(v.value).toString()];
    case "bytes":
      return ["bytes", Array.from(v.value as ArrayLike<number>)];
    case "array":
      return ["array", v.value.map(canonicalValue)];
    case "object":
      return ["object", Object.keys(v.value).sort().map((key) => [key, canonicalValue(v.value[key]!)])];
    default:
      return [v?.kind, (v as any)?.value];
  }
}
const sameValue = (a: SilArtifactValue, b: SilArtifactValue) => JSON.stringify(canonicalValue(a)) === JSON.stringify(canonicalValue(b));

/** The unlock of a contract input with every signer slot as a 65-byte placeholder: its final length, and the ABI check. */
function placeholderUnlock(facts: V1ContractFacts, entry: string, args: readonly V1ArgValue[], code: string, where: string, fill: SilArtifactValue = PLACEHOLDER_SIG): string {
  try {
    const silArgs = args.map((a, i) => (a.kind === "signer" ? fill : v1ArgToSil(a, `${where}.args[${i}]`)));
    return silverUnlockScript(facts.bytecodeHex, encodeSilverEntryArgs({ artifact: facts.artifact, contractName: facts.contractName, entry, args: silArgs }));
  } catch (e: any) {
    throw fail(code, `${where}: the entry '${entry}' does not take these arguments (${e?.message ?? e})`, { cause: e?.code });
  }
}

/**
 * V1-ENGINE-2 · the unlock a contract input will carry, signatures as fixed-size placeholders (a signer slot is always 65
 * bytes), so its length and redeem script are the signed one's: what a compute-budget estimate reads before any key.
 */
export function v1PlannedUnlockHex(facts: V1ContractFacts, entry: string, args: readonly V1ArgValue[]): string {
  return placeholderUnlock(facts, entry, args, "SILVER_ABI_ARGUMENT_INVALID", `entry '${entry}'`);
}

const SIGNED_P2PK_SCRIPT = /^41[0-9a-f]{128}01$/;

/**
 * F1.6 · is `signed` the unlock the plan describes? The same bytes as the placeholder unlock everywhere but in the signer
 * slots, and each slot a signature whose last byte is SIGHASH_ALL. The slots are the bytes where two placeholder
 * unlocks (all-zero and all-0xff signatures) differ: nothing else in the unlock may change.
 */
function isPlannedUnlock(signed: string, zero: string, ones: string): boolean {
  if (signed.length !== zero.length || zero.length !== ones.length) return false;
  let inSlot = false;
  for (let b = 0; b < zero.length; b += 2) {
    const z = zero.slice(b, b + 2);
    const s = signed.slice(b, b + 2);
    const slotByte = z !== ones.slice(b, b + 2);
    if (!slotByte) {
      if (inSlot && signed.slice(b - 2, b) !== "01") return false;
      inSlot = false;
      if (s !== z) return false;
      continue;
    }
    inSlot = true;
  }
  return !inSlot || signed.slice(signed.length - 2) === "01";
}

/** Signer slots of a contract input: each `sig` parameter is a slot, each slot names an account whose key the contract checks. */
function signatureSlots(
  facts: V1ContractFacts,
  entry: string,
  fnName: string,
  args: readonly V1ArgValue[],
  publicKeyOf: ((account: string) => string | undefined) | undefined,
  where: string
): V1SignatureSlot[] {
  const params = facts.artifact.contracts[facts.contractName]!.entries[entry]!.params;
  const fnArgs: Record<string, SilArtifactValue | undefined> = {};
  params.forEach((p, i) => {
    const a = args[i];
    if (a && a.kind !== "signer") fnArgs[p.name] = v1ArgToSil(a, `${where}.args[${i}]`);
  });
  const keys = silverSignatureSlotKeys(facts.ast, fnName, facts.constructorArgs, fnArgs, facts.state);
  const slots: V1SignatureSlot[] = [];
  params.forEach((p, i) => {
    const a = args[i]!;
    const isSig = p.type.kind === "sig";
    if (a.kind === "signer" && !isSig) throw fail("V1_PLAN_INVALID", `${where}.args[${i}]: a signer slot fills only a sig parameter ('${p.name}' is ${p.type.kind})`);
    if (isSig && a.kind !== "signer") throw fail("V1_PLAN_INVALID", `${where}.args[${i}]: the sig parameter '${p.name}' is a signer slot; a plan never carries a resolved signature`);
    if (!isSig) return;
    const allowedKeys = (keys[p.name] ?? []).map((x) => x.toLowerCase());
    // A send checks the slots' place, not their keys: nothing is signed there (see V1ValidationInput.publicKeyOf)
    if (!publicKeyOf) {
      slots.push({ argIndex: i, param: p.name, signer: (a as { signer: string }).signer, publicKey: "", allowedKeys });
      return;
    }
    const allowed = keys[p.name];
    if (allowed === null || allowed === undefined) {
      throw fail("SIGNER_SLOT_KEY_UNRESOLVED", `${where}: HardKAS cannot tell which public key '${fnName}' checks '${p.name}' against; it does not sign a slot it cannot match`, { param: p.name });
    }
    const pk = publicKeyOf((a as { signer: string }).signer);
    if (pk === undefined) {
      throw fail("SIGNER_SLOT_KEY_UNRESOLVED", `${where}: account '${(a as { signer: string }).signer}' has no known public key`, { param: p.name });
    }
    if (!allowed.includes(pk.toLowerCase())) {
      throw fail("SIGNER_SLOT_KEY_MISMATCH", `${where}: account '${(a as { signer: string }).signer}' is not the key '${fnName}' checks '${p.name}' against`, { param: p.name });
    }
    slots.push({ argIndex: i, param: p.name, signer: (a as { signer: string }).signer, publicKey: pk.toLowerCase(), allowedKeys });
  });
  return slots;
}

export function validateV1Transition(input: V1ValidationInput): V1ValidationResult {
  const k = loadManagedKaspaWasmSync();
  const plan = input.plan;

  // 1. Shape (V1_PLAN_INVALID, V1_FEE_LIMIT_REQUIRED, FEE_EXCEEDS_MAX, COVENANT_P2PK_INPUT_NOT_SUPPORTED)
  if (plan?.txVersion !== 1) throw fail("V1_PLAN_INVALID", "the engine signs v1 plans only (txVersion 1)");
  const { feeSompi } = assertV1PlanShape(plan);
  const inputs: any[] = plan.inputs;
  const outputs: any[] = plan.outputs;

  // 2. Real inputs: each one listed unspent by the node now, with the same amount and script
  const nodeOf = inputs.map((i, idx) => {
    const u = input.node.utxos.get(keyOf(i.outpoint));
    if (!u) throw fail("INPUT_NOT_UNSPENT", `input ${idx} (${keyOf(i.outpoint)}) is not listed unspent by the node`, { input: idx });
    if (u.amountSompi !== BigInt(i.amountSompi)) throw fail("INPUT_DIFFERS_FROM_NODE", `input ${idx}: amount ${i.amountSompi} in the plan, ${u.amountSompi} at the node`, { input: idx, field: "amount" });
    if (u.scriptPublicKey.toLowerCase() !== String(i.scriptPublicKey).toLowerCase()) {
      throw fail("INPUT_DIFFERS_FROM_NODE", `input ${idx}: its script differs from the node's`, { input: idx, field: "scriptPublicKey" });
    }
    return u;
  });

  // 3. Kind of each input: what the node says decides, the plan's declaration must agree
  const factsOf: (V1ContractFacts | undefined)[] = [];
  inputs.forEach((i, idx) => {
    const u = nodeOf[idx]!;
    const where = `input ${idx}`;
    if (u.covenantId !== undefined && i.kind !== "covenant") {
      if (P2PK_SCRIPT.test(u.scriptPublicKey.toLowerCase())) throw fail("COVENANT_P2PK_INPUT_NOT_SUPPORTED", `${where}: the node lists a covenant UTXO at a P2PK address; not spent in this phase`, { input: idx });
      throw fail("COVENANT_INPUT_UNDECLARED", `${where}: the node lists a covenant id, the plan declares a ${i.kind} input`, { input: idx });
    }
    if (i.kind === "covenant" && u.covenantId?.toLowerCase() !== String(i.covenantId).toLowerCase()) {
      throw fail("INPUT_DIFFERS_FROM_NODE", `${where}: covenant id ${i.covenantId} in the plan, ${u.covenantId ?? "none"} at the node`, { input: idx, field: "covenantId" });
    }
    if (i.kind === "p2pk") {
      const m = P2PK_SCRIPT.exec(String(i.scriptPublicKey).toLowerCase());
      if (!m) throw fail("V1_PLAN_INVALID", `${where}: a p2pk input spends a P2PK output`, { input: idx });
      // F1.7: a plan has one funder; its P2PK inputs (fee, funding) are the funder's coins
      if (String(i.address) !== String(plan.from?.address)) {
        throw fail("V1_FEE_INPUT_NOT_FUNDER", `${where}: a P2PK input of ${i.address}; this plan's funder is ${plan.from?.address}`, { input: idx });
      }
      if (input.publicKeyOf) {
        const pk = input.publicKeyOf(i.signer);
        if (pk === undefined || `20${pk.toLowerCase()}` !== m[1]!.slice(0, 66)) {
          throw fail("PRIVATE_KEY_DOES_NOT_CONTROL_INPUT", `${where}: account '${i.signer}' does not control this P2PK output`, { input: idx });
        }
      }
      factsOf.push(undefined);
      return;
    }
    const f = input.facts(i.contract);
    if (!f || f.compileRecordHash !== i.contract.compileRecord.contentHash || f.artifactSha256 !== i.contract.compileRecord.artifactSha256 || f.contractName !== i.contract.contract) {
      throw fail("SILVER_RECORD_NOT_REPRODUCED", `${where}: the contract's compile record was not reproduced by the pinned silverc`, { input: idx });
    }
    if (lockHex(f.lock) !== String(i.scriptPublicKey).toLowerCase()) {
      throw fail("SILVER_SPEND_LOCK_MISMATCH", `${where}: the output is not locked to the current state of '${f.contractName}'`, { input: idx });
    }
    factsOf.push(f);
  });

  // 4. Declaration and topology: the covenant inputs of one id are one transition (auth: one input; cov: leader + delegates)
  const covenantInputs = inputs.map((i, idx) => (i.kind === "covenant" ? idx : -1)).filter((x) => x >= 0);
  const families = new Map<string, number[]>();
  for (const idx of covenantInputs) {
    const id = String(inputs[idx].covenantId).toLowerCase();
    families.set(id, [...(families.get(id) ?? []), idx]);
  }
  const warnings: string[] = [];
  /** Per covenant input: its role in its transition, and the source function whose signature slots its entry exposes. */
  const roleOf = new Map<number, { role: "auth" | "leader" | "delegate"; fn: string | undefined; states?: readonly Readonly<Record<string, SilArtifactValue>>[] | undefined }>();
  const nextStates: any[] = plan.nextState ?? [];
  const continuationsOf = new Map<string, number[]>();
  for (const [id, members] of families) {
    const leader = members[0]!;
    const lf = factsOf[leader]!;
    const lc = getSilContract(lf.artifact, lf.contractName).contract;
    const policy = String(inputs[leader].contract.policy);
    const decl = lf.declarations.find((d) => d.policy === policy);
    if (!lc.cov_decl_to_abi?.[policy] || !decl) {
      throw fail("COVENANT_POLICY_NOT_FOUND", `input ${leader}: '${lf.contractName}' declares no covenant policy '${policy}'`, { input: leader });
    }
    for (const m of members) {
      const f = factsOf[m]!;
      if (f.templateHash !== lf.templateHash || f.contractName !== lf.contractName || f.compileRecordHash !== lf.compileRecordHash) {
        throw fail("COVENANT_FAMILY_TEMPLATE_MISMATCH", `input ${m}: covenant ${id} is spent through one template; input ${m} is not '${lf.contractName}' of input ${leader}'s record`, { input: m });
      }
      if (String(inputs[m].contract.policy) !== policy) {
        throw fail("COVENANT_UNLOCK_MISMATCH", `input ${m}: covenant ${id} moves through policy '${policy}' (its first input's); input ${m} names '${inputs[m].contract.policy}'`, { input: m });
      }
    }
    const from = silverDeclarationBound(lf.ast, decl.from, lf.constructorArgs);
    const to = silverDeclarationBound(lf.ast, decl.to, lf.constructorArgs);
    if (from === undefined || to === undefined) {
      throw fail("SILVER_COVENANT_NOT_IMPLEMENTED", `policy '${policy}': HardKAS cannot tell its bounds from = ${decl.from}, to = ${decl.to} from the constructor arguments`, { input: leader });
    }
    const conts = outputs.map((o, oi) => (o.covenant && String(o.covenant.covenantId).toLowerCase() === id ? oi : -1)).filter((x) => x >= 0);
    continuationsOf.set(id, conts);

    // 5. Lineage: continuations are authorized by an input of the transition
    if (decl.binding === "auth") {
      if (members.length > 1) throw fail("COVENANT_LINEAGE_INVALID", `inputs ${members.join(", ")} spend covenant ${id}: an auth transition has one input (several inputs move together through a cov leader)`, { input: members[1] });
      if (lc.delegate_entry_abi !== undefined) throw fail("SILVER_ARTIFACT_INCONSISTENT", `'${lf.contractName}' declares an auth policy and a delegate entry (the compiler never mixes auth and cov)`, { input: leader });
      if (inputs[leader].contract.entry !== lc.cov_decl_to_abi[policy]) {
        throw fail("COVENANT_UNLOCK_MISMATCH", `input ${leader}: policy '${policy}' is unlocked through '${lc.cov_decl_to_abi[policy]}', the plan calls '${inputs[leader].contract.entry}'`, { input: leader });
      }
      roleOf.set(leader, { role: "auth", fn: policy });
    } else {
      const leaderEntry = lc.cov_decl_to_abi[policy];
      const delegateEntry = lc.delegate_entry_abi;
      if (members.length > from) throw fail("COVENANT_LINEAGE_INVALID", `${members.length} inputs spend covenant ${id}; policy '${policy}' takes at most ${from}`, { input: members[from] });
      const entryOf = (m: number) => String(inputs[m].contract.entry);
      if (entryOf(leader) !== leaderEntry) {
        throw fail(entryOf(leader) === delegateEntry ? "COVENANT_LEADER_POSITION_INVALID" : "COVENANT_UNLOCK_MISMATCH", `input ${leader} is the leader of covenant ${id} (its first input): it calls '${leaderEntry}', the plan calls '${entryOf(leader)}'`, { input: leader });
      }
      roleOf.set(leader, { role: "leader", fn: policy });
      for (const m of members.slice(1)) {
        if (delegateEntry === undefined || entryOf(m) !== delegateEntry) {
          throw fail(entryOf(m) === leaderEntry ? "COVENANT_LEADER_POSITION_INVALID" : "COVENANT_UNLOCK_MISMATCH", `input ${m} is a delegate of covenant ${id} (not its first input): it calls '${delegateEntry ?? "(no delegate entry)"}', the plan calls '${entryOf(m)}'`, { input: m });
        }
        roleOf.set(m, { role: "delegate", fn: lf.delegateFunction });
      }
    }
    for (const o of conts) {
      if (!members.includes(outputs[o].covenant.authorizingInput)) {
        throw fail("COVENANT_LINEAGE_INVALID", `output ${o}: authorizingInput ${outputs[o].covenant.authorizingInput}, but covenant ${id} is spent by input(s) ${members.join(", ")}`, { output: o });
      }
    }
    if (conts.length === 0) {
      const other = outputs.findIndex((o) => o.covenant && members.includes(o.covenant.authorizingInput));
      if (other >= 0) {
        throw fail("COVENANT_LINEAGE_INVALID", `output ${other}: authorized by input ${outputs[other].covenant.authorizingInput} but bound to covenant ${outputs[other].covenant.covenantId}, not ${id}`, { output: other });
      }
    }
    if (conts.length > to) throw fail("COVENANT_LINEAGE_INVALID", `${conts.length} outputs continue covenant ${id}; policy '${policy}' allows ${to}`, { output: conts[to] });

    // 7. Termination: zero continuations where the declaration allows it, and only when the plan says so
    const singleton = from === 1 && to === 1;
    const declared = nextStates.find((n) => String(n.covenantId).toLowerCase() === id);
    if (conts.length === 0) {
      if (singleton && decl.termination !== "allowed") {
        throw fail("COVENANT_TERMINATION_NOT_DECLARED", `input ${leader}: no output continues covenant ${id}, and policy '${policy}' does not declare termination = allowed`, { input: leader });
      }
      if (!declared || !Array.isArray(declared.states) || declared.states.length !== 0) {
        throw fail("V1_PLAN_INVALID", `covenant ${id} ends here (no continuation): the plan declares it, nextState with states []`, { input: leader });
      }
      if (singleton && decl.mode !== "transition") warnings.push(`covenant ${id}: termination in ${decl.mode} mode; the compiler accepts it, the documentation limits termination to transition mode`);
      if (!singleton) warnings.push(`covenant ${id}: no continuation; policy '${policy}' decides whether its transition may end the covenant`);
    }
    if (!declared) throw fail("V1_PLAN_INVALID", `input ${leader}: a transition declares the next state of covenant ${id} (nextState)`, { input: leader });
    if (declared.input !== leader) {
      throw fail("V1_PLAN_INVALID", `nextState of covenant ${id} names input ${declared.input}; its transition is input ${leader}'s (the ${decl.binding === "cov" ? "leader" : "authorizing input"})`, { input: leader });
    }
    if (JSON.stringify(declared.outputs) !== JSON.stringify(conts)) {
      throw fail("V1_PLAN_INVALID", `nextState of covenant ${id} lists outputs [${declared.outputs}]; its continuations are [${conts}], in output order`, { input: leader });
    }
    if (declared.states !== undefined) roleOf.set(leader, { ...roleOf.get(leader)!, states: (declared.states as any[]).map((s) => stateToSil(s, `nextState(${id})`)) });
    else if (!singleton) throw fail("V1_PLAN_INVALID", `covenant ${id}: a recompiled successor declares a 1:1 transition; policy '${policy}' is ${from}:${to}, declare the states`, { input: leader });
  }

  // 6. No binding without an origin: a bound output continues a covenant input; genesis outputs are in a group
  outputs.forEach((o, oi) => {
    if (!o.covenant) return;
    const id = String(o.covenant.covenantId).toLowerCase();
    const members = families.get(id);
    if (members === undefined || !members.includes(o.covenant.authorizingInput)) {
      throw fail("COVENANT_BINDING_ORPHAN", `output ${oi} is bound to covenant ${id}, which no input of this transaction continues`, { output: oi });
    }
  });
  const groups: any[] = plan.genesisCovenantGroups ?? [];
  const groupFacts: V1ContractFacts[] = [];
  for (const [gi, g] of groups.entries()) {
    const authorizing = inputs[g.authorizingInput];
    if (g.covenantId !== undefined) {
      const authOutputs = (g.outputs as number[]).map((oi) => ({
        index: oi,
        output: { value: BigInt(outputs[oi].amountSompi), scriptPublicKey: spkHexOfAddress(k, outputs[oi].address, `output ${oi}`) }
      }));
      const computed = String(k.covenantId({ transactionId: authorizing.outpoint.transactionId, index: authorizing.outpoint.index }, authOutputs));
      if (computed !== String(g.covenantId).toLowerCase()) {
        throw fail("COVENANT_GENESIS_ID_MISMATCH", `genesis group ${gi}: the plan expects covenant ${g.covenantId}, its outpoint and outputs give ${computed}`, { group: gi, computed });
      }
    }
    // 8 (genesis). Each output of the group is the P2SH of the group's compile record
    const f = g.contract ? input.facts(g.contract) : undefined;
    if (!g.contract || !f || f.compileRecordHash !== g.contract.compileRecord.contentHash || f.artifactSha256 !== g.contract.compileRecord.artifactSha256) {
      throw fail("COVENANT_GENESIS_SCRIPT_MISMATCH", `genesis group ${gi}: no reproduced compile record names the contract its outputs are locked to`, { group: gi });
    }
    for (const [kth, oi] of (g.outputs as number[]).entries()) {
      // phase 2: an output may start in another state than the record's, encoded into the same template
      let lock = f.lock;
      if (g.states !== undefined) {
        try {
          lock = v1ContractFactsAtState(f, stateToSil(g.states[kth], `genesisCovenantGroups[${gi}].states[${kth}]`)).lock;
        } catch (e: any) {
          throw fail("COVENANT_GENESIS_SCRIPT_MISMATCH", `genesis output ${oi}: its state does not encode into '${f.contractName}' (${String(e?.message ?? e)})`, { group: gi, output: oi });
        }
      }
      if (spkHexOfAddress(k, outputs[oi].address, `output ${oi}`) !== lockHex(lock)) {
        throw fail("COVENANT_GENESIS_SCRIPT_MISMATCH", `genesis output ${oi} is not the P2SH of '${f.contractName}'${g.states !== undefined ? " holding the state declared for it" : ""}`, { group: gi, output: oi });
      }
    }
    groupFacts.push(f);
  }

  // 8 (transition). Each continuation is the P2SH of its declared successor: silverc's (recompiled, 1:1) or the family's
  // template with the declared state encoded in it
  for (const [id, members] of families) {
    const leader = members[0]!;
    const f = factsOf[leader]!;
    const declared = nextStates.find((n) => String(n.covenantId).toLowerCase() === id);
    const conts = continuationsOf.get(id)!;
    if (declared.states !== undefined) {
      const states = roleOf.get(leader)!.states!;
      states.forEach((state, kth) => {
        const o = conts[kth]!;
        let lock: { version: number; script: string };
        try {
          lock = v1ContractFactsAtState(f, state).lock;
        } catch (e: any) {
          throw fail("COVENANT_SUCCESSOR_SCRIPT_MISMATCH", `output ${o}: the declared state does not encode into '${f.contractName}' (${String(e?.message ?? e)})`, { output: o });
        }
        if (spkHexOfAddress(k, outputs[o].address, `output ${o}`) !== lockHex(lock)) {
          throw fail("COVENANT_SUCCESSOR_SCRIPT_MISMATCH", `output ${o} is not the P2SH of '${f.contractName}' holding the state declared for it`, { output: o });
        }
      });
      continue;
    }
    const s = input.successor(leader);
    if (!s) throw fail("COVENANT_SUCCESSOR_SCRIPT_MISMATCH", `input ${leader}: the successor was not compiled`, { input: leader });
    if (s.templateHash !== f.templateHash) throw fail("SILVER_SUCCESSOR_TEMPLATE_CHANGED", `input ${leader}: the successor is not the same template`, { input: leader });
    if (s.bytecodeHex === f.bytecodeHex) throw fail("SILVER_SUCCESSOR_STATE_UNCHANGED", `input ${leader}: the successor has the current state`, { input: leader });
    if (s.artifactSha256 !== declared.successor.artifactSha256) {
      throw fail("COVENANT_SUCCESSOR_SCRIPT_MISMATCH", `input ${leader}: the plan declares successor ${declared.successor.artifactSha256}, silverc compiles ${s.artifactSha256}`, { input: leader });
    }
    const cont = conts[0]!;
    if (spkHexOfAddress(k, outputs[cont].address, `output ${cont}`) !== lockHex(s.lock)) {
      throw fail("COVENANT_SUCCESSOR_SCRIPT_MISMATCH", `output ${cont} is not the P2SH of the declared successor`, { output: cont });
    }
  }

  // 9. Authorization: each contract input calls its declared entry with the arguments it takes; each signature slot is
  // an account whose public key is the one the contract checks for it
  const validated: V1ValidatedInput[] = inputs.map((i, idx) => {
    if (i.kind === "p2pk") {
      // the x-only key the P2PK script pays to (step 3 checked it is the signer's when signing)
      const publicKey = P2PK_SCRIPT.exec(String(i.scriptPublicKey).toLowerCase())![1]!.slice(2, 66);
      return { index: idx, kind: "p2pk", signer: { account: i.signer, publicKey }, signatureScriptBytes: 66 };
    }
    const f = factsOf[idx]!;
    const where = `input ${idx}`;
    const contract = getSilContract(f.artifact, f.contractName).contract;
    let fnName: string | undefined = i.contract.entry;
    if (i.kind === "covenant") {
      // step 4 checked the entry against the input's role (auth, leader or delegate)
      const r = roleOf.get(idx)!;
      fnName = r.fn;
      // an entry that takes the new state(s) takes exactly the ones the plan declares
      (contract.entries[i.contract.entry]?.params ?? []).forEach((p, pi) => {
        const isState = p.type.kind === "struct" && p.type.name === "State";
        const isStates = (p.type.kind === "dynamic_array" || p.type.kind === "fixed_array") && p.type.item.kind === "struct" && p.type.item.name === "State";
        if (!isState && !isStates) return;
        const arg = i.contract.args[pi];
        const want = r.states;
        const asObject = (s: Readonly<Record<string, SilArtifactValue>>): SilArtifactValue => ({ kind: "object", value: s });
        const same =
          want !== undefined &&
          arg !== undefined &&
          arg.kind !== "signer" &&
          (isState
            ? want.length === 1 && sameValue(v1ArgToSil(arg, `${where}.args[${pi}]`), asObject(want[0]!))
            : sameValue(v1ArgToSil(arg, `${where}.args[${pi}]`), { kind: "array", value: want.map(asObject) }));
        if (!same) {
          throw fail("COVENANT_UNLOCK_MISMATCH", `${where}: '${p.name}' must be the next state${isStates ? "s" : ""} the plan declares for this transition`, { input: idx, param: p.name });
        }
      });
    } else if (!contract.entries[i.contract.entry]) {
      throw fail("SILVER_ABI_UNKNOWN_ENTRY", `${where}: '${f.contractName}' has no entry '${i.contract.entry}'`, { input: idx });
    }
    const code = i.kind === "covenant" ? "COVENANT_UNLOCK_MISMATCH" : "SILVER_ABI_ARGUMENT_INVALID";
    const unlock = placeholderUnlock(f, i.contract.entry, i.contract.args, code, where);
    const slots = signatureSlots(f, i.contract.entry, fnName ?? "", i.contract.args, input.publicKeyOf, where);
    // 9b (send). The signed unlock is the plan's entry and arguments, a SIGHASH_ALL signature in each slot
    const signed = input.signatureScripts?.[idx];
    if (signed !== undefined) {
      const ones = placeholderUnlock(f, i.contract.entry, i.contract.args, code, where, { kind: "bytes", value: new Uint8Array(65).fill(0xff) });
      if (!isPlannedUnlock(String(signed).toLowerCase(), unlock.toLowerCase(), ones.toLowerCase())) {
        throw fail("SIGNED_PLAN_MISMATCH", `${where}: the signed unlock is not the plan's entry '${i.contract.entry}' with its arguments and a SIGHASH_ALL signature in each signer slot`, { input: idx });
      }
    }
    return { index: idx, kind: i.kind, contract: { facts: f, entry: i.contract.entry, args: i.contract.args, slots }, signatureScriptBytes: unlock.length / 2 };
  });
  if (input.signatureScripts) {
    if (input.signatureScripts.length !== inputs.length) {
      throw fail("SIGNED_PLAN_MISMATCH", `the signed transaction has ${input.signatureScripts.length} signature script(s) for ${inputs.length} input(s)`);
    }
    validated.forEach((v) => {
      if (v.kind === "p2pk" && !SIGNED_P2PK_SCRIPT.test(String(input.signatureScripts![v.index]).toLowerCase())) {
        throw fail("SIGNED_PLAN_MISMATCH", `input ${v.index}: a P2PK input is unlocked by one 65-byte Schnorr signature with SIGHASH_ALL`, { input: v.index });
      }
    });
  }

  // 10. Values: every output is declared; the change goes only to the funder; the fee covers the node's floor
  const inGroup = new Set<number>(groups.flatMap((g) => g.outputs as number[]));
  outputs.forEach((o, oi) => {
    if (o.covenant || inGroup.has(oi) || o.role === "payment") return;
    if (o.role === "change") {
      if (o.address !== plan.from?.address) throw fail("V1_OUTPUT_UNDECLARED", `output ${oi}: the change goes only to the funder ${plan.from?.address}`, { output: oi });
      return;
    }
    throw fail("V1_OUTPUT_UNDECLARED", `output ${oi} is neither a continuation, a genesis output, the funder's change nor a declared payment`, { output: oi });
  });
  const outScripts = outputs.map((o, oi) => spkHexOfAddress(k, o.address, `output ${oi}`));
  const mass = measureV1Mass(
    {
      version: 1,
      inputs: validated.map((v) => ({ signatureScriptBytes: v.signatureScriptBytes, computeBudget: inputs[v.index].computeBudget })),
      outputs: outputs.map((o, oi) => ({ scriptBytes: outScripts[oi]!.length / 2 - 2, covenant: Boolean(o.covenant) || inGroup.has(oi) })),
      payloadBytes: typeof plan.payload === "string" ? plan.payload.length / 2 : 0
    },
    {
      inputs: inputs.map((i) => ({ amountSompi: BigInt(i.amountSompi), scriptBytes: String(i.scriptPublicKey).length / 2 - 2, covenantId: i.covenantId !== undefined })),
      outputs: outputs.map((o, oi) => ({ amountSompi: BigInt(o.amountSompi), scriptBytes: outScripts[oi]!.length / 2 - 2, covenantId: Boolean(o.covenant) || inGroup.has(oi) }))
    }
  );
  if (!mass.withinBlockLimits) throw fail("TX_MASS_ABOVE_STANDARD_LIMIT", `compute ${mass.computeMass}, storage ${mass.storageMass}, transient ${mass.transientMass}: above a block limit`);
  if (feeSompi < mass.minimumFeeSompi) {
    throw fail("FEE_BELOW_V1_FLOOR", `fee ${feeSompi} is below the node's floor ${mass.minimumFeeSompi} (100 sompi/g × ${mass.feeMass} g)`, { feeSompi: String(feeSompi), floorSompi: String(mass.minimumFeeSompi) });
  }
  if (BigInt(plan.storageMass) !== mass.storageMass) {
    throw fail("V1_PLAN_INVALID", `storageMass ${plan.storageMass} in the plan; the node computes ${mass.storageMass}`, { declared: plan.storageMass, computed: String(mass.storageMass) });
  }

  // 11. Network: the plan's is the node's; mainnet is never signed
  if (isMainnetNetworkId(String(plan.networkId)) || isMainnetNetworkId(String(input.node.networkId))) {
    throw fail("MAINNET_SIGNING_DISABLED", "v1 transactions are not signed for mainnet");
  }
  if (!sameNetwork(String(plan.networkId), String(input.node.networkId))) {
    throw fail("V1_NETWORK_MISMATCH", `the plan is for ${plan.networkId}, the node serves ${input.node.networkId}`);
  }

  void groupFacts;
  return { feeSompi, mass, inputs: validated, warnings };
}
