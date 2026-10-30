/*
 * F1.1 · the v1 transaction plan: one artifact that describes a whole Toccata v1 transaction before it is signed.
 *
 * It is the existing TxPlan artifact (`hardkas.txPlan`) with `txVersion: 1` and the v1 fields below; a v0 plan carries
 * none of them, so its content hash does not change. Amounts are decimal strings (artifact form). This module is pure:
 * it validates the SHAPE of a plan (codes below) and derives what the mass formulas need. Whether the inputs exist, what
 * the contract allows and whether a transition is valid is F1.4 (accounts), against the node and the compiler.
 */

import { V1_MASS_PARAMS } from "./v1-mass.js";

/** How an input is unlocked: a P2PK key, a SilverScript contract entry (P2SH), or a covenant's generated entry. */
export type V1InputKind = "p2pk" | "p2sh" | "covenant";

/** A signature slot of a contract entry: filled at signing time by the named account's key, never in the plan. */
export interface V1SignerSlot {
  readonly kind: "signer";
  readonly signer: string;
}

/** A constructor or entry argument in silverscript-abi's {kind, value} form (ints as decimal strings), or a signer slot. */
export type V1ArgValue =
  | { readonly kind: "int"; readonly value: string }
  | { readonly kind: "bool"; readonly value: boolean }
  | { readonly kind: "byte"; readonly value: number }
  | { readonly kind: "bytes"; readonly value: readonly number[] }
  | { readonly kind: "text"; readonly value: string }
  | { readonly kind: "array"; readonly value: readonly V1ArgValue[] }
  | { readonly kind: "object"; readonly value: Readonly<Record<string, V1ArgValue>> }
  | V1SignerSlot;

/** A sealed silver compile record and the constructor arguments it was compiled with (public data: silverc reproduces it). */
export interface V1CompiledContract {
  readonly compileRecord: { readonly contentHash: string; readonly artifactSha256: string; readonly path?: string | undefined };
  readonly contract: string;
  readonly constructorArgs: readonly V1ArgValue[];
}

/** The contract an input unlocks: its sealed compile record, the entry called and its arguments. */
export interface V1ContractRef {
  readonly compileRecord: { readonly contentHash: string; readonly artifactSha256: string; readonly path?: string | undefined };
  readonly contract: string;
  /** The constructor arguments of the compile record (checked against the record's digest, reproduced by silverc). */
  readonly constructorArgs: readonly V1ArgValue[];
  /**
   * Phase 2 · the State the spent UTXO holds when it is not the compile record's own (a successor a transition created):
   * the input is then locked to the record's template with this state encoded in it (silverscript-abi), every field given.
   */
  readonly state?: Readonly<Record<string, V1ArgValue>> | undefined;
  /**
   * The ABI entry the unlock calls. For a covenant input: the generated entry of its declaration (auth:
   * `__covenant_entrypoint_auth_<policy>`; cov: the leader entry at the group's first input, the delegate entry at the
   * others).
   */
  readonly entry: string;
  /** For a covenant input: the declaration (policy) of the transition (a delegate names its leader's). */
  readonly policy?: string | undefined;
  readonly args: readonly V1ArgValue[];
}

export interface V1PlanInput {
  readonly outpoint: { readonly transactionId: string; readonly index: number };
  readonly amountSompi: string;
  readonly address: string;
  /** "<2-byte version><script>" hex, as the node lists it. */
  readonly scriptPublicKey: string;
  readonly blockDaaScore?: string | undefined;
  readonly isCoinbase?: boolean | undefined;
  /** Set for a covenant's UTXO (the node reports it). */
  readonly covenantId?: string | undefined;
  readonly kind: V1InputKind;
  /** u16; script units allowed = budget × 10,000 + 9,999. Explicit: there is no estimator. */
  readonly computeBudget: number;
  /** Required for p2sh and covenant inputs; absent for p2pk. */
  readonly contract?: V1ContractRef | undefined;
  /** The account whose key signs a p2pk input. */
  readonly signer?: string | undefined;
  /**
   * V1-ENGINE-2 · the input's sequence (u64, decimal), for a contract with a relative time lock (`this.age…`); 0 when
   * absent. The node decides whether the lock is met (SEQUENCE_LOCK_REJECTED); the signature hash commits to it.
   */
  readonly sequence?: string | undefined;
}

export interface V1PlanOutput {
  readonly address: string;
  readonly amountSompi: string;
  /** A continuation: the output is bound to an existing covenant, authorized by that covenant's input. */
  readonly covenant?: { readonly authorizingInput: number; readonly covenantId: string } | undefined;
  /**
   * "change": the P2PK change back to the funder (F1.4 checks it goes only there). "payment": an output the plan's author
   * declares on purpose (a contract's release, a sweep). Bound outputs and genesis members need no role; any other
   * output is undeclared (V1_OUTPUT_UNDECLARED).
   */
  readonly role?: "change" | "payment" | undefined;
}

export interface V1GenesisGroup {
  readonly authorizingInput: number;
  readonly outputs: readonly number[];
  /** The contract the group's outputs are locked to (F1.4 checks each is that contract's P2SH). */
  readonly contract?: V1CompiledContract | undefined;
  /** The covenant id the planner expects the group to get (F1.4 recomputes it: COVENANT_GENESIS_ID_MISMATCH). */
  readonly covenantId?: string | undefined;
  /**
   * Phase 2 · the State each output of the group starts with, in the order of `outputs` (encoded into the contract's
   * template). Absent: every output holds the compile record's own state.
   */
  readonly states?: readonly Readonly<Record<string, V1ArgValue>>[] | undefined;
}

/**
 * The state(s) a transition moves a covenant to, as declared in the plan (F1.4 checks each continuation is the P2SH of the
 * contract's template with that state). Two forms:
 *  - `successor` (phase 1, 1:1): the successor silverc compiles from the declared state, each State field initialized
 *    directly by one constructor parameter;
 *  - `states` (phase 2): one State per continuation, in output order (output `outputs[k]` ↔ new state `k`), encoded into
 *    the current template by silverscript-abi's codec: any state the ABI encodes, any number of continuations (zero:
 *    termination, where the declaration allows it).
 * `input` is the covenant input the continuations belong to: the authorizing input (auth) or the group's leader (cov).
 */
export type V1NextState =
  | {
      readonly covenantId: string;
      readonly input: number;
      readonly outputs: readonly number[];
      readonly successor: {
        readonly artifactSha256: string;
        readonly constructorArgs: readonly V1ArgValue[];
        readonly stateToConstructorArg: Readonly<Record<string, number>>;
        readonly state: Readonly<Record<string, V1ArgValue>>;
      };
    }
  | {
      readonly covenantId: string;
      readonly input: number;
      readonly outputs: readonly number[];
      readonly states: readonly Readonly<Record<string, V1ArgValue>>[];
    };

/** The v1 part of a TxPlan artifact (plus the base fields every plan has). */
export interface V1PlanBody {
  readonly txVersion: 1;
  readonly inputs: readonly V1PlanInput[];
  readonly outputs: readonly V1PlanOutput[];
  readonly genesisCovenantGroups?: readonly V1GenesisGroup[] | undefined;
  readonly payload?: string | undefined;
  readonly estimatedFeeSompi: string;
  readonly estimatedMass: string;
  readonly storageMass: string;
  /** Mandatory in v1 (V1_FEE_LIMIT_REQUIRED). */
  readonly maxFeeSompi?: string | undefined;
  /** "txid:index" of every covenant input, so F1.6 finds pending sends by covenant. */
  readonly covenantOutpoints?: readonly string[] | undefined;
  readonly nextState?: readonly V1NextState[] | undefined;
  /** A v0 field; a v1 plan commits a budget per input instead (both at once is invalid). */
  readonly computeBudget?: string | undefined;
}

export function v1PlanError(code: string, reason: string, detail?: Record<string, unknown>): Error {
  const err = new Error(`${code}: ${reason}`);
  (err as any).code = code;
  (err as any).reason = reason;
  if (detail) (err as any).detail = detail;
  return err;
}

const invalid = (reason: string, detail?: Record<string, unknown>) => v1PlanError("V1_PLAN_INVALID", reason, detail);

const HEX64 = /^[0-9a-f]{64}$/;
const HEX = /^(?:[0-9a-f]{2})*$/;
const AMOUNT = /^(0|[1-9]\d*)$/;
const ARG_KINDS = new Set(["int", "bool", "byte", "bytes", "text", "array", "object", "signer"]);
/**
 * Field names that would carry resolved key material or a resolved signature; a plan never holds one, at any depth.
 * Argument values (`args`, `constructorArgs`, `state`) are not scanned by name: a contract's struct may name a field
 * `sig`. They are checked by form (checkArg) here and by ABI type (a `sig` parameter must be a signer slot) in F1.4.
 */
const SECRET_KEYS = new Set(["privateKey", "private_key", "secret", "secretKey", "mnemonic", "seed", "xprv", "signature", "signatureScript", "password"]);
const ARG_CONTAINERS = new Set(["args", "constructorArgs", "state"]);

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function amount(v: unknown, where: string): bigint {
  if (typeof v !== "string" || !AMOUNT.test(v)) throw invalid(`${where} is not a decimal amount`, { where, value: v });
  return BigInt(v);
}

function scanSecrets(v: unknown, where: string): void {
  if (Array.isArray(v)) return v.forEach((x, i) => scanSecrets(x, `${where}[${i}]`));
  if (!isObject(v)) return;
  for (const [k, x] of Object.entries(v)) {
    if (SECRET_KEYS.has(k)) throw invalid(`${where}.${k}: a plan never carries a key or a resolved signature`, { where: `${where}.${k}` });
    if (ARG_CONTAINERS.has(k)) continue;
    scanSecrets(x, `${where}.${k}`);
  }
}

function checkArg(v: unknown, where: string): void {
  if (!isObject(v) || typeof v.kind !== "string" || !ARG_KINDS.has(v.kind)) {
    throw invalid(`${where}: an argument is {kind, value} of int, bool, byte, bytes, text, array or object, or a signer slot {kind: "signer", signer}`, { where });
  }
  switch (v.kind) {
    case "signer":
      if (typeof v.signer !== "string" || v.signer.length === 0 || Object.keys(v).some((k) => k !== "kind" && k !== "signer")) {
        throw invalid(`${where}: a signer slot is exactly {kind: "signer", signer: "<account>"}`, { where });
      }
      return;
    case "int":
      if (typeof v.value !== "string" || !/^-?(0|[1-9]\d*)$/.test(v.value)) throw invalid(`${where}: int values are decimal strings`, { where });
      return;
    case "bool":
      if (typeof v.value !== "boolean") throw invalid(`${where}: bool value is not a boolean`, { where });
      return;
    case "byte":
      if (!Number.isInteger(v.value) || (v.value as number) < 0 || (v.value as number) > 255) throw invalid(`${where}: byte out of range`, { where });
      return;
    case "bytes":
      if (!Array.isArray(v.value) || !v.value.every((b) => Number.isInteger(b) && b >= 0 && b <= 255)) throw invalid(`${where}: bytes is not a byte array`, { where });
      return;
    case "text":
      if (typeof v.value !== "string") throw invalid(`${where}: text value is not a string`, { where });
      return;
    case "array":
      if (!Array.isArray(v.value)) throw invalid(`${where}: array value is not a list`, { where });
      v.value.forEach((x, i) => checkArg(x, `${where}[${i}]`));
      return;
    case "object":
      if (!isObject(v.value)) throw invalid(`${where}: object value is not an object`, { where });
      for (const [k, x] of Object.entries(v.value)) checkArg(x, `${where}.${k}`);
      return;
  }
}

function checkCompiled(c: unknown, where: string): void {
  if (!isObject(c)) throw invalid(`${where}: missing contract reference`, { where });
  const rec = c.compileRecord;
  if (!isObject(rec) || typeof rec.contentHash !== "string" || !HEX64.test(rec.contentHash) || typeof rec.artifactSha256 !== "string" || !HEX64.test(rec.artifactSha256)) {
    throw invalid(`${where}.compileRecord: needs the compile record's contentHash and artifactSha256 (64 hex)`, { where });
  }
  if (typeof c.contract !== "string" || c.contract === "") throw invalid(`${where}.contract: missing contract name`, { where });
  if (!Array.isArray(c.constructorArgs)) throw invalid(`${where}.constructorArgs: the constructor arguments of the compiled state are required`, { where });
  c.constructorArgs.forEach((a, i) => {
    checkArg(a, `${where}.constructorArgs[${i}]`);
    if ((a as any).kind === "signer") throw invalid(`${where}.constructorArgs[${i}]: a constructor argument cannot be a signer slot`, { where });
  });
}

/** A State value: every field a {kind, value} argument (never a signer slot). */
function checkState(s: unknown, where: string): void {
  if (!isObject(s) || Object.keys(s).length === 0) throw invalid(`${where}: a state gives its fields as {field: {kind, value}}`, { where });
  for (const [field, v] of Object.entries(s)) {
    checkArg(v, `${where}.${field}`);
    if ((v as any).kind === "signer") throw invalid(`${where}.${field}: a state field cannot be a signer slot`, { where });
  }
}

function checkContract(c: unknown, where: string): void {
  checkCompiled(c, where);
  if (!isObject(c)) return;
  if (typeof c.entry !== "string" || c.entry === "") throw invalid(`${where}.entry: missing entry name`, { where });
  if (c.policy !== undefined && (typeof c.policy !== "string" || c.policy === "")) throw invalid(`${where}.policy: not a name`, { where });
  if (!Array.isArray(c.args)) throw invalid(`${where}.args: not a list`, { where });
  c.args.forEach((a, i) => checkArg(a, `${where}.args[${i}]`));
  if (c.state !== undefined) checkState(c.state, `${where}.state`);
}

/**
 * Checks the shape of a v1 plan (and that a v0 plan carries no v1 field). Throws V1_PLAN_INVALID with `reason`,
 * V1_FEE_LIMIT_REQUIRED, FEE_EXCEEDS_MAX or COVENANT_P2PK_INPUT_NOT_SUPPORTED. Returns the plan's fee.
 */
export function assertV1PlanShape(plan: Record<string, any>): { feeSompi: bigint } {
  const version = plan.txVersion;
  const inputs: any[] = Array.isArray(plan.inputs) ? plan.inputs : [];
  const outputs: any[] = Array.isArray(plan.outputs) ? plan.outputs : [];
  if (version !== 1) {
    // a v0 plan: no binding, no per-input budget, no v1 field
    const v1Field = ["genesisCovenantGroups", "covenantOutpoints", "nextState", "payload"].find((f) => plan[f] !== undefined);
    if (v1Field) throw invalid(`${v1Field} exists only in a v1 plan`, { field: v1Field });
    if (outputs.some((o) => o?.covenant !== undefined)) throw invalid("a covenant binding exists only in a v1 plan (consensus refuses it in v0)");
    if (inputs.some((i) => i?.computeBudget !== undefined || i?.kind !== undefined || i?.contract !== undefined)) {
      throw invalid("per-input kind, compute budget or contract exist only in a v1 plan");
    }
    return { feeSompi: BigInt(plan.estimatedFeeSompi ?? 0) };
  }

  scanSecrets(plan, "plan");
  if (!Array.isArray(plan.inputs) || inputs.length === 0) throw invalid("a v1 plan needs inputs");
  if (!Array.isArray(plan.outputs) || outputs.length === 0) throw invalid("a v1 plan needs outputs");
  if (inputs.length > V1_MASS_PARAMS.maxTxInputs) throw invalid(`more than ${V1_MASS_PARAMS.maxTxInputs} inputs`);
  if (outputs.length > V1_MASS_PARAMS.maxTxOutputs) throw invalid(`more than ${V1_MASS_PARAMS.maxTxOutputs} outputs`);
  if (plan.computeBudget !== undefined) throw invalid("a v1 plan commits a compute budget per input, not one for the whole plan");
  if (plan.change !== undefined) throw invalid("a v1 plan lists its change as an output with role \"change\"");
  if (plan.payload !== undefined && (typeof plan.payload !== "string" || !HEX.test(plan.payload))) throw invalid("payload is not lowercase hex");

  const seen = new Set<string>();
  let totalIn = 0n;
  const covenantInputs: number[] = [];
  inputs.forEach((raw, i) => {
    const where = `inputs[${i}]`;
    if (!isObject(raw) || !isObject(raw.outpoint)) throw invalid(`${where}: not an input`);
    const input: any = raw;
    const { transactionId, index } = input.outpoint as any;
    if (typeof transactionId !== "string" || !HEX64.test(transactionId) || !Number.isInteger(index) || index < 0 || index > 0xffffffff) {
      throw invalid(`${where}.outpoint is not a 64-hex transaction id and u32 index`);
    }
    const key = `${transactionId}:${index}`;
    if (seen.has(key)) throw invalid(`${where}: outpoint ${key} is spent twice`, { outpoint: key });
    seen.add(key);
    totalIn += amount(input.amountSompi, `${where}.amountSompi`);
    if (typeof input.address !== "string" || input.address === "") throw invalid(`${where}.address missing`);
    if (typeof input.scriptPublicKey !== "string" || !/^[0-9a-f]{4}(?:[0-9a-f]{2})+$/.test(input.scriptPublicKey)) {
      throw invalid(`${where}.scriptPublicKey is not "<2-byte version><script>" hex`);
    }
    if (!Number.isInteger(input.computeBudget) || input.computeBudget < 0 || input.computeBudget > 0xffff) {
      throw invalid(`${where}.computeBudget ${JSON.stringify(input.computeBudget)} is not a u16`, { where });
    }
    if (input.covenantId !== undefined && (typeof input.covenantId !== "string" || !HEX64.test(input.covenantId))) throw invalid(`${where}.covenantId is not 64 hex`);
    if (input.sequence !== undefined && (typeof input.sequence !== "string" || !/^\d{1,20}$/.test(input.sequence) || BigInt(input.sequence) > 0xffffffffffffffffn)) {
      throw invalid(`${where}.sequence is not a u64 (decimal string)`, { where });
    }
    switch (input.kind) {
      case "p2pk":
        if (input.covenantId !== undefined) {
          throw v1PlanError("COVENANT_P2PK_INPUT_NOT_SUPPORTED", `${where}: a covenant UTXO at a P2PK address is not spent in this phase`, { where });
        }
        if (input.contract !== undefined) throw invalid(`${where}: a p2pk input has no contract`);
        if (typeof input.signer !== "string" || input.signer === "") throw invalid(`${where}: a p2pk input names the account that signs it (signer)`);
        break;
      case "p2sh":
        if (input.covenantId !== undefined) throw invalid(`${where}: an input with a covenant id is declared as a covenant input, not p2sh`, { where });
        checkContract(input.contract, `${where}.contract`);
        break;
      case "covenant":
        if (input.covenantId === undefined) throw invalid(`${where}: a covenant input carries the covenant id the node reports`);
        checkContract(input.contract, `${where}.contract`);
        if (typeof input.contract.policy !== "string") throw invalid(`${where}.contract.policy: a covenant input names its declaration (policy)`);
        covenantInputs.push(i);
        break;
      default:
        throw invalid(`${where}.kind must be p2pk, p2sh or covenant`, { where });
    }
  });

  let totalOut = 0n;
  const bound = new Set<number>();
  outputs.forEach((output, o) => {
    const where = `outputs[${o}]`;
    if (!isObject(output)) throw invalid(`${where}: not an output`);
    if (typeof output.address !== "string" || output.address === "") throw invalid(`${where}.address missing`);
    totalOut += amount(output.amountSompi, `${where}.amountSompi`);
    if (output.role !== undefined && output.role !== "change" && output.role !== "payment") throw invalid(`${where}.role is "change", "payment" or absent`);
    if (output.covenant !== undefined) {
      const c = output.covenant;
      if (!isObject(c) || !Number.isInteger(c.authorizingInput) || typeof c.covenantId !== "string" || !HEX64.test(c.covenantId)) {
        throw invalid(`${where}.covenant is {authorizingInput, covenantId}`, { where });
      }
      if ((c.authorizingInput as number) < 0 || (c.authorizingInput as number) >= inputs.length) {
        throw invalid(`${where}.covenant.authorizingInput ${c.authorizingInput} is not an input`, { where });
      }
      bound.add(o);
    }
  });

  const groups: any[] = plan.genesisCovenantGroups ?? [];
  if (!Array.isArray(groups)) throw invalid("genesisCovenantGroups is not a list");
  const inGroup = new Set<number>();
  groups.forEach((g, gi) => {
    const where = `genesisCovenantGroups[${gi}]`;
    if (!isObject(g) || !Number.isInteger(g.authorizingInput) || !Array.isArray(g.outputs) || g.outputs.length === 0) throw invalid(`${where} is {authorizingInput, outputs[]}`);
    if ((g.authorizingInput as number) < 0 || (g.authorizingInput as number) >= inputs.length) throw invalid(`${where}.authorizingInput is not an input`);
    if (g.contract !== undefined) checkCompiled(g.contract, `${where}.contract`);
    if (g.covenantId !== undefined && (typeof g.covenantId !== "string" || !HEX64.test(g.covenantId))) throw invalid(`${where}.covenantId is not 64 hex`);
    if (g.states !== undefined) {
      if (g.contract === undefined) throw invalid(`${where}.states: initial states belong to a group that names its contract`, { where });
      if (!Array.isArray(g.states) || g.states.length !== g.outputs.length) throw invalid(`${where}.states: one state per output of the group, in its order`, { where });
      g.states.forEach((s, k) => checkState(s, `${where}.states[${k}]`));
    }
    for (const o of g.outputs as unknown[]) {
      if (!Number.isInteger(o) || (o as number) < 0 || (o as number) >= outputs.length) throw invalid(`${where} names output ${String(o)}, which does not exist`, { where });
      if (bound.has(o as number)) throw invalid(`output ${o} is both a continuation (bound) and in a genesis group`, { output: o });
      if (inGroup.has(o as number)) throw invalid(`output ${o} is in two genesis groups`, { output: o });
      inGroup.add(o as number);
    }
  });

  if (plan.covenantOutpoints !== undefined) {
    const declared = [...(plan.covenantOutpoints as unknown[])].map(String).sort();
    const actual = covenantInputs.map((i) => `${inputs[i].outpoint.transactionId}:${inputs[i].outpoint.index}`).sort();
    if (JSON.stringify(declared) !== JSON.stringify(actual)) throw invalid("covenantOutpoints must list exactly the covenant inputs", { declared, actual });
  } else if (covenantInputs.length > 0) {
    throw invalid("a plan that spends a covenant lists its outpoints in covenantOutpoints");
  }

  const nextStates: unknown = plan.nextState ?? [];
  if (!Array.isArray(nextStates)) throw invalid("nextState is not a list");
  const continued = new Set<number>();
  nextStates.forEach((n, ni) => {
    const where = `nextState[${ni}]`;
    if (!isObject(n) || typeof n.covenantId !== "string" || !HEX64.test(n.covenantId) || !Number.isInteger(n.input) || !Array.isArray(n.outputs)) {
      throw invalid(`${where} is {covenantId, input, outputs[], successor | states}`, { where });
    }
    if (!covenantInputs.includes(n.input as number) || inputs[n.input as number].covenantId !== n.covenantId) {
      throw invalid(`${where}.input ${String(n.input)} is not an input of covenant ${n.covenantId}`, { where });
    }
    for (const o of n.outputs as unknown[]) {
      if (!Number.isInteger(o) || (o as number) < 0 || (o as number) >= outputs.length) throw invalid(`${where} names output ${String(o)}, which does not exist`, { where });
      if (continued.has(o as number)) throw invalid(`output ${String(o)} is the next state of two transitions`, { where });
      continued.add(o as number);
    }
    if ((n.successor !== undefined) === (n.states !== undefined)) throw invalid(`${where} declares either a recompiled successor or the encoded states`, { where });
    if (n.states !== undefined) {
      if (!Array.isArray(n.states) || n.states.length !== (n.outputs as unknown[]).length) throw invalid(`${where}.states: one state per continuation, in output order`, { where });
      n.states.forEach((s, k) => checkState(s, `${where}.states[${k}]`));
    } else {
      const s = n.successor;
      if (!isObject(s) || typeof s.artifactSha256 !== "string" || !HEX64.test(s.artifactSha256) || !Array.isArray(s.constructorArgs) || !isObject(s.stateToConstructorArg)) {
        throw invalid(`${where}.successor is {artifactSha256, constructorArgs, stateToConstructorArg, state}`, { where });
      }
      s.constructorArgs.forEach((a, i) => checkArg(a, `${where}.successor.constructorArgs[${i}]`));
      checkState(s.state, `${where}.successor.state`);
    }
  });

  const fee = totalIn - totalOut;
  if (fee < 0n) throw invalid(`outputs (${totalOut}) exceed inputs (${totalIn})`);
  if (amount(plan.estimatedFeeSompi, "estimatedFeeSompi") !== fee) {
    throw invalid(`estimatedFeeSompi ${plan.estimatedFeeSompi} is not inputs − outputs (${fee})`);
  }
  amount(plan.estimatedMass, "estimatedMass");
  amount(plan.storageMass, "storageMass");
  if (plan.maxFeeSompi === undefined) {
    throw v1PlanError("V1_FEE_LIMIT_REQUIRED", "a v1 plan records the fee limit (maxFeeSompi) it was made under");
  }
  const max = amount(plan.maxFeeSompi, "maxFeeSompi");
  if (fee > max) throw v1PlanError("FEE_EXCEEDS_MAX", `fee ${fee} exceeds the plan's limit ${max}`, { feeSompi: String(fee), maxFeeSompi: String(max) });
  return { feeSompi: fee };
}

/** True when the plan is a v1 plan (txVersion 1). */
export const isV1Plan = (plan: unknown): boolean => isObject(plan) && plan.txVersion === 1;
