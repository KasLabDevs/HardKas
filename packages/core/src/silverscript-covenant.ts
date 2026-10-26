import {
  compileSilverScript,
  getSilContract,
  parseSilverSourceAst,
  type SilArtifactValue,
  type SilverCompileResult
} from "./silverscript.js";

/**
 * Successor state of a SilverScript covenant, produced by the official compiler.
 *
 * A covenant's `State` lives inside its bytecode (the contract's `state_span`),
 * and its encoding belongs to the compiler's lowering. HardKAS does not encode
 * it: it recompiles the same source with the new state in the constructor
 * arguments, which is only sound when each `State` field is initialized
 * directly by one declared constructor parameter. The result must then be the
 * same template with only the state bytes changed; anything else is refused.
 */

function covenantError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

// ---------------------------------------------------------------------------
// What the official parser says about the source
// ---------------------------------------------------------------------------

type AstNode = Record<string, any>;

/** A `#[covenant...]` declaration as written, with the spec's defaults applied (docs/DECL.md rules 5-6). */
export interface SilverCovenantDeclaration {
  readonly policy: string;
  readonly form: string;
  readonly binding: string;
  readonly from: number | string;
  readonly to: number | string;
  readonly mode: string;
  /** As written; absent means the spec's default (auth → multiple, cov → single). */
  readonly groups?: string;
  /** As written; absent means disallowed (only a singleton transition may allow it). */
  readonly termination?: string;
}

function literal(expr: AstNode | undefined): number | string | undefined {
  if (!expr) return undefined;
  if (expr.kind === "int") return Number(expr.data);
  if (expr.kind === "identifier") return String(expr.data);
  return undefined;
}

/** Covenant declarations of a source, from the silverc AST. */
export function silverCovenantDeclarations(ast: AstNode): SilverCovenantDeclaration[] {
  const out: SilverCovenantDeclaration[] = [];
  for (const fn of (ast.functions ?? []) as AstNode[]) {
    for (const attr of (fn.attributes ?? []) as AstNode[]) {
      const pathParts = (attr.path ?? []) as string[];
      if (pathParts[0] !== "covenant" || ["allow", "delegate"].includes(pathParts[1] ?? "")) continue;
      const args = Object.fromEntries(((attr.args ?? []) as AstNode[]).map((a) => [a.name, literal(a.expr)]));
      const form = pathParts.join(".");
      let from = args.from as number | string | undefined;
      let to = args.to as number | string | undefined;
      if (form === "covenant.singleton") {
        from = 1;
        to = 1;
      }
      if (form === "covenant.fanout") from = 1;
      // A transition that returns one State and names no `to` has exactly one continuation: silverc 1.0.0 lowers it to
      // `require(auth_out_count == 1)` (upstream fixture lowers_auth_transition_two_field_state). Any other omission
      // stays unknown, and the declaration is left out (its entries are then refused).
      const returns = (fn.return_types ?? []) as AstNode[];
      const oneState = returns.length === 1 && returns[0]?.base === "State" && ((returns[0]?.array_dims ?? []) as unknown[]).length === 0;
      if (to === undefined && from !== undefined && oneState && String(args.mode ?? "transition") === "transition") to = 1;
      if (from === undefined || to === undefined) continue;
      out.push({
        policy: String(fn.name),
        form,
        binding: String(args.binding ?? (from === 1 ? "auth" : "cov")),
        from,
        to,
        mode: String(args.mode ?? ((fn.return_types ?? []).length > 0 ? "transition" : "verification")),
        ...(args.groups !== undefined ? { groups: String(args.groups) } : {}),
        ...(args.termination !== undefined ? { termination: String(args.termination) } : {})
      });
    }
  }
  return out;
}

/** The function a contract marks `#[covenant.delegate]` (the body its delegate entry runs), if any. */
export function silverCovenantDelegateFunction(ast: AstNode): string | undefined {
  for (const fn of (ast.functions ?? []) as AstNode[]) {
    if (((fn.attributes ?? []) as AstNode[]).some((a) => (a.path ?? [])[0] === "covenant" && (a.path ?? [])[1] === "delegate")) return String(fn.name);
  }
  return undefined;
}

/**
 * A declaration's bound (`from` / `to`) as a number: a literal, or the value of the constructor parameter it names
 * (`to = max_outs`). Undefined when it cannot be told.
 */
export function silverDeclarationBound(ast: AstNode, bound: number | string, constructorArgs: readonly SilArtifactValue[]): number | undefined {
  if (typeof bound === "number") return Number.isSafeInteger(bound) ? bound : undefined;
  const index = ((ast.params ?? []) as AstNode[]).findIndex((p) => p.name === bound);
  const v = index >= 0 ? constructorArgs[index] : undefined;
  if (v?.kind !== "int") return undefined;
  const n = BigInt(v.value);
  return n >= 0n && n <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(n) : undefined;
}

/** True for the declaration shape M8 supports: one input, one successor, auth binding, transition. */
export function isSingletonAuthTransition(d: SilverCovenantDeclaration): boolean {
  return d.binding === "auth" && d.from === 1 && d.to === 1 && d.mode === "transition";
}

/**
 * Checks, against the official AST, that each State field is initialized by
 * exactly the declared constructor parameter (a bare identifier of the same
 * type). Anything else would need the compiler's own evaluation.
 */
function verifyStateMapping(ast: AstNode, mapping: Readonly<Record<string, number>>): void {
  const params = (ast.params ?? []) as AstNode[];
  const fields = (ast.fields ?? []) as AstNode[];
  for (const [fieldName, index] of Object.entries(mapping)) {
    const field = fields.find((f) => f.name === fieldName);
    const param = params[index];
    if (!field || !param) {
      throw covenantError("SILVER_SUCCESSOR_NOT_IMPLEMENTED", `State field '${fieldName}' or constructor parameter #${index} not found in the source`);
    }
    const direct = field.expr?.kind === "identifier" && field.expr?.data === param.name;
    const sameType = JSON.stringify(field.type_ref) === JSON.stringify(param.type_ref);
    if (!direct || !sameType) {
      throw covenantError(
        "SILVER_SUCCESSOR_NOT_IMPLEMENTED",
        `State field '${fieldName}' is initialized by '${field.expr?.span ?? field.expr?.kind}', not directly by constructor parameter '${param.name}' of the same type; ` +
          "deriving its successor would require reproducing the compiler"
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Successor
// ---------------------------------------------------------------------------

export interface SilverSuccessorRequest {
  readonly source: string | Uint8Array;
  /** The constructor arguments the current (on-chain) state was compiled with. */
  readonly constructorArgs: readonly SilArtifactValue[];
  readonly contractName?: string | undefined;
  /**
   * For every `State` field, the index of the constructor parameter that
   * initializes it directly (`int value = init_value;` ⇒ `{ value: 0 }`).
   */
  readonly stateToConstructorArg: Readonly<Record<string, number>>;
  /** The successor state, one value per `State` field. */
  readonly nextState: Readonly<Record<string, SilArtifactValue>>;
  readonly home?: string | undefined;
}

export interface SilverSuccessor {
  readonly declarations: readonly SilverCovenantDeclaration[];
  readonly current: SilverCompileResult;
  readonly successor: SilverCompileResult;
  readonly successorConstructorArgs: readonly SilArtifactValue[];
  readonly stateSpan: { readonly offset: number; readonly currentLen: number; readonly successorLen: number };
}

/**
 * Compiles the current state and the successor state and checks the guard:
 * same template hash, same entries, same bytecode before and after the state
 * span, different state bytes.
 */
export async function compileSilverSuccessor(request: SilverSuccessorRequest): Promise<SilverSuccessor> {
  const current = await compileSilverScript({ source: request.source, constructorArgs: request.constructorArgs, home: request.home });
  const { name, contract } = getSilContract(current.artifact, request.contractName);

  const fields = contract.runtime_state.fields.map((f) => f.name);
  if (fields.length === 0) {
    throw covenantError("SILVER_COVENANT_NOT_STATEFUL", `contract '${name}' has no State fields`);
  }
  const mapping = request.stateToConstructorArg;
  const declared = Object.keys(mapping);
  const missing = fields.filter((f) => !(f in mapping));
  const unknown = declared.filter((f) => !fields.includes(f));
  if (missing.length || unknown.length) {
    throw covenantError(
      "SILVER_SUCCESSOR_NOT_IMPLEMENTED",
      `State fields [${fields.join(", ")}] need a declared constructor parameter each` +
        (missing.length ? `; undeclared: ${missing.join(", ")}` : "") +
        (unknown.length ? `; not State fields: ${unknown.join(", ")}` : "") +
        ". State derived by other means would require reproducing the compiler"
    );
  }
  const indices = declared.map((f) => mapping[f]!);
  if (new Set(indices).size !== indices.length || indices.some((i) => !Number.isInteger(i) || i < 0 || i >= request.constructorArgs.length)) {
    throw covenantError("SILVER_SUCCESSOR_NOT_IMPLEMENTED", "each State field must map to its own, existing constructor parameter");
  }
  const nextKeys = Object.keys(request.nextState);
  if (nextKeys.length !== fields.length || !fields.every((f) => f in request.nextState)) {
    throw covenantError("SILVER_SUCCESSOR_STATE_INVALID", `nextState must give exactly the State fields [${fields.join(", ")}]`);
  }
  const ast = await parseSilverSourceAst(request.source, request.home);
  verifyStateMapping(ast, mapping);

  const successorConstructorArgs = request.constructorArgs.map((arg, i) => {
    const field = declared.find((f) => mapping[f] === i);
    return field === undefined ? arg : request.nextState[field]!;
  });
  const successor = await compileSilverScript({ source: request.source, constructorArgs: successorConstructorArgs, home: request.home });
  const next = getSilContract(successor.artifact, name).contract;

  const a = Buffer.from(contract.compiled.bytecode);
  const b = Buffer.from(next.compiled.bytecode);
  const spanA = contract.compiled.state_span;
  const spanB = next.compiled.state_span;
  const sameTemplate = Buffer.from(contract.compiled.template_hash).equals(Buffer.from(next.compiled.template_hash));
  const samePrefix = spanA.offset === spanB.offset && a.subarray(0, spanA.offset).equals(b.subarray(0, spanB.offset));
  const sameSuffix = a.subarray(spanA.offset + spanA.len).equals(b.subarray(spanB.offset + spanB.len));
  const sameEntries = JSON.stringify(contract.entries) === JSON.stringify(next.entries) &&
    JSON.stringify(contract.cov_decl_to_abi ?? {}) === JSON.stringify(next.cov_decl_to_abi ?? {});
  const stateChanged = !a.subarray(spanA.offset, spanA.offset + spanA.len).equals(b.subarray(spanB.offset, spanB.offset + spanB.len));

  if (!sameTemplate || !samePrefix || !sameSuffix || !sameEntries) {
    throw covenantError(
      "SILVER_SUCCESSOR_TEMPLATE_CHANGED",
      `recompiling with the new state changed more than the state (template ${sameTemplate}, prefix ${samePrefix}, suffix ${sameSuffix}, entries ${sameEntries}); ` +
        "the declared State ↔ constructor mapping does not hold for this contract"
    );
  }
  if (!stateChanged) {
    throw covenantError("SILVER_SUCCESSOR_STATE_UNCHANGED", "the successor state compiles to the same state bytes as the current one");
  }

  return {
    declarations: silverCovenantDeclarations(ast),
    current,
    successor,
    successorConstructorArgs,
    stateSpan: { offset: spanA.offset, currentLen: spanA.len, successorLen: spanB.len }
  };
}
