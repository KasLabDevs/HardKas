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
  | "COV-BUDGET-001";

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
    | "COMPUTE_BUDGET";
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

    if (!hasAuthCheck) {
      const hasTimelockOrSecretGuard = reachable.some(
        (n) =>
          n.kind === "require" &&
          typeof n.data?.span === "string" &&
          (n.data.span.includes("this.age") || n.data.span.includes("tx.time") || n.data.span.includes("sha256") || n.data.span.includes("blake3"))
      );
      findings.push({
        ruleId: "COV-AUTH-001",
        title: "Entrypoint lacks explicit cryptographic authorization (checkSig / checkMultiSig)",
        category: "AUTHORIZATION",
        severity: hasTimelockOrSecretGuard ? "LOW" : "HIGH",
        confidence: hasTimelockOrSecretGuard ? "LOW" : "HIGH",
        contractName,
        functionName: fnName,
        ...(params.file ? { file: params.file } : {}),
        location: resolveAstSpanLocation(params.source, fn.name_span ?? fnSpan, fnSpan),
        description: `Function '${fnName}' can be invoked without verifying a Schnorr signature (checkSig/checkMultiSig) or input script/covenant witness.`,
        threatModel:
          "Any network participant observing the UTXO on the Kaspa DAG can construct a spending transaction calling this entrypoint unless intentional permissionless invariants restrict the transition.",
        reproductionCondition:
          "Build a spending transaction invoking this entrypoint from an arbitrary third-party account without holding the contract owner's private key.",
        mitigation:
          "Add a `sig` parameter and enforce `require(checkSig(s, authorized_pubkey));` (or document the entrypoint as intentionally permissionless).",
        limitations:
          "Permissionless covenants (e.g., public counters, hashlock puzzles, or matured timelocks) legitimately omit signature checks; review confidence level against contract intent."
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
