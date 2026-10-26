import { createHash } from "node:crypto";
import {
  compileSilverScript,
  compileSilverSuccessor,
  decodeSilverRuntimeState,
  getSilContract,
  parseSilAbiArtifact,
  parseSilverSourceAst,
  serializeSilArtifactValues,
  silContractBytecodeHex,
  silverContractParts,
  silverCovenantDeclarations,
  silverCovenantDelegateFunction,
  silverP2shLock,
  silverStateSuccessor,
  verifySilverTemplate,
  type SilAbiArtifact,
  type SilArtifactValue,
  type SilverCovenantDeclaration
} from "@hardkas/core";
import type { V1ArgValue } from "@hardkas/tx-builder";

/*
 * F1.4, part 1 · the contract facts. What the plan says about a contract is never trusted: the facts come from the sealed
 * compile record reproduced by the pinned silverc (same artifact bytes), from the official parser's AST (covenant
 * declarations, and which public key each `sig` parameter is checked against) and, for a transition, from the successor
 * silverc compiles with the declared state. The validator (v1-validate.ts) is pure and only reads these facts.
 */

function factsError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

const sha256Hex = (data: string | Uint8Array) => createHash("sha256").update(data).digest("hex");

/** A plan argument ({kind, value}, ints as decimal strings) as a silverscript-abi value. Signer slots are not values. */
export function v1ArgToSil(v: V1ArgValue, where = "arg"): SilArtifactValue {
  switch (v.kind) {
    case "int":
      return { kind: "int", value: BigInt(v.value) };
    case "bool":
    case "byte":
    case "text":
      return v as SilArtifactValue;
    case "bytes":
      return { kind: "bytes", value: Uint8Array.from(v.value) };
    case "array":
      return { kind: "array", value: v.value.map((x, i) => v1ArgToSil(x, `${where}[${i}]`)) };
    case "object":
      return { kind: "object", value: Object.fromEntries(Object.entries(v.value).map(([k, x]) => [k, v1ArgToSil(x, `${where}.${k}`)])) };
    case "signer":
      throw factsError("V1_PLAN_INVALID", `${where}: a signer slot is not a value`);
    default:
      throw factsError("V1_PLAN_INVALID", `${where}: unknown argument kind '${(v as any)?.kind}'`);
  }
}

/** A silverscript-abi value in the plan's JSON form. */
export function silToV1Arg(v: SilArtifactValue): V1ArgValue {
  switch (v.kind) {
    case "int":
      return { kind: "int", value: BigInt(v.value).toString() };
    case "bytes":
      return { kind: "bytes", value: Array.from(v.value as ArrayLike<number>) };
    case "array":
      return { kind: "array", value: v.value.map(silToV1Arg) };
    case "object":
      return { kind: "object", value: Object.fromEntries(Object.entries(v.value).map(([k, x]) => [k, silToV1Arg(x)])) };
    default:
      return v as V1ArgValue;
  }
}

// ---------------------------------------------------------------------------
// Signature slots: which public keys an entry checks each `sig` parameter against
// ---------------------------------------------------------------------------

type AstNode = Record<string, any>;

const hexOfBytes = (v: SilArtifactValue | undefined): string | undefined =>
  v?.kind === "bytes" && (v.value as ArrayLike<number>).length === 32 ? Buffer.from(Array.from(v.value as ArrayLike<number>)).toString("hex") : undefined;

function* calls(node: unknown): Generator<AstNode> {
  if (Array.isArray(node)) {
    for (const x of node) yield* calls(x);
    return;
  }
  if (node === null || typeof node !== "object") return;
  const n = node as AstNode;
  // an expression call (`checkSig(s, k)` inside require) or a call statement (`checkInputSig(s, w);`)
  if ((n.kind === "call" || n.kind === "function_call") && n.data && typeof n.data.name === "string") yield n.data;
  for (const v of Object.values(n)) yield* calls(v);
}

const identifierOf = (e: AstNode | undefined): string | undefined => (e?.kind === "identifier" && typeof e.data === "string" ? e.data : undefined);
const identifiersOfArray = (e: AstNode | undefined): string[] | undefined => {
  const items = e?.kind === "array" ? e.data : undefined;
  if (!Array.isArray(items)) return undefined;
  const ids = items.map((x: AstNode) => identifierOf(x));
  return ids.every((x): x is string => x !== undefined) ? ids : undefined;
};

/**
 * For one function of the source (an entry, a covenant policy whose generated entry wraps it, or a delegate body): each
 * `sig` parameter and the 32-byte public keys it is checked against, resolved from `checkSig(sig, key)` and
 * `checkMultiSig([sigs], [keys])` calls. A key is a plain identifier (or `pubkey(identifier)`) naming a constructor
 * parameter, a State field (its value in `state`, the state the spent UTXO holds; else the constructor parameter that
 * initializes it directly), or a `pubkey` parameter of the function. Calls to the contract's own helper functions are
 * followed, their parameters bound to the caller's arguments. `null` = HardKAS cannot tell which key the contract names
 * for that slot (any other expression): the engine then refuses to sign it (SIGNER_SLOT_KEY_UNRESOLVED), never guesses.
 */
export function silverSignatureSlotKeys(
  ast: AstNode,
  functionName: string,
  constructorArgs: readonly SilArtifactValue[],
  functionArgs: Readonly<Record<string, SilArtifactValue | undefined>> = {},
  state?: Readonly<Record<string, SilArtifactValue>>
): Record<string, string[] | null> {
  const functions = (ast.functions ?? []) as AstNode[];
  const fn = functions.find((f) => f.name === functionName);
  if (!fn) return {};
  const ctorParams = ((ast.params ?? []) as AstNode[]).map((p) => String(p.name));
  const fields = (ast.fields ?? []) as AstNode[];
  const fnParams = (fn.params ?? []) as AstNode[];
  const sigParams = fnParams.filter((p) => p.type_ref?.base === "sig").map((p) => String(p.name));

  // the key a name stands for, in the scope of the top-level function
  const keyOfName = (name: string): string | undefined => {
    const ci = ctorParams.indexOf(name);
    if (ci >= 0) return hexOfBytes(constructorArgs[ci]);
    const field = fields.find((f) => f.name === name);
    if (field) {
      if (state && name in state) return hexOfBytes(state[name]);
      const fromParam = identifierOf(field.expr);
      const pi = fromParam !== undefined ? ctorParams.indexOf(fromParam) : -1;
      return pi >= 0 ? hexOfBytes(constructorArgs[pi]) : undefined;
    }
    const fp = fnParams.find((p) => p.name === name);
    if (fp && fp.type_ref?.base === "pubkey") return hexOfBytes(functionArgs[name]);
    return undefined;
  };
  // an expression naming a key: `x` or `pubkey(x)`
  const keyExpr = (e: AstNode | undefined): string | undefined => {
    if (e?.kind === "call" && e.data?.name === "pubkey" && Array.isArray(e.data.args) && e.data.args.length === 1) return identifierOf(e.data.args[0]);
    return identifierOf(e);
  };

  const out: Record<string, string[] | null> = Object.fromEntries(sigParams.map((s) => [s, [] as string[]]));
  const unresolved = new Set<string>();
  /**
   * Walk a body. `sigOf`: the top-level sig a local name stands for; `keyOf`: the key a local name stands for (undefined:
   * not a key this analysis can follow).
   */
  const walk = (body: unknown, sigOf: (local: string) => string | undefined, keyOf: (local: string) => string | undefined, visiting: Set<string>) => {
    for (const call of calls(body)) {
      const args = (call.args ?? []) as AstNode[];
      if (call.name === "checkSig") {
        const sigLocal = identifierOf(args[0]);
        const sig = sigLocal !== undefined ? sigOf(sigLocal) : undefined;
        if (sig === undefined) continue;
        const keyLocal = keyExpr(args[1]);
        const k = keyLocal !== undefined ? keyOf(keyLocal) : undefined;
        if (k === undefined) unresolved.add(sig);
        else (out[sig] as string[]).push(k);
      } else if (call.name === "checkMultiSig") {
        const sigs = (identifiersOfArray(args[0]) ?? []).map(sigOf).filter((s): s is string => s !== undefined);
        const items = args[1]?.kind === "array" && Array.isArray(args[1].data) ? (args[1].data as AstNode[]) : undefined;
        const resolved = items?.map((x) => {
          const local = keyExpr(x);
          return local !== undefined ? keyOf(local) : undefined;
        });
        for (const sig of sigs) {
          if (!resolved || resolved.some((k) => k === undefined)) unresolved.add(sig);
          else (out[sig] as string[]).push(...(resolved as string[]));
        }
      } else {
        // a helper of the contract: its parameters stand for the caller's arguments
        const helper = functions.find((f) => f.name === call.name && f.entrypoint !== true);
        if (!helper || visiting.has(helper.name)) continue;
        const params = (helper.params ?? []) as AstNode[];
        const bound = new Map<string, string | undefined>();
        params.forEach((p, i) => bound.set(String(p.name), identifierOf(args[i])));
        const helperSigOf = (local: string) => {
          const outer = bound.get(local);
          return outer !== undefined ? sigOf(outer) : undefined;
        };
        const helperKeyOf = (local: string) => {
          if (bound.has(local)) {
            const outer = bound.get(local);
            return outer !== undefined ? keyOf(outer) : undefined;
          }
          return keyOfName(local); // contract-level names (constructor params, State fields)
        };
        walk(helper.body, helperSigOf, helperKeyOf, new Set([...visiting, String(helper.name)]));
      }
    }
  };
  walk(fn.body, (local) => (local in out ? local : undefined), keyOfName, new Set([String(fn.name)]));
  for (const sig of sigParams) {
    const keys = out[sig] as string[];
    out[sig] = unresolved.has(sig) || keys.length === 0 ? null : [...new Set(keys)];
  }
  return out;
}

// ---------------------------------------------------------------------------
// Facts
// ---------------------------------------------------------------------------

export interface V1ContractFacts {
  readonly compileRecordHash: string;
  readonly artifactSha256: string;
  readonly artifact: SilAbiArtifact;
  readonly contractName: string;
  readonly constructorArgs: readonly SilArtifactValue[];
  readonly bytecodeHex: string;
  readonly lock: { readonly version: number; readonly script: string };
  readonly templateHash: string;
  readonly declarations: readonly SilverCovenantDeclaration[];
  /** The official parser's AST of the source (for signature slots). */
  readonly ast: AstNode;
  /** Phase 2 · the State this bytecode holds (decoded canonically from its state span; empty for a stateless contract). */
  readonly state: Readonly<Record<string, SilArtifactValue>>;
  /** Phase 2 · the function the contract marks `#[covenant.delegate]` (the body of its delegate entry), if any. */
  readonly delegateFunction?: string | undefined;
}

export interface V1SuccessorFacts {
  readonly artifact: SilAbiArtifact;
  readonly artifactSha256: string;
  readonly bytecodeHex: string;
  readonly lock: { readonly version: number; readonly script: string };
  readonly templateHash: string;
  readonly constructorArgs: readonly SilArtifactValue[];
}

/** Facts from an artifact already reproduced (offline use and tests); `gatherV1ContractFacts` produces the same with silverc. */
export function v1ContractFactsFromArtifact(input: {
  readonly compileRecordHash: string;
  readonly artifactSha256: string;
  readonly artifact: unknown;
  readonly contractName: string;
  readonly constructorArgs: readonly SilArtifactValue[];
  readonly ast: AstNode;
}): V1ContractFacts {
  const artifact = parseSilAbiArtifact(input.artifact);
  const { name, contract } = getSilContract(artifact, input.contractName);
  const bytecodeHex = silContractBytecodeHex(contract);
  // silverscript-abi verify_compiled_contract: the covenant entries the artifact names exist
  for (const entry of [...Object.values(contract.cov_decl_to_abi ?? {}), ...(contract.delegate_entry_abi !== undefined ? [contract.delegate_entry_abi] : [])]) {
    if (!contract.entries[entry]) throw factsError("SILVER_ARTIFACT_INCONSISTENT", `'${name}' names covenant entry '${entry}', which it does not have`);
  }
  // a contract with State: its template verified (canonical state span, template hash of its prefix and suffix)
  const state = contract.runtime_state.fields.length > 0 ? verifySilverTemplate(artifact, name).state : {};
  const delegateFunction = silverCovenantDelegateFunction(input.ast);
  return {
    compileRecordHash: input.compileRecordHash,
    artifactSha256: input.artifactSha256,
    artifact,
    contractName: name,
    constructorArgs: input.constructorArgs,
    bytecodeHex,
    lock: silverP2shLock(bytecodeHex),
    templateHash: Buffer.from(contract.compiled.template_hash).toString("hex"),
    declarations: silverCovenantDeclarations(input.ast),
    ast: input.ast,
    state,
    ...(delegateFunction ? { delegateFunction } : {})
  };
}

/**
 * Phase 2 · the facts of the same contract holding another State: its template with that state encoded in it
 * (silverscript-abi), every field given. The ABI, declarations and template hash are the contract's; only the bytecode,
 * its lock and the state change.
 */
export function v1ContractFactsAtState(facts: V1ContractFacts, state: Readonly<Record<string, SilArtifactValue>>): V1ContractFacts {
  let successor: ReturnType<typeof silverStateSuccessor>;
  try {
    successor = silverStateSuccessor(facts.artifact, facts.contractName, state);
  } catch (e: any) {
    throw factsError(e?.code === "SILVER_ARTIFACT_INCONSISTENT" ? e.code : "SILVER_STATE_INVALID", `the state of '${facts.contractName}' does not encode: ${String(e?.message ?? e).replace(/^[A-Z_]+:\s*/, "")}`);
  }
  const contract = getSilContract(facts.artifact, facts.contractName).contract;
  const parts = silverContractParts(contract);
  const decoded = decodeSilverRuntimeState(facts.artifact, facts.contractName, successor.bytecodeHex.slice(parts.prefix.length, successor.bytecodeHex.length - parts.suffix.length));
  return { ...facts, bytecodeHex: successor.bytecodeHex, lock: successor.lock, state: decoded };
}

/** The successor facts from a successor artifact (offline use and tests). */
export function v1SuccessorFactsFromArtifact(input: { readonly artifact: unknown; readonly artifactSha256: string; readonly contractName: string; readonly constructorArgs: readonly SilArtifactValue[] }): V1SuccessorFacts {
  const artifact = parseSilAbiArtifact(input.artifact);
  const { contract } = getSilContract(artifact, input.contractName);
  const bytecodeHex = silContractBytecodeHex(contract);
  return {
    artifact,
    artifactSha256: input.artifactSha256,
    bytecodeHex,
    lock: silverP2shLock(bytecodeHex),
    templateHash: Buffer.from(contract.compiled.template_hash).toString("hex"),
    constructorArgs: input.constructorArgs
  };
}

/** The part of a sealed silver compile record (hardkas.silver.compile.v1) the facts read. */
export interface SilverCompileRecordLike {
  readonly contentHash: string;
  readonly source: { readonly text: string; readonly sha256: string };
  readonly provenance: { readonly artifactSha256: string; readonly constructorArgsSha256: string };
  readonly artifactJson: string;
}

/**
 * The facts of a compiled contract, with silverc: the record's constructor-argument digest matches the arguments given
 * (SILVER_CONSTRUCTOR_ARGS_MISMATCH), the pinned silverc reproduces the record's artifact byte for byte
 * (SILVER_RECORD_NOT_REPRODUCED), and the official parser gives the declarations and the AST.
 */
export async function gatherV1ContractFacts(input: {
  readonly record: SilverCompileRecordLike;
  readonly contractName: string;
  readonly constructorArgs: readonly SilArtifactValue[];
  readonly home?: string | undefined;
}): Promise<V1ContractFacts> {
  const r = input.record;
  if (sha256Hex(serializeSilArtifactValues(input.constructorArgs)) !== r.provenance.constructorArgsSha256) {
    throw factsError("SILVER_CONSTRUCTOR_ARGS_MISMATCH", "these constructor arguments are not the ones the record was compiled with");
  }
  const compiled = await compileSilverScript({ source: r.source.text, constructorArgs: input.constructorArgs, home: input.home });
  if (Buffer.from(compiled.artifactBytes).toString("utf8") !== r.artifactJson || compiled.provenance.artifactSha256 !== r.provenance.artifactSha256) {
    throw factsError("SILVER_RECORD_NOT_REPRODUCED", "the pinned silverc does not reproduce the compile record");
  }
  const ast = await parseSilverSourceAst(r.source.text, input.home);
  return v1ContractFactsFromArtifact({
    compileRecordHash: r.contentHash,
    artifactSha256: r.provenance.artifactSha256,
    artifact: compiled.artifact,
    contractName: input.contractName,
    constructorArgs: input.constructorArgs,
    ast
  });
}

/**
 * V1-ENGINE-2 · the constructor arguments of a compile record, proven. The record keeps only their digest, and the engine
 * needs the values to reproduce the contract with silverc and to tell which key each signature slot is checked against.
 * They are: the ones given (their digest must be the record's: SILVER_CONSTRUCTOR_ARGS_MISMATCH); none, for a contract
 * without parameters; or assembled from what the operation already names — a `pubkey`/`byte[32]` parameter a signature
 * slot of the called function checks, from that slot's signer key; a parameter that initializes a State field directly,
 * from the state the record's artifact holds — and kept only when their digest is the record's. When a signer's key was
 * used and the digest does not match, that key is not the one the contract holds (SIGNER_SLOT_KEY_MISMATCH, before any
 * private key is read); a parameter nothing fills: SILVER_CONSTRUCTOR_ARGS_REQUIRED. Nothing is assumed.
 */
export function resolveV1ConstructorArgs(input: {
  readonly record: Pick<SilverCompileRecordLike, "provenance" | "artifactJson">;
  readonly contractName: string;
  readonly ast: AstNode;
  readonly explicit?: readonly SilArtifactValue[] | undefined;
  /** The function the operation calls and, for each of its `sig` parameters, the x-only key of the account signing it. */
  readonly slots?: { readonly functionName: string; readonly signers: Readonly<Record<string, string>> } | undefined;
}): { readonly constructorArgs: readonly SilArtifactValue[]; readonly source: "given" | "no parameters" | "derived"; readonly derived: readonly string[] } {
  const digest = input.record.provenance.constructorArgsSha256;
  const digestOf = (args: readonly SilArtifactValue[]) => sha256Hex(serializeSilArtifactValues(args));
  if (input.explicit !== undefined) {
    if (digestOf(input.explicit) !== digest) throw factsError("SILVER_CONSTRUCTOR_ARGS_MISMATCH", "these constructor arguments are not the ones the record was compiled with");
    return { constructorArgs: input.explicit, source: "given", derived: [] };
  }
  const params = ((input.ast.params ?? []) as AstNode[]).map((p) => ({ name: String(p.name), type: p.type_ref as AstNode }));
  if (params.length === 0 && digestOf([]) === digest) return { constructorArgs: [], source: "no parameters", derived: [] };
  const values: Array<SilArtifactValue | undefined> = params.map(() => undefined);
  const derived: string[] = [];
  const isKey = (t: AstNode) => t?.base === "pubkey" || (t?.base === "byte" && Array.isArray(t.array_dims) && t.array_dims.length === 1 && Number(t.array_dims[0]?.value) === 32);

  // a parameter that initializes a State field directly: the value the record's artifact holds for that field
  const artifact = parseSilAbiArtifact(JSON.parse(input.record.artifactJson));
  const { name, contract } = getSilContract(artifact, input.contractName);
  if (contract.runtime_state.fields.length > 0) {
    const state = verifySilverTemplate(artifact, name).state;
    for (const f of (input.ast.fields ?? []) as AstNode[]) {
      const from = identifierOf(f.expr);
      const pi = from !== undefined ? params.findIndex((p) => p.name === from) : -1;
      if (pi >= 0 && state[String(f.name)] !== undefined) {
        values[pi] = state[String(f.name)];
        derived.push(`${params[pi]!.name} = the initial State '${f.name}'`);
      }
    }
  }
  // a key parameter a signature slot checks: the slot's signer key (found by giving each key parameter a marker value)
  let usedSigner = false;
  if (input.slots) {
    const marker = (i: number) => sha256Hex(`hardkas-constructor-parameter-marker:${i}`);
    const markerArgs: SilArtifactValue[] = params.map((p, i) => (isKey(p.type) ? { kind: "bytes", value: Uint8Array.from(Buffer.from(marker(i), "hex")) } : { kind: "int", value: 0n }));
    const keys = silverSignatureSlotKeys(input.ast, input.slots.functionName, markerArgs);
    for (const [sig, ks] of Object.entries(keys)) {
      const signerKey = input.slots.signers[sig]?.toLowerCase();
      if (!ks || ks.length !== 1 || signerKey === undefined) continue;
      const pi = params.findIndex((_, i) => marker(i) === ks[0]);
      if (pi < 0) continue;
      const value: SilArtifactValue = { kind: "bytes", value: Uint8Array.from(Buffer.from(signerKey, "hex")) };
      if (values[pi] !== undefined && hexOfBytes(values[pi]) !== signerKey) {
        throw factsError("SIGNER_SLOT_KEY_MISMATCH", `'${sig}' is checked against '${params[pi]!.name}', which holds another key than its signer's`);
      }
      values[pi] = value;
      usedSigner = true;
      derived.push(`${params[pi]!.name} = the key of '${sig}''s signer`);
    }
  }
  const missing = params.filter((_, i) => values[i] === undefined).map((p) => p.name);
  if (missing.length > 0) {
    throw factsError(
      "SILVER_CONSTRUCTOR_ARGS_REQUIRED",
      `the compile record keeps only a digest of the constructor arguments, and ${missing.map((m) => `'${m}'`).join(", ")} is neither checked by a signature of this operation nor the initial value of a State field: give the constructor arguments the contract was compiled with`
    );
  }
  const args = values as SilArtifactValue[];
  if (digestOf(args) !== digest) {
    if (usedSigner) {
      throw factsError("SIGNER_SLOT_KEY_MISMATCH", "the contract was compiled for other keys than the signers of this operation (the constructor arguments they give do not match the record's digest); nothing was signed");
    }
    throw factsError("SILVER_CONSTRUCTOR_ARGS_REQUIRED", "the constructor arguments the record's state gives do not match its digest: give the ones the contract was compiled with");
  }
  return { constructorArgs: args, source: "derived", derived };
}

/** The successor of a transition, with silverc (same template, only the state changes; refused otherwise). */
export async function gatherV1SuccessorFacts(input: {
  readonly record: SilverCompileRecordLike;
  readonly contractName: string;
  readonly constructorArgs: readonly SilArtifactValue[];
  readonly stateToConstructorArg: Readonly<Record<string, number>>;
  readonly nextState: Readonly<Record<string, SilArtifactValue>>;
  readonly home?: string | undefined;
}): Promise<V1SuccessorFacts> {
  const next = await compileSilverSuccessor({
    source: input.record.source.text,
    constructorArgs: input.constructorArgs,
    contractName: input.contractName,
    stateToConstructorArg: input.stateToConstructorArg,
    nextState: input.nextState,
    home: input.home
  });
  return v1SuccessorFactsFromArtifact({
    artifact: next.successor.artifact,
    artifactSha256: next.successor.provenance.artifactSha256,
    contractName: input.contractName,
    constructorArgs: next.successorConstructorArgs
  });
}
