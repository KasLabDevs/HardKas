import {
  parseSilverSourceAst,
  type SilAbiArtifact
} from "./silverscript.js";

export type CovenantStaticRuleId =
  | "COV-AUTH-001"
  | "COV-VALUE-001"
  | "COV-STATE-001"
  | "COV-INDEX-001"
  | "COV-TERM-001"
  | "COV-BUDGET-001"
  | "COV-INPUT-001"
  | "COV-SIGOPS-001"
  | "COV-LOCKTIME-001";

/**
 * G2 · the mempool's standardness limit on the signature operations of ONE P2SH input (rusty-kaspa
 * mining/src/mempool/check_transaction_standard.rs, MAX_STANDARD_P2SH_SIG_OPS), counted statically over the whole redeem
 * script: every entry, every inlined helper call site, whatever entry the spend runs. Proven on a rusty-kaspad v2.1.0
 * simnet for v0 and v1 transactions (packages/testing/test/p2sh-sig-op-limit-g2.simnet.test.ts): 16 refused, 15 accepted.
 */
export const MAX_STANDARD_P2SH_SIG_OPS = 15;

export type CovenantStaticSeverity = "HIGH" | "MEDIUM" | "LOW" | "INFO";
export type CovenantStaticConfidence = "HIGH" | "MEDIUM" | "LOW";

export interface CovenantStaticLocation {
  readonly line: number;
  readonly column: number;
  readonly endLine: number;
  readonly endColumn: number;
  readonly snippet: string;
}

export interface CovenantStaticFinding {
  readonly ruleId: CovenantStaticRuleId;
  readonly title: string;
  readonly category:
    | "AUTHORIZATION"
    | "VALUE_PROTECTION"
    | "SUCCESSOR_STATE"
    | "UNSAFE_INDEXING"
    | "TERMINATION"
    | "COMPUTE_BUDGET"
    | "INPUT_COUNT"
    | "STANDARDNESS"
    | "TIME_LOCK";
  readonly severity: CovenantStaticSeverity;
  readonly confidence: CovenantStaticConfidence;
  readonly contractName: string;
  readonly functionName: string;
  readonly file?: string | undefined;
  readonly location: CovenantStaticLocation | "SOURCE_LOCATION_UNAVAILABLE";
  readonly description: string;
  readonly threatModel: string;
  readonly reproductionCondition: string;
  readonly mitigation: string;
  readonly limitations: string;
}

export interface CovenantStaticAnalysisReport {
  readonly schema: "hardkas.silver.staticAudit.v1";
  readonly contractName: string;
  readonly file?: string | undefined;
  readonly analyzedFunctions: readonly string[];
  readonly findings: readonly CovenantStaticFinding[];
  readonly summary: {
    readonly totalFindings: number;
    readonly high: number;
    readonly medium: number;
    readonly low: number;
    readonly info: number;
  };
  readonly disclaimer: string;
}

type AstNode = Record<string, any>;

/**
 * Resolves a `silverc --ast-only` span substring to 1-based line/column coordinates
 * within `source`, scoped to `scopeSpan` when provided. If the span cannot be
 * uniquely resolved, returns `"SOURCE_LOCATION_UNAVAILABLE"`.
 */
export function resolveAstSpanLocation(
  source: string,
  targetSpan: string | undefined,
  scopeSpan?: string | undefined
): CovenantStaticLocation | "SOURCE_LOCATION_UNAVAILABLE" {
  if (!targetSpan || typeof targetSpan !== "string" || targetSpan.trim() === "") {
    return "SOURCE_LOCATION_UNAVAILABLE";
  }

  let searchStart = 0;
  let searchEnd = source.length;
  if (scopeSpan && typeof scopeSpan === "string") {
    const scopeIdx = source.indexOf(scopeSpan);
    if (scopeIdx >= 0) {
      searchStart = scopeIdx;
      searchEnd = scopeIdx + scopeSpan.length;
    }
  }

  const slice = source.slice(searchStart, searchEnd);
  const firstRelIdx = slice.indexOf(targetSpan);
  if (firstRelIdx < 0) {
    return "SOURCE_LOCATION_UNAVAILABLE";
  }
  const secondRelIdx = slice.indexOf(targetSpan, firstRelIdx + 1);
  if (secondRelIdx >= 0 && scopeSpan && targetSpan !== scopeSpan) {
    // Ambiguous inside the same scope
    return "SOURCE_LOCATION_UNAVAILABLE";
  }

  const absStart = searchStart + firstRelIdx;
  const absEnd = absStart + targetSpan.length;

  const coordAt = (offset: number): { line: number; column: number } => {
    let line = 1;
    let lastNewline = -1;
    for (let i = 0; i < offset; i++) {
      if (source.charCodeAt(i) === 10) {
        line++;
        lastNewline = i;
      }
    }
    return { line, column: offset - lastNewline };
  };

  const start = coordAt(absStart);
  const end = coordAt(Math.max(absStart, absEnd - 1));
  return {
    line: start.line,
    column: start.column,
    endLine: end.line,
    endColumn: end.column,
    snippet: targetSpan.split(/\r?\n/)[0]!.trim()
  };
}

function* walkAstNodes(node: unknown): Generator<AstNode> {
  if (node === null || typeof node !== "object") return;
  if (Array.isArray(node)) {
    for (const item of node) yield* walkAstNodes(item);
    return;
  }
  const obj = node as AstNode;
  yield obj;
  for (const val of Object.values(obj)) {
    yield* walkAstNodes(val);
  }
}

function isCovenantFunction(fn: AstNode): boolean {
  const attrs = Array.isArray(fn.attributes) ? (fn.attributes as AstNode[]) : [];
  return attrs.some((attr) => {
    const p = Array.isArray(attr.path) ? attr.path : [];
    return p[0] === "covenant";
  });
}

function isPublicEntryOrCovenant(fn: AstNode): boolean {
  return Boolean(fn.entrypoint) || isCovenantFunction(fn);
}

function collectReachableBodyNodes(fn: AstNode, allFunctions: readonly AstNode[]): AstNode[] {
  const visited = new Set<string>([String(fn.name)]);
  const queue: AstNode[] = [fn];
  const nodes: AstNode[] = [];

  while (queue.length > 0) {
    const curr = queue.shift()!;
    for (const n of walkAstNodes(curr.body)) {
      nodes.push(n);
      if ((n.kind === "call" || n.kind === "function_call") && typeof n.data?.name === "string") {
        const calleeName = String(n.data.name);
        if (!visited.has(calleeName)) {
          const helper = allFunctions.find((f) => f.name === calleeName);
          if (helper) {
            visited.add(calleeName);
            queue.push(helper);
          }
        }
      }
    }
  }
  return nodes;
}

function extractCovenantAttrMap(fn: AstNode): Record<string, any> {
  const attrs = Array.isArray(fn.attributes) ? (fn.attributes as AstNode[]) : [];
  const covAttr = attrs.find((a) => Array.isArray(a.path) && a.path[0] === "covenant");
  if (!covAttr) return {};
  const map: Record<string, any> = {
    subpath: covAttr.path.slice(1).join(".")
  };
  for (const arg of (covAttr.args ?? []) as AstNode[]) {
    if (typeof arg.name === "string") {
      map[arg.name] = arg.expr?.data;
    }
  }
  return map;
}

function collectIdentifiers(node: unknown): Set<string> {
  const out = new Set<string>();
  for (const n of walkAstNodes(node)) {
    if (n.kind === "identifier" && typeof n.data === "string") {
      out.add(n.data);
    }
    if (n.kind === "field_access" && n.data?.source?.kind === "identifier" && typeof n.data.field === "string") {
      out.add(`${n.data.source.data}.${n.data.field}`);
      out.add(String(n.data.source.data));
    }
  }
  return out;
}

const callName = (n: AstNode): string | undefined =>
  (n.kind === "call" || n.kind === "function_call") && typeof n.data?.name === "string" ? String(n.data.name) : undefined;

const HASH_BUILTINS = new Set(["sha256", "blake2b", "blake3"]);
// silverc v1.0.0: checkSig → OpCheckSig, checkMsgSig → OpCheckSigFromStack (the post-Toccata P2SH scan counts both);
// checkDataSig / checkMultiSig are not silverc v1.0.0 builtins, counted in case a later compiler adds them
const SIG_BUILTINS = new Set(["checkSig", "checkMsgSig", "checkDataSig"]);
const MULTISIG_BUILTINS = new Set(["checkMultiSig"]);
const MAX_PUB_KEYS_PER_MULTISIG = 20;

/** The introspection fields a set of nodes reads (`tx_inputs_length`, `output_value`, `output_script_pub_key`, …). */
function introspectionKinds(nodes: readonly AstNode[]): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    if (n.kind === "introspection" && typeof n.data === "string") out.add(n.data);
    if (n.kind === "indexed_introspection" && typeof n.data?.kind === "string") out.add(String(n.data.kind));
  }
  return out;
}

/** `require(tx.inputs.length == 1)` (either side). */
function requiresSingleInput(nodes: readonly AstNode[]): boolean {
  const isLen = (e: AstNode | undefined) => e?.kind === "introspection" && e.data === "tx_inputs_length";
  const isOne = (e: AstNode | undefined) => e?.kind === "int" && e.data === 1;
  return nodes.some((n) => {
    if (n.kind !== "require") return false;
    const e = n.data?.expr as AstNode | undefined;
    if (e?.kind === "binary" && e.data?.op === "eq" && ((isLen(e.data.left) && isOne(e.data.right)) || (isOne(e.data.left) && isLen(e.data.right)))) return true;
    return /\btx\.inputs\.length\s*==\s*1\b/.test(String(n.data?.span ?? ""));
  });
}

/**
 * The signature operations a function's body adds to the redeem script, as silverc lays it out: each signature builtin
 * once per call site, a helper's own count at each of its call sites (silverc inlines helpers), a loop's body times its
 * bound (silverc unrolls loops). `exact` is false when a loop bound is not a literal (its body is then counted once).
 */
function countSourceSigOps(body: unknown, allFunctions: readonly AstNode[], stack: readonly string[]): { count: number; exact: boolean } {
  let count = 0;
  let exact = true;
  const visit = (node: unknown): void => {
    if (node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    const n = node as AstNode;
    if (n.kind === "for" && n.data) {
      const bound = n.data.max_iterations ?? n.data.bound;
      const times = bound?.kind === "int" && typeof bound.data === "number" ? bound.data : undefined;
      const inner = countSourceSigOps(n.data.body, allFunctions, stack);
      if (!inner.exact) exact = false;
      if (inner.count > 0 && times === undefined) exact = false;
      count += inner.count * (times ?? 1);
      return;
    }
    const name = callName(n);
    if (name !== undefined) {
      if (SIG_BUILTINS.has(name)) count += 1;
      else if (MULTISIG_BUILTINS.has(name)) {
        const keys = (n.data.args as AstNode[] | undefined)?.[1];
        const k = keys && callName(keys) === "pubkey[]" && Array.isArray(keys.data.args) ? keys.data.args.length : undefined;
        // a key count the source does not fix counts the maximum, as the node's scan does when it cannot read one
        count += k !== undefined && k >= 1 && k <= MAX_PUB_KEYS_PER_MULTISIG ? k : MAX_PUB_KEYS_PER_MULTISIG;
      } else if (!stack.includes(name)) {
        const helper = allFunctions.find((f) => f.name === name && !f.entrypoint && !isCovenantFunction(f));
        if (helper) {
          const inner = countSourceSigOps(helper.body, allFunctions, [...stack, name]);
          count += inner.count;
          if (!inner.exact) exact = false;
        }
      }
    }
    for (const value of Object.values(n)) visit(value);
  };
  visit(body);
  return { count, exact };
}

/**
 * Performs static security analysis over a SilverScript contract using the official
 * `silverc --ast-only` AST and optional compiled `SilAbiArtifact`.
 */
export async function analyzeSilverScriptSecurity(params: {
  readonly source: string;
  readonly file?: string | undefined;
  readonly ast?: Record<string, any> | undefined;
  readonly artifact?: SilAbiArtifact | undefined;
}): Promise<CovenantStaticAnalysisReport> {
  const ast = params.ast ?? (await parseSilverSourceAst(params.source));
  const contractName = String(ast.name ?? "UnknownContract");
  const allFunctions = Array.isArray(ast.functions) ? (ast.functions as AstNode[]) : [];
  const publicFunctions = allFunctions.filter(isPublicEntryOrCovenant);
  const findings: CovenantStaticFinding[] = [];

  for (const fn of publicFunctions) {
    const fnName = String(fn.name);
    const fnSpan = typeof fn.span === "string" ? fn.span : undefined;
    const reachable = collectReachableBodyNodes(fn, allFunctions);
    const covAttrs = extractCovenantAttrMap(fn);
    const isCov = isCovenantFunction(fn);
    const returnsState = Array.isArray(fn.return_types) && fn.return_types.some((rt: any) => rt?.base === "State");

    // -----------------------------------------------------------------------
    // Rule 1: COV-AUTH-001 — Missing Authorization Check
    // -----------------------------------------------------------------------
    const hasAuthCheck = reachable.some((n) => {
      if ((n.kind === "call" || n.kind === "function_call") && typeof n.data?.name === "string") {
        const name = n.data.name;
        if (name === "checkSig" || name === "checkMultiSig" || name === "checkDataSig" || name === "OpCovInputCount") {
          return true;
        }
      }
      if (n.kind === "field_access" && n.data?.field === "scriptPubKey") {
        return true;
      }
      return false;
    });

    // what the function reads of the transaction (G5): outputs pinned = an output's script AND its value are checked
    const readKinds = introspectionKinds(reachable);
    const readsOutputs = [...readKinds].some((k) => k.startsWith("output_") || k === "tx_outputs_length");
    const pinsOutputs = readKinds.has("output_script_pub_key") && readKinds.has("output_value");

    if (!hasAuthCheck) {
      // G5 (SEC-01): a hash preimage or a time lock is not an authorization. The secret travels in the spend that reveals
      // it, so anyone who sees that spend in the mempool can copy it into their own; a matured lock is open to everyone.
      // (Time locks are silverc's require_age_daa / require_tx_daa / require_tx_time statements, not `require` nodes.)
      const hashGuard = reachable.some((n) => n.kind === "require" && [...walkAstNodes(n.data?.expr)].some((x) => HASH_BUILTINS.has(callName(x) ?? "")));
      const timeGuard = reachable.some(
        (n) =>
          (typeof n.kind === "string" && /^require_(age|tx_)/.test(n.kind)) ||
          (n.kind === "require" && /this\.age|tx\.time|tx\.daa/.test(String(n.data?.span ?? "")))
      );
      const guards = [...(hashGuard ? ["a hash preimage"] : []), ...(timeGuard ? ["a time lock"] : [])];
      const guarded = guards.length > 0;
      findings.push({
        ruleId: "COV-AUTH-001",
        title: guarded
          ? `Entrypoint guarded only by ${guards.join(" and ")}: no signature binds the spend to its claimer`
          : "Entrypoint lacks explicit cryptographic authorization (checkSig / checkMultiSig)",
        category: "AUTHORIZATION",
        // G5: a guarded path without a signature was LOW / LOW; it is HIGH unless the outputs are pinned
        severity: guarded ? (pinsOutputs ? "MEDIUM" : "HIGH") : "HIGH",
        confidence: guarded ? "MEDIUM" : "HIGH",
        contractName,
        functionName: fnName,
        ...(params.file ? { file: params.file } : {}),
        location: resolveAstSpanLocation(params.source, fn.name_span ?? fnSpan, fnSpan),
        description: guarded
          ? `Function '${fnName}' is guarded only by ${guards.join(" and ")} and verifies no signature (checkSig/checkMultiSig) or input script/covenant witness${pinsOutputs ? "; its outputs are checked (script and value)" : "; nothing pins where its value goes"}.`
          : `Function '${fnName}' can be invoked without verifying a Schnorr signature (checkSig/checkMultiSig) or input script/covenant witness.`,
        threatModel: guarded
          ? "A hash guard is not an authorization: the spend that reveals the secret waits in the mempool, where anyone can copy the secret into a spend of their own, to their own outputs, and race it. A time lock, once matured, admits everyone. Without pinned outputs the first transaction mined takes the coin."
          : "Any network participant observing the UTXO on the Kaspa DAG can construct a spending transaction calling this entrypoint unless intentional permissionless invariants restrict the transition.",
        reproductionCondition: guarded
          ? "Watch the mempool for a spend of this entrypoint, copy its arguments (the revealed secret) into a transaction paying yourself, and broadcast it; for a time lock, spend it from any account after it matures."
          : "Build a spending transaction invoking this entrypoint from an arbitrary third-party account without holding the contract owner's private key.",
        mitigation: guarded
          ? "Require the claimer's signature as well (`require(checkSig(s, claimer));`), or pin every output (its script and value), the fee and `tx.inputs.length == 1`, so that a copied spend can only pay the same recipients."
          : "Add a `sig` parameter and enforce `require(checkSig(s, authorized_pubkey));` (or document the entrypoint as intentionally permissionless).",
        limitations: guarded
          ? pinsOutputs
            ? "The function checks an output's script and value: a copier can only send the same payment, so what is left is the race for the fee and the timing. The analyzer does not prove every output and the fee are pinned: review them."
            : "Raised even when the entry is meant to be open: a revealed secret and a matured lock are public, so whoever spends first decides the outputs."
          : "An entry meant to be callable by anyone (a public counter, a fully pinned payout) omits a signature on purpose; review it against the contract's intent, and check that every output and the fee are pinned."
      });
    }

    // -----------------------------------------------------------------------
    // Rule 7: COV-INPUT-001 — no single-input rule (IN-01)
    // -----------------------------------------------------------------------
    // A plain entry that pins its outputs but not the input count can be spent together with another coin at the same
    // address (same contract and arguments = same address) against ONE output set: the other coin's value is free to go
    // anywhere. Covenant functions declare their inputs (`from = …`) and are left out.
    if (!isCov && readsOutputs && !requiresSingleInput(reachable)) {
      findings.push({
        ruleId: "COV-INPUT-001",
        title: "Entrypoint constrains outputs but not the input count (no `require(tx.inputs.length == 1)`)",
        category: "INPUT_COUNT",
        severity: hasAuthCheck ? "LOW" : "MEDIUM",
        confidence: "MEDIUM",
        contractName,
        functionName: fnName,
        ...(params.file ? { file: params.file } : {}),
        location: resolveAstSpanLocation(params.source, fn.name_span ?? fnSpan, fnSpan),
        description: `Function '${fnName}' checks the transaction's outputs but never requires a single input. Two coins at this contract's address satisfy it together with the output set meant for one of them.`,
        threatModel: hasAuthCheck
          ? "The signers' own transaction can merge several coins of this address into one spend: the value above the pinned outputs becomes fee or goes where the signers choose (no third party can do it without their signature)."
          : "Anyone can merge another coin of this address into the spend: the pinned outputs are paid once, and the second coin's value goes to an output of their choosing.",
        reproductionCondition: "Fund this contract's address twice, then spend both coins in one transaction through this entry, with the outputs checked for one coin and a free output for the rest.",
        mitigation: "Add `require(tx.inputs.length == 1);` (or tie the output values to `tx.inputs[this.activeInputIndex].value`).",
        limitations: "Detects only a literal `tx.inputs.length == 1` requirement; a contract that ties every output value to the active input's value is not exposed in the same way."
      });
    }

    // -----------------------------------------------------------------------
    // Rule 8: COV-LOCKTIME-001 — the lock time read without CheckLockTimeVerify
    // -----------------------------------------------------------------------
    // `OpTxLockTime()` reads the transaction's lock time; only `require(tx.daa >= …)` / `require(tx.time >= …)` compile to
    // OpCheckLockTimeVerify (silverc v1.0.0), which refuses an input whose sequence is the maximum (a finalized input).
    const readsLockTime = reachable.some((n) => callName(n) === "OpTxLockTime" || (n.kind === "introspection" && n.data === "tx_lock_time"));
    const hasCltv = reachable.some((n) => n.kind === "require_tx_daa" || n.kind === "require_tx_time");
    if (readsLockTime && !hasCltv) {
      findings.push({
        ruleId: "COV-LOCKTIME-001",
        title: "Lock time read with OpTxLockTime() without a CheckLockTimeVerify guard (tx.daa / tx.time)",
        category: "TIME_LOCK",
        severity: "MEDIUM",
        confidence: "HIGH",
        contractName,
        functionName: fnName,
        ...(params.file ? { file: params.file } : {}),
        location: resolveAstSpanLocation(params.source, fn.name_span ?? fnSpan, fnSpan),
        description: `Function '${fnName}' compares the transaction's lock time (OpTxLockTime()) but never requires tx.daa or tx.time, the statements that compile to OpCheckLockTimeVerify.`,
        threatModel:
          "The spender chooses the lock time. With every input's sequence at the maximum the node does not enforce it, so a spend can state the lock time the script asks for and be mined at once: the time condition does not hold.",
        reproductionCondition: "Spend through this entry before the intended time, with the lock time set to the required value and every input's sequence at 0xffffffffffffffff.",
        mitigation: "Use `require(tx.daa >= x);` or `require(tx.time >= t);` for an absolute lock (CheckLockTimeVerify), `require(this.ageDaa >= n);` for a relative one (CheckSequenceVerify).",
        limitations: "Does not apply if the lock time is read for something other than a time condition. HardKAS builds a lock time only when the spend asks for one (`--lock-time-daa`, `--lock-time-ms`)."
      });
    }

    // -----------------------------------------------------------------------
    // Rule 2: COV-VALUE-001 — Unconstrained Successor Output Value (Value Drain)
    // -----------------------------------------------------------------------
    if (isCov && (covAttrs.mode === "transition" || returnsState || covAttrs.subpath === "singleton" || covAttrs.subpath === "fanout")) {
      const checksOutputValue = reachable.some((n) => {
        const spanStr = String(n.span ?? n.data?.span ?? "");
        if (/tx\.outputs\[[^\]]+\]\.value/.test(spanStr)) {
          return true;
        }
        if (n.kind === "field_access" && n.data?.field === "value") {
          return spanStr.includes("tx.outputs") || spanStr.includes("outputs");
        }
        return false;
      });

      if (!checksOutputValue) {
        findings.push({
          ruleId: "COV-VALUE-001",
          title: "Covenant state transition does not constrain successor UTXO sompi value",
          category: "VALUE_PROTECTION",
          severity: "MEDIUM",
          confidence: "HIGH",
          contractName,
          functionName: fnName,
          ...(params.file ? { file: params.file } : {}),
          location: resolveAstSpanLocation(params.source, fn.name_span ?? fnSpan, fnSpan),
          description: `Covenant transition '${fnName}' validates state progression but never inspects 'tx.outputs[i].value'. The generated covenant wrapper enforces the successor script and state_span, but not the sompi amount carried by the successor output.`,
          threatModel:
            "An authorized caller (or anyone in a permissionless covenant) can satisfy the state transition while reducing the successor output's KAS/sompi value to dust and routing the remaining balance to a change output.",
          reproductionCondition:
            "Construct a transition where the successor output has the valid next State P2SH script but `tx.outputs[0].value` is reduced below the input UTXO value minus expected fee.",
          mitigation:
            "Enforce value preservation in the covenant body, e.g., `require(tx.outputs[0].value >= tx.inputs[this.activeInputIndex].value - max_fee);`.",
          limitations:
            "If the UTXO holds only nominal dust for state tracking (and no custody value), sompi value preservation may not be security-critical."
        });
      }
    }

    // -----------------------------------------------------------------------
    // Rule 3: COV-STATE-001 — Unconstrained State Field in Successor Return
    // -----------------------------------------------------------------------
    if (returnsState) {
      const requireNodes = reachable.filter((n) => n.kind === "require");
      const constrainedIds = new Set<string>();
      for (const req of requireNodes) {
        for (const id of collectIdentifiers(req.data?.expr)) {
          constrainedIds.add(id);
        }
      }

      const fnParams = Array.isArray(fn.params) ? (fn.params as AstNode[]) : [];
      const userParamNames = new Set(
        fnParams
          .filter((p) => p.type_ref?.base !== "State" && p.type_ref?.base !== "sig")
          .map((p) => String(p.name))
      );

      for (const n of reachable) {
        if (n.kind === "return" && Array.isArray(n.data?.exprs)) {
          for (const retExpr of n.data.exprs as AstNode[]) {
            if (retExpr.kind === "struct_literal" && retExpr.data?.name === "State") {
              for (const field of (retExpr.data.fields ?? []) as AstNode[]) {
                const fieldName = String(field.name);
                const exprIds = collectIdentifiers(field.expr);
                const usesUnconstrainedParam = [...exprIds].filter(
                  (id) => userParamNames.has(id) && !constrainedIds.has(id)
                );
                if (usesUnconstrainedParam.length > 0) {
                  findings.push({
                    ruleId: "COV-STATE-001",
                    title: `Successor State field '${fieldName}' depends on unconstrained parameter (${usesUnconstrainedParam.join(", ")})`,
                    category: "SUCCESSOR_STATE",
                    severity: "HIGH",
                    confidence: "HIGH",
                    contractName,
                    functionName: fnName,
                    ...(params.file ? { file: params.file } : {}),
                    location: resolveAstSpanLocation(params.source, field.span ?? n.data?.span, fnSpan),
                    description: `State field '${fieldName}' in return(State { ... }) is computed from parameter(s) [${usesUnconstrainedParam.join(", ")}] which do not appear in any require(...) statement.`,
                    threatModel:
                      "The spender can pass arbitrary values (including negative, zero, or extreme values) for the unconstrained parameter to corrupt the successor covenant state.",
                    reproductionCondition:
                      `Call '${fnName}' passing an arbitrary or adversarial value for '${usesUnconstrainedParam[0]}' and observe that all require(...) statements still pass.`,
                    mitigation:
                      `Add explicit bounds and invariant checks in require(...) for '${usesUnconstrainedParam.join(", ")}' before returning the new State.`,
                    limitations:
                      "Only tracks identifiers appearing in `require(...)` within the function and its called helpers; if the parameter is intentionally free-form by design, mark as informational."
                  });
                }
              }
            }
          }
        }
      }
    }

    // -----------------------------------------------------------------------
    // Rule 4: COV-INDEX-001 — Rigid Hardcoded Transaction Input/Output Index
    // -----------------------------------------------------------------------
    const seenIndexSpans = new Set<string>();
    for (const n of reachable) {
      const rawSpan = String(n.span ?? n.data?.span ?? "").trim();
      if (!rawSpan) continue;
      const regex = /\btx\.(inputs|outputs)\[(\d+)\]/g;
      let match: RegExpExecArray | null;
      while ((match = regex.exec(rawSpan)) !== null) {
        const spanText = match[0]!;
        if (seenIndexSpans.has(spanText)) continue;
        seenIndexSpans.add(spanText);
        const collection = match[1]!;
        const idxLiteral = match[2]!;
        findings.push({
          ruleId: "COV-INDEX-001",
          title: `Hardcoded transaction index '${spanText}' assumes fixed position`,
          category: "UNSAFE_INDEXING",
          severity: "MEDIUM",
          confidence: "MEDIUM",
          contractName,
          functionName: fnName,
          ...(params.file ? { file: params.file } : {}),
          location: resolveAstSpanLocation(params.source, spanText, fnSpan),
          description: `Function '${fnName}' indexes '${spanText}' with a constant index (${idxLiteral}) instead of binding to 'this.activeInputIndex' or 'OpAuthOutputIdx'.`,
          threatModel:
            "In UTXO transactions with multiple inputs, fee-funding inputs, or batched covenant spends, hardcoded index 0 can inspect a different input/output than the one authorized by this covenant input.",
          reproductionCondition:
            `Construct a multi-input or multi-output transaction where this covenant input is placed at index 1 while a dummy UTXO/output sits at index ${idxLiteral}.`,
          mitigation:
            collection === "inputs"
              ? "Use `tx.inputs[this.activeInputIndex]` instead of `tx.inputs[0]`."
              : "Derive the output index from `this.activeInputIndex` or covenant authorization mapping (`OpAuthOutputIdx`).",
          limitations:
            "If the contract strictly enforces `tx.inputs.length == 1` or `from = 1, to = 1` at index 0, the risk is reduced to composability friction with external fee inputs."
        });
      }
    }

    // -----------------------------------------------------------------------
    // Rule 5: COV-TERM-001 — Unprotected Covenant Termination
    // -----------------------------------------------------------------------
    if (isCov && covAttrs.termination === "allowed") {
      const checksAuthOutputCount = reachable.some((n) => {
        const s = String(n.span ?? "");
        return s.includes("OpAuthOutputCount") || s.includes("OpCovOutputCount") || s.includes("tx.outputs.length");
      });
      if (!checksAuthOutputCount) {
        findings.push({
          ruleId: "COV-TERM-001",
          title: "Covenant allows termination without explicit output-count or terminal state guard",
          category: "TERMINATION",
          severity: "MEDIUM",
          confidence: "MEDIUM",
          contractName,
          functionName: fnName,
          ...(params.file ? { file: params.file } : {}),
          location: resolveAstSpanLocation(params.source, fn.name_span ?? fnSpan, fnSpan),
          description: `Covenant function '${fnName}' declares 'termination = allowed' without inspecting output counts or terminal conditions in its body.`,
          threatModel:
            "Whenever 'termination = allowed' is set on a covenant declaration, the generated wrapper permits 0 successor outputs whenever the entrypoint's require(...) conditions are met, permanently destroying the covenant lineage.",
          reproductionCondition:
            `Spend the covenant UTXO via '${fnName}' with zero covenant-bound outputs (sending all funds to a plain P2PK output).`,
          mitigation:
            "Ensure termination is Either restricted to a dedicated close/burn entrypoint or guarded by terminal state conditions (`require(prev_state.closed == true)`).",
          limitations:
            "If this entrypoint is specifically designed as a close/withdraw function that may terminate at any time by the owner, this behavior is expected."
        });
      }
    }

    // -----------------------------------------------------------------------
    // Rule 6: COV-BUDGET-001 — Loop / High Compute Complexity
    // -----------------------------------------------------------------------
    for (const n of reachable) {
      if (n.kind === "for" && n.data) {
        const maxIterNode = n.data.max_iterations ?? n.data.bound;
        const maxIterVal = typeof maxIterNode?.data === "number" ? maxIterNode.data : undefined;
        const bodyCalls = [...walkAstNodes(n.data.body)].filter(
          (bn) => (bn.kind === "call" || bn.kind === "function_call") &&
            ["blake3", "sha256", "blake2b", "checkSig", "checkMultiSig"].includes(String(bn.data?.name))
        );
        if ((maxIterVal !== undefined && maxIterVal > 16) || bodyCalls.length > 0) {
          findings.push({
            ruleId: "COV-BUDGET-001",
            title: "Bounded loop with high iteration bound or cryptographic builtins inside loop body",
            category: "COMPUTE_BUDGET",
            severity: bodyCalls.length > 0 ? "MEDIUM" : "LOW",
            confidence: "HIGH",
            contractName,
            functionName: fnName,
            ...(params.file ? { file: params.file } : {}),
            location: resolveAstSpanLocation(params.source, n.data.span ?? n.span, fnSpan),
            description: `Function '${fnName}' contains a 'for' loop${maxIterVal ? ` (max iterations: ${maxIterVal})` : ""}${bodyCalls.length > 0 ? ` invoking cryptographic operations (${bodyCalls.map((c) => c.data.name).join(", ")})` : ""}. SilverScript unrolls loops into Kaspa Script opcodes, increasing both script size (storage/compute mass) and required v1 computeBudget.`,
            threatModel:
              "Unrolled loops with cryptographic operations or large upper bounds can exceed the standard transaction mass limit (100,000) or fail at runtime if the caller's computeBudget is under-provisioned.",
            reproductionCondition:
              "Compile the contract with a high loop bound and measure `estimateV1ComputeBudget` and `measureV1Mass` on the resulting transaction.",
            mitigation:
              "Keep compile-time loop bounds small and use `estimateV1ComputeBudget` / `proposeComputeBudget` during preflight.",
            limitations:
              "Heuristic static warning; verify actual upper-bound script units with `estimateV1ComputeBudget`."
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Rule 9: COV-SIGOPS-001 — more than 15 signature operations in the redeem script (G2)
  // -------------------------------------------------------------------------
  // One redeem script holds every entry and covenant function, and the node counts its signature operations statically,
  // whatever entry a spend runs: above 15 no standard node relays any spend of it, so funds sent there stay locked.
  const perFunction = publicFunctions.map((fn) => ({ fn, ...countSourceSigOps(fn.body, allFunctions, [String(fn.name)]) }));
  const totalSigOps = perFunction.reduce((s, f) => s + f.count, 0);
  const sigOpsExact = perFunction.every((f) => f.exact);
  if (totalSigOps > MAX_STANDARD_P2SH_SIG_OPS) {
    const heaviest = perFunction.reduce((a, b) => (b.count > a.count ? b : a));
    const span = typeof heaviest.fn.span === "string" ? heaviest.fn.span : undefined;
    const atLeast = sigOpsExact ? "" : "at least ";
    findings.push({
      ruleId: "COV-SIGOPS-001",
      title: `Redeem script counts ${atLeast}${totalSigOps} signature operations: above the mempool's limit of ${MAX_STANDARD_P2SH_SIG_OPS} per P2SH input`,
      category: "STANDARDNESS",
      severity: "HIGH",
      confidence: sigOpsExact ? "HIGH" : "MEDIUM",
      contractName,
      functionName: String(heaviest.fn.name),
      ...(params.file ? { file: params.file } : {}),
      location: resolveAstSpanLocation(params.source, heaviest.fn.name_span ?? span, span),
      description:
        `The contract's signature checks, counted over every entry and covenant function (a helper at each call site, a loop by its bound): ` +
        `${perFunction.filter((f) => f.count > 0).map((f) => `${String(f.fn.name)} ${f.exact ? "" : "≥"}${f.count}`).join(", ")}; ${atLeast}${totalSigOps} in all. ` +
        `The node counts them over the whole redeem script, whatever entry a spend runs, and refuses any spend of an input above ${MAX_STANDARD_P2SH_SIG_OPS} ` +
        "(verified on rusty-kaspad 2.1.0 simnet for transaction v0 and v1).",
      threatModel:
        "Value sent to this contract's P2SH address cannot be spent through a standard node: every spend is refused as non-standard (\"… signature operations which is more than the allowed max amount of 15\"), through any entry.",
      reproductionCondition: "Fund the contract's address and spend it through any entry, even one that runs a single signature check: the node refuses the spend.",
      mitigation:
        `Keep the whole contract at ${MAX_STANDARD_P2SH_SIG_OPS} signature checks or fewer (split it into several contracts, or check fewer signatures per path). ` +
        "`hardkas silver deploy` counts the compiled redeem script and refuses above the limit before funding.",
      limitations:
        "Counted from the source (checkSig and checkMsgSig call sites, helpers inlined, loops unrolled), not from the compiled bytecode; a loop whose bound is not a literal counts once, so the total is then a lower bound."
    });
  }

  const summary = {
    totalFindings: findings.length,
    high: findings.filter((f) => f.severity === "HIGH").length,
    medium: findings.filter((f) => f.severity === "MEDIUM").length,
    low: findings.filter((f) => f.severity === "LOW").length,
    info: findings.filter((f) => f.severity === "INFO").length
  };

  return {
    schema: "hardkas.silver.staticAudit.v1",
    contractName,
    ...(params.file ? { file: params.file } : {}),
    analyzedFunctions: publicFunctions.map((f) => String(f.name)),
    findings,
    summary,
    disclaimer:
      "Static AST analysis identifies structural and semantic risk patterns in SilverScript contracts; it is not a formal verification proof and does not replace SCRIPT_VM and CONSENSUS_SIMNET testing."
  };
}
