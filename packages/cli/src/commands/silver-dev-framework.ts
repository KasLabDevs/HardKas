import type { Command } from "commander";
import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { getOutput } from "../output.js";
import { HardkasCliError, HardkasExitCode } from "../cli-errors.js";
import { stripBom } from "@hardkas/core";

const out = () => getOutput();
const fail = (code: string, message: string, exitCode = HardkasExitCode.RUNTIME_FAILURE): never => {
  throw new HardkasCliError(code, message, { exitCode });
};
const relativePath = (file: string) => path.relative(process.cwd(), path.resolve(file)).replace(/\\/g, "/");

function readFileOrFail(file: string, what: string): Buffer {
  try {
    return fs.readFileSync(path.resolve(file));
  } catch (e: any) {
    return fail("SILVER_FILE_NOT_FOUND", `${what} ${file}: ${e?.code ?? e?.message}`, HardkasExitCode.USAGE_ERROR);
  }
}

async function argsFromFile(file: string, option = "--constructor-args") {
  const { parseSilArtifactValuesJson, serializeSilArtifactValues } = await import("@hardkas/core");
  const text = readFileOrFail(file, "constructor-args file").toString("utf8");
  const values = parseSilArtifactValuesJson(exactValuesText(text, option));
  return { values, canonical: serializeSilArtifactValues(values) };
}

/**
 * N-1 · develop's {kind, value} parser reads an int exactly only when "kind":"int" comes right before "value"; in any other
 * key order it reads the double. So every number is judged by its literal first, with B-2's rule: a fraction or an
 * exponent is refused whatever the key order, and a larger plain integer goes on as its exact digits (a string, which that
 * parser reads exactly in any order). N-7: an int's string form must be decimal digits. Text that is not JSON goes on
 * unchanged, for that parser to report as before.
 */
export function exactValuesText(text: string, option: string): string {
  let parsed: unknown;
  try {
    parsed = parseJsonExact(text, "as-digits");
  } catch (e) {
    if (e instanceof HardkasCliError) throw e;
    return text;
  }
  rejectInexactJsonNumbers(parsed, option);
  rejectNonDecimalIntStrings(parsed, option);
  return JSON.stringify(parsed);
}

/** A JSON number whose literal is not a plain safe integer, kept with that literal until the walk below reports it. */
const INEXACT_NUMBER = Symbol("inexact JSON number");
const PLAIN_INTEGER = /^-?(?:0|[1-9][0-9]*)$/;

/**
 * H-B1 / B-2 · JSON numbers are doubles, so each one is judged by its own literal (JSON.parse's context.source, native since
 * Node.js 21), never by the double it became. Deliberate rule: a JSON number is accepted only as a plain integer literal
 * between -(2^53 - 1) and 2^53 - 1. A fraction or an exponent is refused even when its value is an integer (5.0, 1e3) or
 * rounds to one (1.0000000000000001), and so is a larger integer: write it as {"kind":"int","value":"<digits>"}.
 * `largeIntegers: "as-digits"` (constructor arguments, N-1) keeps a larger plain integer as its exact digits instead.
 */
function parseJsonExact(text: string, largeIntegers: "refuse" | "as-digits" = "refuse"): unknown {
  return JSON.parse(text, (_key: string, value: unknown, context?: { source?: string }) => {
    if (typeof value !== "number") return value;
    const source = context?.source;
    if (typeof source !== "string") {
      return fail(
        "SILVER_JSON_SOURCE_UNAVAILABLE",
        "this Node.js cannot read a JSON number's literal (JSON.parse source text access); use the supported Node.js 24.22.1",
        HardkasExitCode.RUNTIME_FAILURE
      );
    }
    if (!PLAIN_INTEGER.test(source)) return { [INEXACT_NUMBER]: source };
    if (Number.isSafeInteger(value)) return value;
    return largeIntegers === "as-digits" ? source : { [INEXACT_NUMBER]: source };
  });
}

/** Refuses the first number parseJsonExact kept aside, naming where it is and its literal. */
function rejectInexactJsonNumbers(v: unknown, where: string): void {
  if (v === null || typeof v !== "object") return;
  if (INEXACT_NUMBER in v) {
    fail(
      "SILVER_JSON_NUMBER_UNSAFE",
      `${where}: the JSON number ${(v as Record<symbol, string>)[INEXACT_NUMBER]} is not a plain integer between -(2^53 - 1) and 2^53 - 1 (fractions and exponents are refused on purpose); write it as a plain integer, or a larger one as {"kind":"int","value":"<digits>"}`,
      HardkasExitCode.USAGE_ERROR
    );
  }
  if (Array.isArray(v)) v.forEach((x, i) => rejectInexactJsonNumbers(x, `${where}[${i}]`));
  else for (const [k, x] of Object.entries(v)) rejectInexactJsonNumbers(x, `${where}.${k}`);
}

/**
 * N-7 · the exact form of an int, {"kind":"int","value":"<digits>"}, is decimal digits: BigInt() would otherwise read "" as
 * 0, "0x10" as 16 and " 10 " as 10 without a word. Anything else is refused, with its path and literal, at any depth.
 */
function rejectNonDecimalIntStrings(v: unknown, where: string): void {
  if (v === null || typeof v !== "object") return;
  if (Array.isArray(v)) {
    v.forEach((x, i) => rejectNonDecimalIntStrings(x, `${where}[${i}]`));
    return;
  }
  const o = v as Record<string, unknown>;
  if (o.kind === "int" && typeof o.value === "string" && !PLAIN_INTEGER.test(o.value)) {
    fail(
      "SILVER_JSON_INT_INVALID",
      `${where}.value: ${JSON.stringify(o.value)} is not an int's exact form: write its decimal digits, an optional '-' and no '+', spaces, fraction, exponent or 0x`,
      HardkasExitCode.USAGE_ERROR
    );
  }
  for (const [k, x] of Object.entries(o)) rejectNonDecimalIntStrings(x, `${where}.${k}`);
}

/** JSON read by B-2's rule, for other commands: every number judged by its own literal, a larger integer refused. */
export function readExactJson(text: string, where: string): unknown {
  const parsed = parseJsonExact(stripBom(text));
  rejectInexactJsonNumbers(parsed, where);
  return parsed;
}

/**
 * ISSUE-ONCHAIN-JSON-PRECISION-1 · JSON holding {kind, value} values (entry arguments, a next state, an engine spec) read
 * by the --constructor-args rule, as a value: every number judged by its own literal (a fraction or an exponent refused, a
 * larger plain integer kept as its exact digits) and an int's string form decimal digits only. develop's on-chain commands
 * read these files with JSON.parse, so 9007199254740993 reached the transaction as …992 without a word. Text that is not
 * JSON is SILVER_ARGS_INVALID.
 */
export function readExactValuesJson(text: string, where: string): unknown {
  let parsed: unknown;
  try {
    parsed = parseJsonExact(stripBom(text), "as-digits");
  } catch (e) {
    if (e instanceof HardkasCliError) throw e;
    return fail("SILVER_ARGS_INVALID", `${where} is not JSON`, HardkasExitCode.USAGE_ERROR);
  }
  rejectInexactJsonNumbers(parsed, where);
  rejectNonDecimalIntStrings(parsed, where);
  return parsed;
}

function parseJsonOrFile(rawOrPath: string | undefined, what: string): any {
  if (!rawOrPath) return undefined;
  const trimmed = rawOrPath.trim();
  const parsed = parseJsonExact(
    trimmed.startsWith("{") || trimmed.startsWith("[") ? trimmed : stripBom(readFileOrFail(rawOrPath, what).toString("utf8"))
  );
  rejectInexactJsonNumbers(parsed, `--${what}`);
  rejectNonDecimalIntStrings(parsed, `--${what}`);
  return parsed;
}

function budgetOption(value: string | undefined, estimate: boolean): number | "estimate" | undefined {
  if (value === undefined) return undefined;
  if (estimate && value === "estimate") return "estimate";
  if (!/^\d{1,5}$/.test(value)) {
    fail(
      "SILVER_COMPUTE_BUDGET_INVALID",
      `--compute-budget '${value}' is not ${estimate ? "a budget (0-65535) or 'estimate'" : "a budget (0-65535)"}`,
      HardkasExitCode.USAGE_ERROR
    );
  }
  return Number(value);
}

function integerOption(value: string | undefined, name: string): bigint | undefined {
  if (value === undefined) return undefined;
  if (!/^\d{1,20}$/.test(value)) {
    fail("SILVER_OPTION_INVALID", `${name} '${value}' is not a non-negative integer`, HardkasExitCode.USAGE_ERROR);
  }
  return BigInt(value);
}

function countOption(value: string | undefined, name: string, max: number): number {
  const n = value !== undefined && /^\d{1,9}$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > max) {
    fail("SILVER_OPTION_INVALID", `${name} '${value}' is not an integer from 1 to ${max}`, HardkasExitCode.USAGE_ERROR);
  }
  return n;
}

function seedOption(value: string | undefined): number {
  const n = value !== undefined && /^-?\d{1,10}$/.test(value) ? Number(value) : NaN;
  if (!Number.isInteger(n) || n < -0x80000000 || n > 0x7fffffff) {
    fail("SILVER_OPTION_INVALID", `--seed '${value}' is not a 32-bit integer`, HardkasExitCode.USAGE_ERROR);
  }
  return n;
}

/**
 * `silver fuzz` judges counter covenants (OwnedCounter, GuardedVaultCounter, …): the entry takes (State, int delta, sig)
 * and the state is one int field. Anything else is refused before a sample runs: its oracle would not apply.
 */
function counterShapeOf(contract: any, entryName: string): { stateField: string } {
  const fns: any[] = Array.isArray(contract?.ast?.functions) ? contract.ast.functions : [];
  const fn = fns.find((f) => f?.name === entryName);
  const typeOf = (node: any) =>
    `${String(node?.type_ref?.base ?? "?")}${Array.isArray(node?.type_ref?.array_dims) && node.type_ref.array_dims.length > 0 ? "[]" : ""}`;
  const params = (Array.isArray(fn?.params) ? fn.params : []).filter((p: any) => p?.type_ref?.base !== "State").map(typeOf);
  const fields: any[] = Array.isArray(contract?.ast?.fields) ? contract.ast.fields : [];
  if (!fn || params.join(",") !== "int,sig" || fields.length !== 1 || typeOf(fields[0]) !== "int") {
    fail(
      "SILVER_FUZZ_SHAPE_UNSUPPORTED",
      `silver fuzz judges counter covenants: '${entryName}' must take (State, int delta, sig) and the state must be one int field; ` +
        `${contract?.contractName ?? "the contract"} has ${fn ? `${entryName}(${params.join(", ")})` : `no function '${entryName}'`} and state {${fields.map((f) => `${typeOf(f)} ${f?.name}`).join(", ")}}`,
      HardkasExitCode.USAGE_ERROR
    );
  }
  return { stateField: String(fields[0].name) };
}

/** The exit-1 codes of a runner that gave no verdict (R-05), as the command descriptions list them. */
const RUNNER_FAILURE_CODES = "SILVER_RUNNER_NOT_FOUND, _START_FAILED, _TIMEOUT, _PROTOCOL_ERROR or _INTERNAL_ERROR";

export const ALLOW_UNVERIFIED_RUNNER_HELP =
  "Run a SilverScript runner (cli-debugger) that is not verified against a trusted reference. Upstream publishes no runner binary, so today every runner is an UNVERIFIED local build: without this flag none is executed. Its verdicts are labelled UNVERIFIED, never official";

/** R-04: the testbed options a command's --allow-unverified-runner selects (otherwise HARDKAS_SILVER_RUNNER_TRUST decides). */
const runnerTrustOptions = (opts: any) => (opts.allowUnverifiedRunner ? { runnerTrust: "allow-unverified" as const } : {});

/** R-04: what a report says about the runner that produced (or was refused) a SCRIPT_VM verdict. */
function runnerWarningOf(identity: any): string | null {
  if (!identity) return null;
  return identity.trust === "VERIFIED"
    ? null
    : "UNVERIFIED local SilverScript runner: upstream publishes no cli-debugger binary, so this SCRIPT_VM verdict is not an official verification.";
}

/**
 * A SCRIPT_VM step the toolchain could not complete is never a contract verdict. The blocked reason starts with its
 * class: RUNNER_UNVERIFIED is the trust policy's refusal (exit 3); any other class is a runtime failure (exit 1).
 */
function failRunnerBlocked(blockedReason: string | undefined): never {
  const reason = blockedReason ?? "RUNNER_NOT_FOUND: SilverScript runner (cli-debugger) unavailable";
  const cls = /^([A-Z_]+):/.exec(reason)?.[1] ?? "RUNNER_NOT_FOUND";
  if (cls === "RUNNER_UNVERIFIED") return fail("SILVER_RUNNER_UNVERIFIED", reason, HardkasExitCode.POLICY_DENIED);
  return fail(`SILVER_${cls}`, reason);
}

async function loadContractForDevCommand(
  sourceOrRecord: string,
  ctorArgsFile?: string,
  ctorOption = "--constructor-args"
): Promise<{ source: string; sourceFile: string; ctorValues: any[] }> {
  const rawText = stripBom(readFileOrFail(sourceOrRecord, "source or compile record").toString("utf8"));
  let parsedJson: any;
  try {
    parsedJson = JSON.parse(rawText);
  } catch {
    parsedJson = undefined;
  }
  if (parsedJson && typeof parsedJson === "object" && parsedJson.source?.text) {
    const { HardkasSchemas } = await import("@hardkas/core");
    const { checkArtifactIdentity } = await import("@hardkas/artifacts");
    if (parsedJson.schema !== HardkasSchemas.SilverCompileV1) {
      fail("SILVER_RECORD_INVALID", `${sourceOrRecord} is not a ${HardkasSchemas.SilverCompileV1} record`, HardkasExitCode.USAGE_ERROR);
    }
    const identity = checkArtifactIdentity(parsedJson);
    if (!identity.ok) {
      fail(
        "SILVER_RECORD_TAMPERED",
        `${sourceOrRecord}: ${identity.issues.map((i) => `${i.code}: ${i.message}`).join("; ")}`,
        HardkasExitCode.CORRUPTION_DETECTED
      );
    }
    const ctor = ctorArgsFile ? await argsFromFile(ctorArgsFile, ctorOption) : { values: [], canonical: "[]" };
    return {
      source: String(parsedJson.source.text),
      sourceFile: String(parsedJson.source.path ?? sourceOrRecord),
      ctorValues: ctor.values
    };
  }
  const ctor = ctorArgsFile ? await argsFromFile(ctorArgsFile, ctorOption) : { values: [], canonical: "[]" };
  return {
    source: rawText,
    sourceFile: relativePath(sourceOrRecord),
    ctorValues: ctor.values
  };
}

function assertEntryExists(contract: any, entryName: string): void {
  const abi: Array<{ name: string }> = Array.isArray(contract?.artifact?.abi) ? contract.artifact.abi : [];
  const astFns: Array<{ name: string }> = Array.isArray(contract?.ast?.functions) ? contract.ast.functions : [];
  const matchesAbi = abi.some((fn) => fn.name === entryName || fn.name === `__covenant_${entryName}`);
  const matchesAst = astFns.some((fn) => fn.name === entryName);
  if (!matchesAbi && !matchesAst) {
    const available =
      astFns.map((fn) => fn.name).join(", ") ||
      abi.map((fn) => fn.name.replace(/^__covenant_/, "")).join(", ") ||
      "none";
    fail(
      "SILVER_ENTRY_NOT_FOUND",
      `Entrypoint '${entryName}' not found on contract '${contract?.contractName ?? "unknown"}' (available: ${available})`,
      HardkasExitCode.USAGE_ERROR
    );
  }
}

async function resolveDefaultCtorArgs(
  source: string,
  explicitValues: any[],
  ownerXOnlyHex: string
): Promise<{ values: any[]; synthesized: boolean; astParamCount: number }> {
  let astParamCount = 2;
  try {
    const { parseSilverSourceAst } = await import("@hardkas/core");
    const ast: any = await parseSilverSourceAst(source);
    const params: Array<{ name?: string; type_ref?: { base?: string; array_dims?: any[] } }> = Array.isArray(ast?.params)
      ? ast.params
      : [];
    astParamCount = params.length;
    if (explicitValues.length > 0) {
      return { values: explicitValues, synthesized: false, astParamCount };
    }
    if (params.length === 0) {
      return { values: [], synthesized: false, astParamCount: 0 };
    }
    return {
      values: params.map((p) => {
        const base = String(p?.type_ref?.base ?? "").toLowerCase();
        const name = String(p?.name ?? "").toLowerCase();
        if (base === "pubkey" || base === "bytes32" || (base === "byte" && Array.isArray(p?.type_ref?.array_dims))) {
          return `0x${ownerXOnlyHex}`;
        }
        if (base === "bool") return true;
        if (name.includes("fee")) return 500_000n;
        return 10n;
      }),
      synthesized: true,
      astParamCount
    };
  } catch {
    if (explicitValues.length > 0) {
      return { values: explicitValues, synthesized: false, astParamCount };
    }
    return { values: [`0x${ownerXOnlyHex}`, 10n], synthesized: true, astParamCount };
  }
}

export function registerSilverDevFrameworkCommands(silver: Command) {
  // ---------------------------------------------------------------- audit (Fase 4 / Fase 6)
  silver
    .command("audit <source-or-record>")
    .description(
      "Run static security analysis over a SilverScript (.sil) contract or compile record (heuristic AST and source-text rules COV-AUTH-001..COV-BUDGET-001: findings to review, not a proof of security). " +
        "Exit codes: 0 report written; 1 HIGH findings with --fail-on-high (SILVER_AUDIT_HIGH_FINDINGS); 2 usage (file not found, not a compile record); 4 tampered compile record"
    )
    .option("--args <file>", "Optional constructor arguments JSON file")
    .option("--fail-on-high", "Exit with non-zero code if any HIGH severity finding is detected", false)
    .option("--json", "Output as JSON", false)
    .action(async (target: string, opts: any) => {
      const core = await import("@hardkas/core");
      const loaded = await loadContractForDevCommand(target, opts.args, "--args");
      const ast = await core.parseSilverSourceAst(loaded.source);
      let artifact: any;
      if (loaded.ctorValues.length > 0) {
        try {
          const compiled = await core.compileSilverScript({
            source: loaded.source,
            constructorArgs: loaded.ctorValues
          });
          artifact = compiled.artifact;
        } catch {
          artifact = undefined;
        }
      }
      const report = await core.analyzeSilverScriptSecurity({
        source: loaded.source,
        file: loaded.sourceFile,
        ast,
        ...(artifact ? { artifact } : {})
      });
      if (opts.json) {
        out().writeJson(report);
      } else {
        out().writeLine(
          `${pc.bold("SilverScript Static Security Audit")} · ${pc.cyan(report.contractName)} (${loaded.sourceFile})`
        );
        out().writeLine(
          `  functions analyzed: ${report.analyzedFunctions.join(", ") || "none"} · findings: ${report.summary.totalFindings} (HIGH: ${report.summary.high}, MEDIUM: ${report.summary.medium}, LOW: ${report.summary.low})`
        );
        for (const f of report.findings) {
          const sevColor =
            f.severity === "HIGH" ? pc.red : f.severity === "MEDIUM" ? pc.yellow : pc.blue;
          const locStr =
            f.location === "SOURCE_LOCATION_UNAVAILABLE"
              ? "SOURCE_LOCATION_UNAVAILABLE"
              : `${loaded.sourceFile}:${f.location.line}:${f.location.column}`;
          out().writeLine(
            `  ${sevColor(`[${f.severity}/${f.confidence}]`)} ${pc.bold(f.ruleId)} (${f.functionName} @ ${locStr}): ${f.title}`
          );
          out().writeLine(pc.dim(`    mitigation: ${f.mitigation}`));
        }
        out().writeLine(pc.dim(`  ${report.disclaimer}`));
      }
      if (opts.failOnHigh && report.summary.high > 0) {
        fail("SILVER_AUDIT_HIGH_FINDINGS", `${report.summary.high} HIGH severity static finding(s) detected`);
      }
    });

  // ---------------------------------------------------------------- preflight (Fase 2 / Fase 6)
  silver
    .command("preflight <source-or-record>")
    .description(
      "Run v1 covenant transition preflight on a generated local testbed UTXO (STRUCTURAL_PREFLIGHT, plus SCRIPT_VM_PREFLIGHT on the SilverScript runner) reporting mass, compute budget and both verdicts; never a node's acceptance. " +
        `Exit codes: 0 PREFLIGHT PASS; 1 PREFLIGHT FAIL (structural or SCRIPT_VM rejection: SILVER_PREFLIGHT_FAILED) or a runner that gave no verdict (${RUNNER_FAILURE_CODES}); 2 usage; 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED); 4 tampered compile record`
    )
    .requiredOption("--entry <name>", "Covenant policy or entrypoint name (e.g. bump)")
    .option("--constructor-args <file>", "Constructor arguments JSON file")
    .option("--args <json-or-file>", "Entry arguments JSON array or file path")
    .option("--state <json-or-file>", "Current covenant state JSON object or file path")
    .option("--next-state <json-or-file>", "Successor covenant state JSON object or file path")
    .option(
      "--demo-fixture",
      "Allow generated laboratory fixture parameters and synthetic UTXO when explicit transaction arguments are omitted",
      false
    )
    .option("--fee <sompi>", "Fee in sompi (default: 300000)")
    .option("--compute-budget <n>", "Compute budget or 'estimate' (default: estimate)")
    .option("--level <level>", "Preflight level: STRUCTURAL_PREFLIGHT or SCRIPT_VM_PREFLIGHT", "SCRIPT_VM_PREFLIGHT")
    .option("--allow-unverified-runner", ALLOW_UNVERIFIED_RUNNER_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (target: string, opts: any) => {
      // R-14: --level is one of the two preflight levels, never an unchecked string
      if (opts.level !== "STRUCTURAL_PREFLIGHT" && opts.level !== "SCRIPT_VM_PREFLIGHT") {
        fail("SILVER_OPTION_INVALID", `--level '${opts.level}' is not STRUCTURAL_PREFLIGHT or SCRIPT_VM_PREFLIGHT`, HardkasExitCode.USAGE_ERROR);
      }
      // H-B1: the JSON options are read and checked before anything compiles or runs
      const stateJson = parseJsonOrFile(opts.state, "state");
      const nextStateJson = parseJsonOrFile(opts.nextState, "next-state");
      const argsJson = parseJsonOrFile(opts.args, "args");
      const { createCovenantTestbed } = await import("@hardkas/testing");
      const testbed = createCovenantTestbed(runnerTrustOptions(opts));
      const ownerAcct = testbed.getAccount("owner");
      const loaded = await loadContractForDevCommand(target, opts.constructorArgs);
      const ctorResolution = await resolveDefaultCtorArgs(
        loaded.source,
        loaded.ctorValues,
        ownerAcct.xOnlyPublicKey
      );
      const missingExplicitFlags: string[] = [];
      if (ctorResolution.synthesized) missingExplicitFlags.push("--constructor-args");
      if (opts.args === undefined) missingExplicitFlags.push("--args");
      if (opts.state === undefined) missingExplicitFlags.push("--state");
      if (opts.nextState === undefined) missingExplicitFlags.push("--next-state");

      if (missingExplicitFlags.length > 0 && !opts.demoFixture) {
        fail(
          "SILVER_PREFLIGHT_SYNTHETIC_INPUTS_FORBIDDEN",
          `Refusing to run preflight with synthesized parameters (missing: ${missingExplicitFlags.join(", ")}). Provide explicit transaction parameters or pass --demo-fixture to evaluate a generated laboratory demonstration.`,
          HardkasExitCode.USAGE_ERROR
        );
      }

      const contract = await testbed.compileContract({
        source: loaded.source,
        sourceFile: loaded.sourceFile,
        constructorArgs: ctorResolution.values
      });
      assertEntryExists(contract, opts.entry);
      const initialState = stateJson ?? { value: 10n };
      const nextState = nextStateJson ?? { value: 15n };
      const rawArgs = argsJson ?? [
        { kind: "int", value: 5 },
        { kind: "signer", signer: "owner" }
      ];
      const normArgs = (Array.isArray(rawArgs) ? rawArgs : []).map((a: any) => {
        if (a?.kind === "int") return { kind: "int" as const, value: BigInt(a.value) };
        if (a?.kind === "signature") return { kind: "signer" as const, signer: String(a.account ?? "owner") };
        return a;
      });
      const genesis = await testbed.deployGenesis({
        contract,
        initialState
      });
      const backends =
        opts.level === "STRUCTURAL_PREFLIGHT"
          ? (["SYNTHETIC"] as const)
          : (["SYNTHETIC", "SCRIPT_VM"] as const);
      const computeBudget = budgetOption(opts.computeBudget, true);
      const feeSompi = integerOption(opts.fee, "--fee");
      const res = await testbed.executeTransition({
        contract,
        utxo: genesis.utxo,
        entrypoint: opts.entry,
        args: normArgs,
        nextStates: [{ state: nextState }],
        ...(computeBudget !== undefined ? { computeBudget } : {}),
        ...(feeSompi !== undefined ? { feeSompi } : {}),
        backends
      });
      const isFullyExplicit = missingExplicitFlags.length === 0;
      const contextOrigin = {
        mode: isFullyExplicit ? "EXPLICIT_CONTRACT_PARAMETERS" : "GENERATED_DEMO_FIXTURE",
        isRealDeploymentValidation: false,
        utxoOrigin: "GENERATED_LAB_FIXTURE_UTXO",
        constructorArgsOrigin: ctorResolution.synthesized ? "SYNTHESIZED_FROM_AST" : "EXPLICIT_USER_INPUT",
        entryArgsOrigin: opts.args !== undefined ? "EXPLICIT_USER_INPUT" : "SYNTHESIZED_DEMO_DEFAULTS",
        stateOrigin:
          opts.state !== undefined && opts.nextState !== undefined
            ? "EXPLICIT_USER_INPUT"
            : "SYNTHESIZED_DEMO_DEFAULTS",
        warning: isFullyExplicit
          ? "Evaluated explicit contract parameters against a generated local testbed UTXO (not an on-chain live UTXO)."
          : "WARNING: Evaluated using synthesized laboratory fixture parameters and a generated UTXO (--demo-fixture). Does NOT validate a real deployment or live UTXO spend."
      };
      const summary = {
        schema: "hardkas.silver.preflight.v1",
        contractName: contract.contractName,
        entrypoint: opts.entry,
        passed: res.passed,
        status: res.status,
        preflightLevel: res.preflightLevel,
        evidenceLevel: res.evidenceLevel,
        contextOrigin,
        structuralPassed: res.structuralPassed,
        ...(res.structuralErrorCode ? { structuralErrorCode: res.structuralErrorCode } : {}),
        ...(res.structuralErrorMessage ? { structuralErrorMessage: res.structuralErrorMessage } : {}),
        computeBudgetUsed: res.computeBudgetUsed,
        computeBudgetEstimate: res.computeBudgetEstimate,
        massBreakdown: res.massBreakdown
          ? JSON.parse(
              JSON.stringify(res.massBreakdown, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
            )
          : null,
        vmOutcome: res.vmResult?.outcomeClass ?? null,
        runner: res.vmResult?.runnerIdentity ?? null,
        runnerWarning: runnerWarningOf(res.vmResult?.runnerIdentity),
        diagnostic: res.diagnostic ?? null
      };
      if (opts.json) {
        out().writeJson(summary);
      } else {
        out().writeLine(
          `${res.passed ? pc.green("PREFLIGHT PASS") : pc.red("PREFLIGHT FAIL")} · ${contract.contractName}.${opts.entry} [${res.preflightLevel} / ${res.evidenceLevel}]`
        );
        out().writeLine(
          `  context: ${isFullyExplicit ? pc.cyan("EXPLICIT_CONTRACT_PARAMETERS") : pc.yellow("GENERATED_DEMO_FIXTURE")} (utxo=${contextOrigin.utxoOrigin}, ctor=${contextOrigin.constructorArgsOrigin})`
        );
        if (!isFullyExplicit) {
          out().writeLine(pc.yellow(`  ${contextOrigin.warning}`));
        }
        out().writeLine(
          `  structural: ${res.structuralPassed ? pc.green("OK") : pc.red(res.structuralErrorCode ?? "FAIL")} · computeBudget: ${res.computeBudgetUsed} (estimated upper-bound: ${res.computeBudgetEstimate?.budget} budgets / ${res.computeBudgetEstimate?.units} units)`
        );
        if (res.massBreakdown) {
          out().writeLine(
            `  mass: ${res.massBreakdown.feeMass} g (compute=${res.massBreakdown.computeMass}, transient=${res.massBreakdown.transientMass}, storage=${res.massBreakdown.storageMass}) · minFee=${res.massBreakdown.minimumFeeSompi} sompi`
          );
        }
        if (summary.runner) {
          out().writeLine(pc.dim(`  runner: ${summary.runner.path} (sha256 ${summary.runner.sha256}, ${summary.runner.trust})`));
        }
        if (summary.runnerWarning) {
          out().writeLine(pc.yellow(`  ${summary.runnerWarning}`));
        }
        if (res.diagnostic) {
          const loc = res.diagnostic.location
            ? `${loaded.sourceFile}:${res.diagnostic.location.line}:${res.diagnostic.location.column}`
            : "SOURCE_LOCATION_UNAVAILABLE";
          out().writeLine(pc.red(`  VM failure at ${loc}: ${res.diagnostic.message}`));
        }
      }
      if (res.status === "BLOCKED") {
        failRunnerBlocked(res.vmResult?.blockedReason);
      }
      if (!res.passed) {
        fail("SILVER_PREFLIGHT_FAILED", res.diagnostic?.message ?? res.structuralErrorMessage ?? "Preflight failed");
      }
    });

  // ---------------------------------------------------------------- debug (Fase 2 / Fase 6)
  silver
    .command("debug <source-or-record>")
    .description(
      "Execute a covenant transition on the SilverScript runner (cli-debugger: a local build, no official binary exists) after the structural v1 validation, and emit source-mapped step traces, variable state and three verdicts (structural, SCRIPT_VM, global). " +
        `Exit codes: 0 APPROVED (or any rejection with --allow-failure); 1 rejected (SILVER_DEBUG_STRUCTURAL_REJECTED, SILVER_DEBUG_CONTRACT_REJECTED) or a runner that gave no verdict (${RUNNER_FAILURE_CODES}); 2 usage; 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED); 4 tampered compile record`
    )
    .requiredOption("--entry <name>", "Covenant policy or entrypoint name (e.g. bump)")
    .option("--constructor-args <file>", "Constructor arguments JSON file")
    .option("--args <json-or-file>", "Entry arguments JSON array or file path")
    .option("--state <json-or-file>", "Current covenant state JSON object or file path")
    .option("--next-state <json-or-file>", "Successor covenant state JSON object or file path")
    .option(
      "--demo-fixture",
      "Allow generated laboratory fixture parameters and synthetic UTXO when explicit transaction arguments are omitted",
      false
    )
    .option("--fee <sompi>", "Fee in sompi (default: 300000)")
    .option("--compute-budget <n>", "Compute budget or 'estimate' (default: estimate)")
    .option(
      "--allow-failure",
      "Return exit code 0 when the transition is rejected (structural validation or SCRIPT_VM), for interactive inspection; the verdicts are unchanged",
      false
    )
    .option("--allow-unverified-runner", ALLOW_UNVERIFIED_RUNNER_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (target: string, opts: any) => {
      // H-B1: the JSON options are read and checked before anything compiles or runs
      const stateJson = parseJsonOrFile(opts.state, "state");
      const nextStateJson = parseJsonOrFile(opts.nextState, "next-state");
      const argsJson = parseJsonOrFile(opts.args, "args");
      const { createCovenantTestbed } = await import("@hardkas/testing");
      const testbed = createCovenantTestbed(runnerTrustOptions(opts));
      const ownerAcct = testbed.getAccount("owner");
      const loaded = await loadContractForDevCommand(target, opts.constructorArgs);
      const ctorResolution = await resolveDefaultCtorArgs(
        loaded.source,
        loaded.ctorValues,
        ownerAcct.xOnlyPublicKey
      );
      // R-03: generated laboratory inputs are a demo, never a real transition: they need --demo-fixture, as in preflight
      const missingExplicitFlags: string[] = [];
      if (ctorResolution.synthesized) missingExplicitFlags.push("--constructor-args");
      if (opts.args === undefined) missingExplicitFlags.push("--args");
      if (opts.state === undefined) missingExplicitFlags.push("--state");
      if (opts.nextState === undefined) missingExplicitFlags.push("--next-state");
      if (missingExplicitFlags.length > 0 && !opts.demoFixture) {
        fail(
          "SILVER_DEBUG_SYNTHETIC_INPUTS_FORBIDDEN",
          `Refusing to debug with synthesized parameters (missing: ${missingExplicitFlags.join(", ")}). Provide explicit transaction parameters or pass --demo-fixture to debug a generated laboratory demonstration.`,
          HardkasExitCode.USAGE_ERROR
        );
      }
      const computeBudget = budgetOption(opts.computeBudget, true);
      const feeSompi = integerOption(opts.fee, "--fee");
      const contract = await testbed.compileContract({
        source: loaded.source,
        sourceFile: loaded.sourceFile,
        constructorArgs: ctorResolution.values
      });
      assertEntryExists(contract, opts.entry);
      const initialState = stateJson ?? { value: 10n };
      const nextState = nextStateJson ?? { value: 15n };
      const rawArgs = argsJson ?? [
        { kind: "int", value: 5 },
        { kind: "signer", signer: "owner" }
      ];
      const normArgs = (Array.isArray(rawArgs) ? rawArgs : []).map((a: any) => {
        if (a?.kind === "int") return { kind: "int" as const, value: BigInt(a.value) };
        if (a?.kind === "signature") return { kind: "signer" as const, signer: String(a.account ?? "owner") };
        return a;
      });
      const genesis = await testbed.deployGenesis({ contract, initialState });
      // SCRIPT_VM only: the VM still runs (and traces) when the structural validation refuses the transition; the
      // testbed reports that refusal as the transition's verdict and keeps the VM's apart (R-03)
      const res = await testbed.executeTransition({
        contract,
        utxo: genesis.utxo,
        entrypoint: opts.entry,
        args: normArgs,
        nextStates: [{ state: nextState }],
        ...(computeBudget !== undefined ? { computeBudget } : {}),
        ...(feeSompi !== undefined ? { feeSompi } : {}),
        backends: ["SCRIPT_VM"],
        captureTrace: true
      });
      const isFullyExplicit = missingExplicitFlags.length === 0;
      const contextOrigin = {
        mode: isFullyExplicit ? "EXPLICIT_CONTRACT_PARAMETERS" : "GENERATED_DEMO_FIXTURE",
        isRealDeploymentValidation: false,
        utxoOrigin: "GENERATED_LAB_FIXTURE_UTXO",
        constructorArgsOrigin: ctorResolution.synthesized ? "SYNTHESIZED_FROM_AST" : "EXPLICIT_USER_INPUT",
        entryArgsOrigin: opts.args !== undefined ? "EXPLICIT_USER_INPUT" : "SYNTHESIZED_DEMO_DEFAULTS",
        stateOrigin:
          opts.state !== undefined && opts.nextState !== undefined
            ? "EXPLICIT_USER_INPUT"
            : "SYNTHESIZED_DEMO_DEFAULTS",
        warning: isFullyExplicit
          ? "Debugged explicit contract parameters against a generated local testbed UTXO (not an on-chain live UTXO)."
          : "WARNING: Debugged synthesized laboratory fixture parameters and a generated UTXO (--demo-fixture). Does NOT validate a real deployment or live UTXO spend."
      };
      // R-03: three verdicts, kept apart. The structural validation is mandatory: its refusal decides the global verdict.
      const vm = res.vmResult;
      const structuralVerdict = res.structuralPassed ? "PASS" : "FAIL";
      const scriptVmVerdict = !vm ? "NOT_RUN" : vm.status === "BLOCKED" ? "BLOCKED" : vm.passed ? "PASS" : "REJECTED";
      const globalVerdict =
        structuralVerdict === "FAIL"
          ? "REJECTED"
          : scriptVmVerdict === "PASS" && res.passed
            ? "APPROVED"
            : scriptVmVerdict === "BLOCKED" || scriptVmVerdict === "NOT_RUN"
              ? "BLOCKED"
              : "REJECTED";
      const debuggerStatus = scriptVmVerdict === "BLOCKED" || scriptVmVerdict === "NOT_RUN" ? "BLOCKED" : "EXECUTED";
      const contractVerdict = globalVerdict === "BLOCKED" ? "BLOCKED_BY_TOOLCHAIN" : globalVerdict;
      const debugReport = {
        schema: "hardkas.silver.debugReport.v1",
        contractName: contract.contractName,
        entrypoint: opts.entry,
        debuggerStatus,
        contractVerdict,
        verdicts: {
          structural: {
            verdict: structuralVerdict,
            ...(res.structuralErrorCode ? { code: res.structuralErrorCode } : {}),
            ...(res.structuralErrorMessage ? { message: res.structuralErrorMessage } : {})
          },
          scriptVm: {
            verdict: scriptVmVerdict,
            status: vm?.status ?? null,
            class: vm?.outcomeClass ?? null,
            ...(vm?.blockedReason ? { reason: vm.blockedReason } : {})
          },
          global: globalVerdict
        },
        runner: vm?.runnerIdentity ?? null,
        runnerWarning: runnerWarningOf(vm?.runnerIdentity),
        passed: res.passed,
        status: res.status,
        evidenceLevel: res.evidenceLevel,
        contextOrigin,
        traceSteps: vm?.trace?.length ?? 0,
        trace: vm?.trace ?? [],
        stackAtHalt: vm?.stackAtHalt ?? [],
        variablesAtHalt: vm?.variablesAtHalt ?? {},
        diagnostic: res.diagnostic ?? null
      };
      if (opts.json) {
        out().writeJson(debugReport);
      } else {
        const verdictColor = globalVerdict === "APPROVED" ? pc.green : pc.red;
        out().writeLine(
          `${pc.bold("SilverScript VM Debugger")} · ${contract.contractName}.${opts.entry} -> ${verdictColor(globalVerdict)}`
        );
        out().writeLine(
          `  structural: ${structuralVerdict === "PASS" ? pc.green("PASS") : pc.red(`FAIL ${res.structuralErrorCode ?? ""}`.trim())}${res.structuralErrorMessage ? pc.dim(` (${res.structuralErrorMessage})`) : ""}`
        );
        out().writeLine(
          `  script VM:  ${scriptVmVerdict === "PASS" ? pc.green("PASS") : pc.red(scriptVmVerdict)}${vm?.blockedReason ? pc.dim(` (${vm.blockedReason})`) : ""}`
        );
        if (debugReport.runner) {
          out().writeLine(pc.dim(`  runner: ${debugReport.runner.path} (sha256 ${debugReport.runner.sha256}, ${debugReport.runner.trust})`));
        }
        if (debugReport.runnerWarning) {
          out().writeLine(pc.yellow(`  ${debugReport.runnerWarning}`));
        }
        out().writeLine(
          pc.dim(
            `  context: ${contextOrigin.mode} (utxo=${contextOrigin.utxoOrigin}, ctor=${contextOrigin.constructorArgsOrigin}, entryArgs=${contextOrigin.entryArgsOrigin})`
          )
        );
        if (!isFullyExplicit) {
          out().writeLine(pc.yellow(`  ${contextOrigin.warning}`));
        }
        for (const step of debugReport.trace) {
          const locStr = step.activeLine !== undefined ? `${loaded.sourceFile}:${step.activeLine}` : "<vm>";
          const textStr = step.activeStatement ?? "";
          out().writeLine(
            `  #${step.stepIndex} ${locStr}  ${pc.cyan(textStr)}  ${pc.dim(`stack=[${step.stack.slice(-3).join(", ")}]`)}`
          );
        }
        if (res.diagnostic) {
          const loc = res.diagnostic.location
            ? `${loaded.sourceFile}:${res.diagnostic.location.line}:${res.diagnostic.location.column}`
            : "SOURCE_LOCATION_UNAVAILABLE";
          out().writeLine(pc.red(`  halted at ${loc}: ${res.diagnostic.message}`));
          if (res.diagnostic.location?.lineText) {
            out().writeLine(pc.red(`    > ${res.diagnostic.location.lineText}`));
          }
          out().writeLine(pc.dim(`    variables: ${JSON.stringify(res.diagnostic.variables)}`));
        }
      }
      // exit codes: 0 APPROVED; 1 REJECTED (structural or SCRIPT_VM; 0 with --allow-failure, verdicts unchanged);
      // a toolchain that did not run the VM is never a rejection and --allow-failure does not hide it
      if (globalVerdict === "REJECTED" && structuralVerdict === "FAIL") {
        if (!opts.allowFailure) {
          fail(
            "SILVER_DEBUG_STRUCTURAL_REJECTED",
            `${res.structuralErrorCode ?? "STRUCTURAL_VALIDATION_FAILED"}: ${res.structuralErrorMessage ?? "the structural v1 validation refused the transition"}`
          );
        }
      } else if (globalVerdict === "BLOCKED") {
        failRunnerBlocked(vm?.blockedReason);
      } else if (globalVerdict === "REJECTED" && !opts.allowFailure) {
        fail(
          "SILVER_DEBUG_CONTRACT_REJECTED",
          res.diagnostic?.message ?? "Contract transition rejected by Kaspa Script VM"
        );
      }
    });

  // ---------------------------------------------------------------- fuzz (Fase 3 / Fase 6)
  silver
    .command("fuzz <source-or-record>")
    .description(
      "Run bidirectional property-based fuzzing over a counter covenant transition: SCRIPT_VM checks the counter rule (accepted iff delta > 0 and next = previous + delta) on the SilverScript runner; SYNTHETIC checks the structural compute-budget bounds. " +
        `Exit codes: 0 FUZZ PASS; 1 counterexample (SILVER_FUZZ_FAILED), too few samples of one direction (SILVER_FUZZ_INSUFFICIENT_COVERAGE), a sample without a VM verdict (SILVER_FUZZ_NO_VM_EVIDENCE), a testbed error (SILVER_FUZZ_EVALUATION_ERROR), a runner that gave no verdict (${RUNNER_FAILURE_CODES}) or one that changed during the run (SILVER_RUNNER_CHANGED); ` +
        "2 usage (SILVER_OPTION_INVALID, SILVER_FUZZ_SHAPE_UNSUPPORTED); 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED); 4 tampered compile record"
    )
    .option("--entry <name>", "Covenant entrypoint name: it must take (State, int delta, sig) over a state of one int field", "bump")
    .option("--constructor-args <file>", "Constructor arguments JSON file")
    .option("--runs <n>", "Generated samples (1-10000), run after the boundary samples that every run includes", "10")
    .option("--seed <n>", "Deterministic RNG seed (32-bit integer)", "20261029")
    .option(
      "--backend <backend>",
      "SCRIPT_VM: the counter rule on the SilverScript runner; SYNTHETIC: the structural compute-budget bounds (no contract logic is judged without the VM)",
      "SCRIPT_VM"
    )
    .option("--allow-unverified-runner", ALLOW_UNVERIFIED_RUNNER_HELP, false)
    .option("--json", "Output as JSON", false)
    .action(async (target: string, opts: any) => {
      // options are checked before anything is compiled or run
      const numRuns = countOption(opts.runs, "--runs", 10_000);
      const seed = seedOption(opts.seed);
      const backendRaw = String(opts.backend ?? "").toUpperCase();
      if (backendRaw !== "SCRIPT_VM" && backendRaw !== "SYNTHETIC") {
        fail("SILVER_OPTION_INVALID", `--backend '${opts.backend}' is not SCRIPT_VM or SYNTHETIC`, HardkasExitCode.USAGE_ERROR);
      }
      const backend: "SCRIPT_VM" | "SYNTHETIC" = backendRaw === "SYNTHETIC" ? "SYNTHETIC" : "SCRIPT_VM";
      const { createCovenantTestbed, fuzzCounterTransitions, fuzzComputeBudgetBounds } = await import("@hardkas/testing");
      const testbed = createCovenantTestbed(runnerTrustOptions(opts));
      const ownerAcct = testbed.getAccount("owner");
      const loaded = await loadContractForDevCommand(target, opts.constructorArgs);
      const ctorResolution = await resolveDefaultCtorArgs(
        loaded.source,
        loaded.ctorValues,
        ownerAcct.xOnlyPublicKey
      );
      const contract = await testbed.compileContract({
        source: loaded.source,
        sourceFile: loaded.sourceFile,
        constructorArgs: ctorResolution.values
      });
      assertEntryExists(contract, opts.entry);
      const { stateField } = counterShapeOf(contract, opts.entry);
      // R-04: a SCRIPT_VM fuzz needs a runner the trust policy accepts: refused before any sample runs, never a FUZZ FAIL
      let runnerIdentity: any = null;
      if (backend === "SCRIPT_VM") {
        const { resolveAvailableSilverRunner } = await import("@hardkas/core");
        const resolved = resolveAvailableSilverRunner(undefined, opts.allowUnverifiedRunner ? { trust: "allow-unverified" } : {});
        if (!resolved.available) {
          failRunnerBlocked(`${resolved.reasonCode ?? "RUNNER_NOT_FOUND"}: ${resolved.message ?? "SilverScript runner unavailable"}`);
        }
        runnerIdentity = resolved.identity ?? null;
      }

      // Bidirectional (control 3): boundary samples of both directions always run, every sample is judged against the
      // oracle, a minimum of each direction is required, and every SCRIPT_VM sample needs the VM's own verdict.
      let report: any;
      try {
        report =
          backend === "SCRIPT_VM"
            ? await fuzzCounterTransitions(testbed, contract, { entrypoint: opts.entry, stateField, numRuns, seed })
            : await fuzzComputeBudgetBounds(testbed, contract, { entrypoint: opts.entry, stateField, numRuns, seed });
      } catch (e: any) {
        return fail("SILVER_FUZZ_EVALUATION_ERROR", String(e?.message ?? e));
      }
      // R-05: a runner that could not give a verdict stops the run as a toolchain failure, never a FUZZ FAIL
      if (report.outcome === "INFRASTRUCTURE_ERROR") {
        failRunnerBlocked(report.infrastructureFailure?.message);
      }
      const runner = report.runner ?? runnerIdentity;

      const enrichedReport = {
        ...report,
        oracle:
          backend === "SCRIPT_VM"
            ? `counter rule: accepted iff delta > 0 and next.${stateField} = previous.${stateField} + delta within the SilverScript int range`
            : "structural compute-budget bounds: accepted from the script's estimate to 4 units above it (fee 1000000 sompi); refused with its own code when not a positive integer, below the estimate, above u16 or above the standard mass",
        contextOrigin: {
          mode: ctorResolution.synthesized
            ? "GENERATED_DEMO_FIXTURE"
            : "EXPLICIT_CONSTRUCTOR_WITH_GENERATED_SAMPLES",
          utxoOrigin: "GENERATED_LAB_FIXTURE_UTXO",
          constructorArgsOrigin: ctorResolution.synthesized ? "SYNTHESIZED_FROM_AST" : "EXPLICIT_USER_INPUT",
          sampleOrigin: "BOUNDARY_SAMPLES_THEN_FAST_CHECK_GENERATOR"
        },
        runner,
        runnerWarning: runnerWarningOf(runner)
      };

      if (opts.json) {
        out().writeJson(enrichedReport);
      } else {
        const c = report.coverage;
        out().writeLine(
          `${report.passed ? pc.green("FUZZ PASS") : pc.red(`FUZZ FAIL (${report.outcome})`)} · ${report.propertyName} (${report.numRuns} runs, seed=${report.seed}, backend=${report.backend}, ${report.durationMs}ms)`
        );
        out().writeLine(pc.dim(`  oracle: ${enrichedReport.oracle}`));
        out().writeLine(
          pc.dim(
            `  samples: ${c.samples} (${c.boundarySamples} boundary): expected ACCEPT ${c.expectedAccept} / REJECT ${c.expectedReject} (minimum ${c.minExpectedAccept} / ${c.minExpectedReject})` +
              (backend === "SCRIPT_VM" ? `; VM verdicts PASS ${c.vmVerdicts.SCRIPT_VM_PASS} / REJECTED ${c.vmVerdicts.SCRIPT_VM_REJECTED}` : "")
          )
        );
        out().writeLine(
          pc.dim(
            `  context: ${enrichedReport.contextOrigin.mode} (ctor=${enrichedReport.contextOrigin.constructorArgsOrigin}, utxo=${enrichedReport.contextOrigin.utxoOrigin})`
          )
        );
        if (runner) {
          out().writeLine(pc.dim(`  runner: ${runner.path} (sha256 ${runner.sha256}, ${runner.trust})`));
        }
        if (enrichedReport.runnerWarning) {
          out().writeLine(pc.yellow(`  ${enrichedReport.runnerWarning}`));
        }
        if (report.failure) {
          out().writeLine(pc.red(`  ${report.failure.error}`));
          if (report.failure.shrunkCounterexample !== undefined) {
            out().writeLine(
              pc.red(
                `  counterexample (shrunk after ${report.failure.numShrinks} step(s)): ${JSON.stringify(report.failure.shrunkCounterexample)}`
              )
            );
          }
          out().writeLine(pc.dim(`  reproduce: ${report.failure.reproduceCommand}`));
        }
      }
      if (!report.passed) {
        const codes: Record<string, string> = {
          COUNTEREXAMPLE: "SILVER_FUZZ_FAILED",
          NO_VM_EVIDENCE: "SILVER_FUZZ_NO_VM_EVIDENCE",
          EVALUATION_ERROR: "SILVER_FUZZ_EVALUATION_ERROR",
          INSUFFICIENT_COVERAGE: "SILVER_FUZZ_INSUFFICIENT_COVERAGE"
        };
        fail(codes[report.outcome] ?? "SILVER_FUZZ_FAILED", report.failure?.error ?? "Property fuzzing failed");
      }
    });
}
