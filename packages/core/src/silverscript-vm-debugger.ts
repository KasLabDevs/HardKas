import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadManagedKaspaWasmSync } from "./kaspa-wasm.js";
import { getHardkasHome } from "./toolchains.js";
import {
  getSilContract,
  silContractBytecodeHex,
  type SilAbiArtifact,
  type SilArtifactValue
} from "./silverscript.js";
import {
  silverP2shLock,
  silverSigFromInputSignature
} from "./silverscript-abi.js";
import { silverStateSuccessor } from "./silverscript-state.js";
import {
  SILVER_RUNNER_ENV,
  resolveSilverRunner,
  runnerExecFailure,
  silverRunnerValue,
  stageSilverRunner,
  type SilverRunner,
  type StagedSilverRunner
} from "./silverscript-runner.js";

/**
 * Three strict verification levels enforced across HardKAS Covenant Dev Framework:
 * - SYNTHETIC: Structural validation, ABI/state encoding, topology & fee/mass checks (no Kaspa Script VM execution).
 * - SCRIPT_VM: the SilverScript runner (`cli-debugger`, a local build: upstream publishes no binary) executing
 *   `kaspa-txscript` (`TxScriptEngine` + `CovenantsContext`); its identity and trust travel with every verdict (R-04).
 * - CONSENSUS_SIMNET: Real `rusty-kaspad --simnet` node validation and DAG inclusion.
 */
export type CovenantEvidenceLevel = "SYNTHETIC" | "SCRIPT_VM" | "CONSENSUS_SIMNET";

// ---------------------------------------------------------------------------
// R-04 · runner identity and trust
// ---------------------------------------------------------------------------

/**
 * VERIFIED: the runner's SHA-256 is one of SILVER_RUNNER_TRUSTED_REFERENCES. UNVERIFIED: anything else — a local build
 * HardKAS digested but cannot tie to a published release. A digest computed here never makes a runner VERIFIED.
 */
export type SilverRunnerTrust = "VERIFIED" | "UNVERIFIED";

/** Where the runner came from: an explicit path, HARDKAS_SILVER_RUNNER, or a file under <HARDKAS_HOME>/toolchains. */
export type SilverRunnerSource = "explicit-path" | "env" | "home-toolchains";

export interface SilverRunnerIdentity {
  readonly path: string;
  readonly sha256: string;
  readonly size: number;
  readonly source: SilverRunnerSource;
  /** Upstream publishes no runner binary: every runner is a local build of unknown origin. */
  readonly provenance: "unmanaged-local-build";
  /** The version a toolchain.json next to a <HARDKAS_HOME>/toolchains runner claims. Never verified. */
  readonly claimedVersion?: string | undefined;
  /** Arguments placed before the runner's own (a stand-in driven through another program). */
  readonly prefixArgs?: readonly string[] | undefined;
  readonly trust: SilverRunnerTrust;
  /** VERIFIED only: the reference the digest matched. */
  readonly verifiedBy?: string | undefined;
}

/**
 * The digests a runner can be VERIFIED by. EMPTY on purpose: kaspanet/silverscript publishes no cli-debugger binary to
 * take a reference from, and a local build's own digest is never one. Adding an entry pins a runner: it needs the
 * owner's authorization. Frozen: only a change to this source can add one, never code running in the process.
 */
export const SILVER_RUNNER_TRUSTED_REFERENCES: ReadonlyArray<{ readonly sha256: string; readonly description: string }> =
  Object.freeze([]);

/**
 * The trust a runner's digest earns against `references`. A runner driven through another program (`prefixArgs`, as
 * stand-in runners are) is never VERIFIED: what it does comes from arguments HardKAS does not digest.
 */
export function silverRunnerTrustOf(
  sha256: string,
  prefixArgs?: readonly string[] | undefined,
  references: ReadonlyArray<{ readonly sha256: string; readonly description: string }> = SILVER_RUNNER_TRUSTED_REFERENCES
): { readonly trust: SilverRunnerTrust; readonly verifiedBy?: string | undefined } {
  if (prefixArgs && prefixArgs.length > 0) return { trust: "UNVERIFIED" };
  const reference = references.find((r) => r.sha256 === sha256);
  return reference ? { trust: "VERIFIED", verifiedBy: reference.description } : { trust: "UNVERIFIED" };
}

/**
 * "require-verified" (the default): a runner that is not VERIFIED is never executed (RUNNER_UNVERIFIED).
 * "allow-unverified": the user's explicit opt-in to run an UNVERIFIED local build; every result still names it so.
 */
export type SilverRunnerTrustPolicy = "require-verified" | "allow-unverified";

/** `HARDKAS_SILVER_RUNNER_TRUST=allow-unverified` is the same opt-in as `runnerTrust: "allow-unverified"`. */
export const SILVER_RUNNER_TRUST_ENV = "HARDKAS_SILVER_RUNNER_TRUST";

export function silverRunnerTrustPolicy(explicit?: SilverRunnerTrustPolicy): SilverRunnerTrustPolicy {
  if (explicit) return explicit;
  return process.env[SILVER_RUNNER_TRUST_ENV]?.trim() === "allow-unverified" ? "allow-unverified" : "require-verified";
}

/**
 * The runner's identity as its bytes are now: digested, its trust looked up, never assumed. Throws if unreadable.
 * `data`: the bytes already read from `runner.path` (F2: the caller then stages exactly the bytes it identified).
 */
export function silverRunnerIdentity(runner: SilverRunner, source: SilverRunnerSource, data: Uint8Array = fsSync.readFileSync(runner.path)): SilverRunnerIdentity {
  const sha256 = createHash("sha256").update(data).digest("hex");
  const trusted = silverRunnerTrustOf(sha256, runner.prefixArgs);
  let claimedVersion: string | undefined;
  if (source === "home-toolchains") {
    try {
      const text = fsSync.readFileSync(path.join(path.dirname(runner.path), "toolchain.json"), "utf8").replace(/^\uFEFF/, "");
      const claimed = JSON.parse(text)?.version;
      if (typeof claimed === "string" && claimed.trim() !== "") claimedVersion = claimed.trim();
    } catch {
      // no claim
    }
  }
  return {
    path: runner.path,
    sha256,
    size: data.length,
    source,
    provenance: "unmanaged-local-build",
    ...(claimedVersion ? { claimedVersion } : {}),
    ...(runner.prefixArgs && runner.prefixArgs.length > 0 ? { prefixArgs: [...runner.prefixArgs] } : {}),
    trust: trusted.trust,
    ...(trusted.verifiedBy ? { verifiedBy: trusted.verifiedBy } : {})
  };
}

function unverifiedRunnerMessage(identity: SilverRunnerIdentity): string {
  return (
    `the SilverScript runner ${identity.path} (sha256 ${identity.sha256}, from ${identity.source}) is not verified against a trusted reference: ` +
    "upstream publishes no cli-debugger binary, so a local build cannot be verified. It was not executed. To run it anyway as an " +
    `UNVERIFIED local runner, pass --allow-unverified-runner (CLI), runnerTrust: "allow-unverified" (API) or set ${SILVER_RUNNER_TRUST_ENV}=allow-unverified; ` +
    "its verdicts are then labelled UNVERIFIED, never official."
  );
}

export interface SilverRunnerResolution {
  readonly available: boolean;
  readonly runner?: SilverRunner | undefined;
  /** The runner found, available or not (absent when no runner file was found). */
  readonly identity?: SilverRunnerIdentity | undefined;
  /** Why it is not available (R-05 class): RUNNER_NOT_FOUND or RUNNER_UNVERIFIED. */
  readonly reasonCode?: SilverVmOutcomeClass | undefined;
  readonly message?: string | undefined;
}

/**
 * Resolves the SilverScript runner (`cli-debugger`) without throwing when unconfigured, from:
 * 1. `explicit` if provided: a path, or a runner object (a path, optionally driven through another program with
 *    `prefixArgs`, as stand-in runners are) — identified from its bytes like any other, never taken on its word
 * 2. `process.env.HARDKAS_SILVER_RUNNER` if set
 * 3. `<HARDKAS_HOME>/toolchains/cli-debugger/1.0.0/cli-debugger(.exe)` if present — a local build like any other: the
 *    directory is not a managed toolchain and its toolchain.json version is only a claim.
 * Every runner found is identified (R-04). Under "require-verified" (the default) one that is not VERIFIED is
 * unavailable (RUNNER_UNVERIFIED) and is never executed.
 */
export function resolveAvailableSilverRunner(
  explicit?: string | SilverRunner,
  options: { readonly trust?: SilverRunnerTrustPolicy | undefined } = {}
): SilverRunnerResolution {
  const policy = silverRunnerTrustPolicy(options.trust);
  const explicitPath = typeof explicit === "string" ? explicit : undefined;
  const configured = explicit === undefined ? process.env[SILVER_RUNNER_ENV] : explicitPath;
  let runner: SilverRunner;
  let source: SilverRunnerSource;
  if (explicit != null && typeof explicit === "object") {
    runner = explicit;
    source = "explicit-path";
  } else if (configured && configured.trim() !== "") {
    source = explicitPath !== undefined ? "explicit-path" : "env";
    try {
      runner = resolveSilverRunner(configured);
    } catch (e: any) {
      return { available: false, reasonCode: "RUNNER_NOT_FOUND", message: e?.message ?? String(e) };
    }
  } else {
    const exeName = process.platform === "win32" ? "cli-debugger.exe" : "cli-debugger";
    const managedCandidate = path.join(getHardkasHome(), "toolchains", "cli-debugger", "1.0.0", exeName);
    let present = false;
    try {
      present = fsSync.statSync(managedCandidate).isFile();
    } catch {
      present = false;
    }
    if (!present) {
      return {
        available: false,
        reasonCode: "RUNNER_NOT_FOUND",
        message: `SILVER_RUNNER_NOT_CONFIGURED: no SilverScript cli-debugger binary configured in $${SILVER_RUNNER_ENV} or ${managedCandidate}.`
      };
    }
    source = "home-toolchains";
    try {
      runner = resolveSilverRunner(managedCandidate);
    } catch (e: any) {
      return { available: false, reasonCode: "RUNNER_NOT_FOUND", message: e?.message ?? String(e) };
    }
  }
  let identity: SilverRunnerIdentity;
  try {
    identity = silverRunnerIdentity(runner, source);
  } catch (e: any) {
    return { available: false, reasonCode: "RUNNER_NOT_FOUND", message: `${runner.path}: ${e?.code ?? e?.message}` };
  }
  if (explicit != null && typeof explicit === "object" && explicit.binarySha256 && explicit.binarySha256 !== identity.sha256) {
    return {
      available: false,
      identity,
      reasonCode: "RUNNER_UNVERIFIED",
      message: `the runner ${runner.path} is not the one described (sha256 ${explicit.binarySha256} given, ${identity.sha256} on disk); it was not executed`
    };
  }
  if (identity.trust !== "VERIFIED" && policy !== "allow-unverified") {
    return { available: false, identity, reasonCode: "RUNNER_UNVERIFIED", message: unverifiedRunnerMessage(identity) };
  }
  // the size and the digest of one read (the identity's), never of two
  return { available: true, runner: { ...runner, binarySha256: identity.sha256, size: identity.size }, identity };
}

export interface SilverVmSourceLocation {
  readonly file?: string | undefined;
  readonly line: number;
  readonly column: number;
  readonly lineText?: string | undefined;
  readonly underlineLabel?: string | undefined;
}

export interface SilverVmCallFrame {
  readonly functionName: string;
  readonly location?: SilverVmSourceLocation | undefined;
  readonly variables: Readonly<Record<string, string>>;
}

export interface SilverVmFailureDiagnostic {
  readonly message: string;
  readonly sourceLocationStatus: "RESOLVED" | "SOURCE_LOCATION_UNAVAILABLE";
  readonly location?: SilverVmSourceLocation | undefined;
  readonly frames: readonly SilverVmCallFrame[];
  readonly variables: Readonly<Record<string, string>>;
  readonly failedStatement?: string | undefined;
  readonly isPreScriptContextError: boolean;
  readonly rawStderr: string;
}

export interface SilverVmTraceStep {
  readonly stepIndex: number;
  readonly activeLine?: number | undefined;
  readonly activeStatement?: string | undefined;
  readonly stack: readonly string[];
  readonly variables: Readonly<Record<string, string>>;
}

export type SilverVmArgInput =
  | SilArtifactValue
  | { readonly signature: string }
  | { readonly privateKeyHex: string };

export interface SilverVmInputScenario {
  readonly prevTxId?: string | undefined;
  readonly prevIndex?: number | bigint | undefined;
  readonly sequence?: number | bigint | undefined;
  readonly sigOpCount?: number | bigint | undefined;
  readonly utxoValue: number | bigint;
  readonly covenantId?: string | undefined;
  readonly state?: Readonly<Record<string, SilArtifactValue>> | undefined;
  readonly utxoScriptHex?: string | undefined;
  /**
   * A non-active input's signature script, as the runner should see it (`signature_script_hex`): what a program reads
   * from another input (a delegator's invocation and program, for instance). Not part of the signed message.
   */
  readonly signatureScriptHex?: string | undefined;
}

export interface SilverVmOutputScenario {
  readonly value: number | bigint;
  readonly covenantId?: string | undefined;
  readonly authorizingInput?: number | bigint | undefined;
  readonly state?: Readonly<Record<string, SilArtifactValue>> | undefined;
  readonly scriptHex?: string | undefined;
  readonly p2pkPubkey?: string | undefined;
}

export interface SilverVmExecutionRequest {
  readonly source: string;
  readonly sourceFile?: string | undefined;
  readonly artifact: SilAbiArtifact;
  readonly contractName?: string | undefined;
  readonly constructorArgs: readonly SilArtifactValue[];
  readonly entrypoint: string;
  readonly args: readonly SilverVmArgInput[];
  readonly tx?: {
    readonly version?: number | bigint | undefined;
    readonly lockTime?: number | bigint | undefined;
    readonly activeInputIndex?: number | bigint | undefined;
    readonly inputs: readonly SilverVmInputScenario[];
    readonly outputs: readonly SilverVmOutputScenario[];
  } | undefined;
  readonly signer?: ((account: string) => string | Promise<string>) | undefined;
  readonly runner?: SilverRunner | undefined;
  /** The identity resolution gave `runner`: its digest is checked again right before the runner is executed (R-04). */
  readonly runnerIdentity?: SilverRunnerIdentity | undefined;
  /** R-04: "allow-unverified" runs an UNVERIFIED runner; default HARDKAS_SILVER_RUNNER_TRUST, else "require-verified". */
  readonly runnerTrust?: SilverRunnerTrustPolicy | undefined;
  readonly captureTrace?: boolean | undefined;
  readonly maxTraceSteps?: number | undefined;
  readonly timeoutMs?: number | undefined;
}

/**
 * R-05 · what one SCRIPT_VM run established. Only SCRIPT_VM_PASS and SCRIPT_VM_REJECTED are the runner's verdicts on the
 * contract (status SCRIPT_VM_PASS / SCRIPT_VM_FAIL); every RUNNER_* class is a toolchain failure (status BLOCKED) and
 * never a contract rejection.
 */
export type SilverVmOutcomeClass =
  | "SCRIPT_VM_PASS"
  | "SCRIPT_VM_REJECTED"
  | "RUNNER_NOT_FOUND"
  | "RUNNER_UNVERIFIED"
  | "RUNNER_START_FAILED"
  | "RUNNER_TIMEOUT"
  | "RUNNER_PROTOCOL_ERROR"
  | "RUNNER_INTERNAL_ERROR";

export interface SilverVmExecutionResult {
  readonly evidenceLevel: "SCRIPT_VM";
  readonly status: "SCRIPT_VM_PASS" | "SCRIPT_VM_FAIL" | "BLOCKED";
  /** R-05: the class of the outcome; `status` follows from it. */
  readonly outcomeClass: SilverVmOutcomeClass;
  readonly passed: boolean;
  readonly contractName: string;
  readonly entrypoint: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly diagnostic?: SilverVmFailureDiagnostic | undefined;
  readonly trace?: readonly SilverVmTraceStep[] | undefined;
  readonly stackAtHalt?: readonly string[] | undefined;
  readonly variablesAtHalt?: Readonly<Record<string, string>> | undefined;
  readonly runnerBinarySha256?: string | undefined;
  /** R-04: the runner that ran (or was refused): path, SHA-256, source, provenance, trust. */
  readonly runnerIdentity?: SilverRunnerIdentity | undefined;
  readonly scenarioTxId?: string | undefined;
  readonly blockedReason?: string | undefined;
}

function cleanHex(raw: string, label: string, exactBytes?: number): string {
  const hex = raw.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^(?:[0-9a-f]{2})*$/.test(hex)) {
    throw new Error(`SILVER_VM_INVALID_HEX: ${label} is not a valid even-length hex string`);
  }
  if (exactBytes !== undefined && hex.length !== exactBytes * 2) {
    throw new Error(`SILVER_VM_INVALID_HEX: ${label} must be ${exactBytes} bytes (${exactBytes * 2} hex chars), got ${hex.length / 2} bytes`);
  }
  return hex;
}

/**
 * H-B1 · the runner reads lock_time, sequence, utxo_value and value as u64 JSON integers (debugger-session test_runner.rs)
 * and HardKAS signs the scenario with the same values: each one is an exact bigint in the u64 range, never a rounded
 * double. A JS number that is not an exact integer has already lost its value: it is refused, as is anything outside u64.
 */
const RUNNER_U64_MAX = (1n << 64n) - 1n;

function scenarioU64(v: number | bigint, where: string): bigint {
  if (typeof v === "number" && !Number.isSafeInteger(v)) {
    throw new Error(`SILVER_VM_NUMBER_UNSAFE: ${where}: ${v} is not a safe integer, so it may already have lost its value (pass a bigint)`);
  }
  const n = BigInt(v);
  if (n < 0n || n > RUNNER_U64_MAX) {
    throw new Error(`SILVER_VM_NUMBER_OUT_OF_RANGE: ${where}: ${n} is not a u64 (0 to 2^64 - 1)`);
  }
  return n;
}

/**
 * N-10 · the same u64 check for code that passes these values on to a SCRIPT_VM scenario (the testbed's lockTime and
 * sequence): the exact bigint, or SILVER_VM_NUMBER_UNSAFE / SILVER_VM_NUMBER_OUT_OF_RANGE before any verdict.
 */
export function assertSilverU64(v: number | bigint, where: string): bigint {
  return scenarioU64(v, where);
}

/**
 * N-4 · the small fields of the runner's test file have their own ranges (debugger-session test_runner.rs: version u16,
 * prev_index u32, sig_op_count u8, authorizing_input u16, active_input_index usize): an exact integer of that range, as a
 * number, so a bigint given there is written as a plain JSON integer.
 */
function scenarioUint(v: number | bigint, where: string, max: number): number {
  if (typeof v === "number" && !Number.isSafeInteger(v)) {
    throw new Error(`SILVER_VM_NUMBER_UNSAFE: ${where}: ${v} is not a safe integer`);
  }
  const n = BigInt(v);
  if (n < 0n || n > BigInt(max)) {
    throw new Error(`SILVER_VM_NUMBER_OUT_OF_RANGE: ${where}: ${n} is not in 0 to ${max}`);
  }
  return Number(n);
}

interface CheckedScenarioInput extends Omit<SilverVmInputScenario, "prevIndex" | "sequence" | "sigOpCount" | "utxoValue"> {
  readonly prevIndex?: number | undefined;
  readonly sequence?: bigint | undefined;
  readonly sigOpCount?: number | undefined;
  readonly utxoValue: bigint;
}

interface CheckedScenarioOutput extends Omit<SilverVmOutputScenario, "value" | "authorizingInput"> {
  readonly value: bigint;
  readonly authorizingInput?: number | undefined;
}

interface CheckedScenarioTx {
  readonly version?: number | undefined;
  readonly lockTime?: bigint | undefined;
  readonly activeInputIndex: number;
  readonly inputs: readonly CheckedScenarioInput[];
  readonly outputs: readonly CheckedScenarioOutput[];
}

/**
 * N-3, N-4 · every number of the scenario, checked and normalized before anything else (the runner's resolution and trust
 * policy included, so a bad value is a usage error whatever the runner): u64 fields as exact bigints, small fields as
 * numbers of their range, the active input an index of the inputs. Throws SILVER_VM_NUMBER_UNSAFE / _OUT_OF_RANGE.
 */
function checkedScenarioTx(tx: NonNullable<SilverVmExecutionRequest["tx"]>): CheckedScenarioTx {
  const inputs = tx.inputs.map((inp, i): CheckedScenarioInput => {
    const { prevIndex, sequence, sigOpCount, utxoValue, ...rest } = inp;
    return {
      ...rest,
      ...(prevIndex !== undefined ? { prevIndex: scenarioUint(prevIndex, `inputs[${i}].prevIndex`, 0xffff_ffff) } : {}),
      ...(sequence !== undefined ? { sequence: scenarioU64(sequence, `inputs[${i}].sequence`) } : {}),
      ...(sigOpCount !== undefined ? { sigOpCount: scenarioUint(sigOpCount, `inputs[${i}].sigOpCount`, 0xff) } : {}),
      utxoValue: scenarioU64(utxoValue, `inputs[${i}].utxoValue`)
    };
  });
  const outputs = tx.outputs.map((out, i): CheckedScenarioOutput => {
    const { value, authorizingInput, ...rest } = out;
    return {
      ...rest,
      value: scenarioU64(value, `outputs[${i}].value`),
      ...(authorizingInput !== undefined ? { authorizingInput: scenarioUint(authorizingInput, `outputs[${i}].authorizingInput`, 0xffff) } : {})
    };
  });
  const activeInputIndex = scenarioUint(tx.activeInputIndex ?? 0, "activeInputIndex", Number.MAX_SAFE_INTEGER);
  if (activeInputIndex >= inputs.length) {
    throw new Error(`SILVER_VM_NUMBER_OUT_OF_RANGE: activeInputIndex: ${activeInputIndex} is not an input (the scenario has ${inputs.length})`);
  }
  if (inputs[activeInputIndex]!.signatureScriptHex !== undefined) {
    throw new Error(`SILVER_VM_SCENARIO_INVALID: inputs[${activeInputIndex}].signatureScriptHex: the active input's signature script is the runner's own encoding of the call; give one only for the other inputs`);
  }
  return {
    ...(tx.version !== undefined ? { version: scenarioUint(tx.version, "version", 0xffff) } : {}),
    ...(tx.lockTime !== undefined ? { lockTime: scenarioU64(tx.lockTime, "lockTime") } : {}),
    activeInputIndex,
    inputs,
    outputs
  };
}

/**
 * M-1 · a u64 field of the runner's test file, as the exact JSON integer: a JSON.rawJSON value placed in the payload
 * itself. No bigint is left for JSON.stringify to meet, so a host's BigInt.prototype.toJSON (which JSON.stringify calls
 * before any replacer) cannot turn it into a string or a rounded number; a rawJSON value has no prototype to look it up on.
 */
function runnerU64(v: number | bigint, where: string): unknown {
  const n = scenarioU64(v, where);
  // JSON.rawJSON (JSON.parse source text access) is in Node.js since 21; TypeScript's lib does not declare it yet
  const rawJSON = (JSON as unknown as { rawJSON?: (text: string) => unknown }).rawJSON;
  if (typeof rawJSON !== "function") {
    throw new Error("SILVER_VM_EXACT_JSON_UNAVAILABLE: this Node.js cannot write an exact u64 JSON integer (JSON.rawJSON); use the supported Node.js 24.22.1");
  }
  return rawJSON(n.toString());
}

/**
 * B-1 · an int (or temporal) value given as a JS number must be a safe integer: one that is not has already lost its
 * value, and would reach the runner rounded. Walks arrays and structs; bigints and decimal strings pass (they are exact).
 * Throws SILVER_VM_NUMBER_UNSAFE.
 */
export function assertSafeSilverIntegers(value: unknown, where: string): void {
  const v = value as { kind?: unknown; value?: unknown } | null;
  if (v === null || typeof v !== "object") return;
  if (v.kind === "int" && typeof v.value === "number" && !Number.isSafeInteger(v.value)) {
    throw new Error(`SILVER_VM_NUMBER_UNSAFE: ${where}: ${v.value} is not a safe integer, so it may already have lost its value (pass a bigint)`);
  }
  if (v.kind === "array" && Array.isArray(v.value)) {
    v.value.forEach((x, i) => assertSafeSilverIntegers(x, `${where}[${i}]`));
  } else if (v.kind === "object" && v.value !== null && typeof v.value === "object") {
    for (const [k, x] of Object.entries(v.value)) assertSafeSilverIntegers(x, `${where}.${k}`);
  }
}

function serializeStateForRunner(state: Readonly<Record<string, SilArtifactValue>>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(state).sort()) {
    const val = state[key]!;
    if (val.kind === "int") {
      const n = BigInt(val.value);
      if (n >= BigInt(Number.MIN_SAFE_INTEGER) && n <= BigInt(Number.MAX_SAFE_INTEGER)) {
        out[key] = Number(n);
      } else {
        out[key] = n.toString();
      }
    } else if (val.kind === "bool") {
      out[key] = Boolean(val.value);
    } else {
      out[key] = silverRunnerValue(val, `state.${key}`, true);
    }
  }
  return out;
}

/**
 * Reconstructs the exact `kaspa-wasm` v2.1.0 `Transaction` that `cli-debugger` v1.0.0
 * builds in `debugger/cli/src/main.rs` (including state materialization via `silverStateSuccessor`,
 * `covenant_id`, and `CovenantBinding`), so that Schnorr signatures (`SIGHASH_ALL`) over
 * both stateless `entry` and stateful `#[covenant]` functions verify in `TxScriptEngine`.
 */
export function buildSilverVmScenarioTransaction(params: {
  readonly artifact: SilAbiArtifact;
  readonly contractName?: string | undefined;
  readonly tx?: SilverVmExecutionRequest["tx"];
}): { wasmTx: any; txId: string; activeInputIndex: number } {
  const k = loadManagedKaspaWasmSync();
  const { name, contract } = getSilContract(params.artifact, params.contractName);
  const baseLockHex = silverP2shLock(silContractBytecodeHex(contract)).script.toLowerCase();

  const scenario: CheckedScenarioTx = params.tx
    ? checkedScenarioTx(params.tx)
    : { version: 1, lockTime: 0n, activeInputIndex: 0, inputs: [{ utxoValue: 5000n }], outputs: [{ value: 5000n }] };
  const activeInputIndex = scenario.activeInputIndex;

  const inputs = scenario.inputs.map((inp, idx) => {
    const txIdHex = inp.prevTxId !== undefined
      ? cleanHex(inp.prevTxId, `inputs[${idx}].prevTxId`, 32)
      : (idx & 0xff).toString(16).padStart(2, "0").repeat(32);
    const outpoint = {
      transactionId: txIdHex,
      index: inp.prevIndex ?? 0
    };
    let spkHex: string;
    if (inp.utxoScriptHex !== undefined) {
      spkHex = cleanHex(inp.utxoScriptHex, `inputs[${idx}].utxoScriptHex`);
    } else if (inp.state !== undefined) {
      spkHex = silverStateSuccessor(params.artifact, name, inp.state).lock.script.toLowerCase();
    } else {
      spkHex = baseLockHex;
    }
    const covIdHex = inp.covenantId !== undefined
      ? cleanHex(inp.covenantId, `inputs[${idx}].covenantId`, 32)
      : undefined;

    return {
      previousOutpoint: outpoint,
      signatureScript: "",
      sequence: inp.sequence ?? 0n,
      sigOpCount: inp.sigOpCount ?? 100,
      utxo: {
        outpoint,
        amount: inp.utxoValue,
        scriptPublicKey: new k.ScriptPublicKey(0, spkHex),
        blockDaaScore: 0n,
        isCoinbase: false,
        ...(covIdHex !== undefined ? { covenant_id: covIdHex } : {})
      }
    };
  });

  const outputs = scenario.outputs.map((out, idx) => {
    let spkHex: string;
    if (out.scriptHex !== undefined) {
      spkHex = cleanHex(out.scriptHex, `outputs[${idx}].scriptHex`);
    } else if (out.p2pkPubkey !== undefined) {
      const pkHex = cleanHex(out.p2pkPubkey, `outputs[${idx}].p2pkPubkey`, 32);
      spkHex = String(new k.ScriptBuilder().addData(pkHex).addOp(k.Opcodes.OpCheckSig).drain());
    } else if (out.state !== undefined) {
      spkHex = silverStateSuccessor(params.artifact, name, out.state).lock.script.toLowerCase();
    } else {
      spkHex = baseLockHex;
    }
    const covIdHex = out.covenantId !== undefined
      ? cleanHex(out.covenantId, `outputs[${idx}].covenantId`, 32)
      : undefined;

    return {
      value: out.value,
      scriptPublicKey: new k.ScriptPublicKey(0, spkHex),
      ...(covIdHex !== undefined
        ? {
            covenant: {
              authorizingInput: out.authorizingInput ?? activeInputIndex,
              covenantId: covIdHex
            }
          }
        : {})
    };
  });

  const wasmTx = new k.Transaction({
    version: scenario.version ?? 1,
    inputs,
    outputs,
    lockTime: scenario.lockTime ?? 0n,
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  });

  return { wasmTx, txId: String(wasmTx.id), activeInputIndex };
}

/**
 * Parses `cli-debugger`'s diagnostic output from `stderr` into a structured `SilverVmFailureDiagnostic`.
 * Never fabricates line numbers: if `cli-debugger` does not emit a `--> line:col` span, returns
 * `sourceLocationStatus: "SOURCE_LOCATION_UNAVAILABLE"`.
 */
export function parseCliDebuggerFailureReport(
  stderr: string,
  source: string,
  sourceFile?: string
): SilverVmFailureDiagnostic {
  const raw = stderr.trim();
  const sourceLines = source.split(/\r?\n/);

  const errorLineMatch = /^error:\s*(.+)$/m.exec(raw);
  const firstErrorLineMatch = /^Error:\s*(.+)$/m.exec(raw);
  const message = errorLineMatch?.[1]?.trim()
    ?? firstErrorLineMatch?.[1]?.trim()
    ?? (raw.split(/\r?\n/)[0]?.trim() || "Script verification failed");

  const frames: SilverVmCallFrame[] = [];
  const allVars: Record<string, string> = {};

  const lines = raw.split(/\r?\n/);
  let currentFunction = "<entrypoint>";
  let currentLocation: SilverVmSourceLocation | undefined;
  let currentVars: Record<string, string> = {};

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const locMatch = /^\s*-->\s*(\d+):(\d+)\s*$/.exec(line);
    if (locMatch) {
      const lineNum = Number(locMatch[1]);
      const colNum = Number(locMatch[2]);
      const srcLine = sourceLines[lineNum - 1]?.trim();
      currentLocation = {
        ...(sourceFile ? { file: sourceFile } : {}),
        line: lineNum,
        column: colNum,
        ...(srcLine ? { lineText: srcLine } : {})
      };
      continue;
    }

    const callMatch = /^\s*:::\s*called from\s+(.+)$/.exec(line);
    if (callMatch) {
      if (currentLocation || Object.keys(currentVars).length > 0) {
        frames.push({
          functionName: currentFunction,
          ...(currentLocation ? { location: currentLocation } : {}),
          variables: { ...currentVars }
        });
      }
      currentFunction = callMatch[1]!.trim();
      currentLocation = undefined;
      currentVars = {};
      continue;
    }

    const underlineMatch = /^\s*\|\s*\^+(\s+.+)?$/.exec(line);
    if (underlineMatch && currentLocation) {
      const label = underlineMatch[1]?.trim();
      currentLocation = {
        ...currentLocation,
        ...(label ? { underlineLabel: label } : {})
      };
      continue;
    }

    const varsMatch = /^\s*\|\s{3,}(.+ = .+)$/.exec(line);
    if (varsMatch) {
      const pairs = splitTopLevelCommas(varsMatch[1]!.trim());
      for (const pair of pairs) {
        const eqIdx = pair.indexOf("=");
        if (eqIdx > 0) {
          const k = pair.slice(0, eqIdx).trim();
          const v = pair.slice(eqIdx + 1).trim();
          currentVars[k] = v;
          if (!(k in allVars)) allVars[k] = v;
        }
      }
    }
  }

  if (currentLocation || Object.keys(currentVars).length > 0) {
    frames.push({
      functionName: currentFunction,
      ...(currentLocation ? { location: currentLocation } : {}),
      variables: { ...currentVars }
    });
  }

  const primaryLocation = frames[0]?.location;
  const isPreScriptContextError = !raw.includes("-->") && (
    raw.includes("Covenant") ||
    raw.includes("covenant") ||
    raw.includes("Authorizing") ||
    raw.includes("authorizing") ||
    raw.includes("explicit state")
  );

  return {
    message,
    sourceLocationStatus: primaryLocation ? "RESOLVED" : "SOURCE_LOCATION_UNAVAILABLE",
    ...(primaryLocation ? { location: primaryLocation } : {}),
    frames,
    variables: allVars,
    ...(primaryLocation?.lineText ? { failedStatement: primaryLocation.lineText } : {}),
    isPreScriptContextError,
    rawStderr: raw
  };
}

function splitTopLevelCommas(input: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (ch === "{" || ch === "[" || ch === "(") depth++;
    else if (ch === "}" || ch === "]" || ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(input.slice(start, i).trim());
      start = i + 1;
    }
  }
  const tail = input.slice(start).trim();
  if (tail) parts.push(tail);
  return parts;
}

/**
 * Parses `cli-debugger` REPL session stdout into structured `SilverVmTraceStep`s.
 */
export function parseCliDebuggerReplTrace(stdout: string): {
  steps: SilverVmTraceStep[];
  lastStack: string[];
  lastVariables: Record<string, string>;
} {
  const chunks = stdout.split("(sdb)");
  const steps: SilverVmTraceStep[] = [];
  let currentLine: number | undefined;
  let currentStmt: string | undefined;
  let currentVars: Record<string, string> = {};
  let currentStack: string[] = [];

  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/);
    let inStack = false;
    let inVars = false;
    const stackItems: string[] = [];

    for (const line of lines) {
      const activeMatch = /^→\s*(\d+)\s*\|\s*(.+)$/.exec(line);
      if (activeMatch) {
        currentLine = Number(activeMatch[1]);
        currentStmt = activeMatch[2]!.trim();
        inStack = false;
        inVars = false;
        continue;
      }

      if (/^(Constructor Args|Constants|Contract State|Call Arguments|Locals):$/.test(line.trim())) {
        inVars = true;
        inStack = false;
        continue;
      }

      if (line.trim() === "Stack:") {
        inStack = true;
        inVars = false;
        continue;
      }

      if (inVars) {
        const varMatch = /^\s{2}([a-zA-Z0-9_]+)\s+\(([^)]+)\)\s+=\s+(.+)$/.exec(line);
        if (varMatch) {
          currentVars[varMatch[1]!] = varMatch[3]!.trim();
          continue;
        }
      }

      if (inStack) {
        const stackMatch = /^\[(\d+)\]\s*(.*)$/.exec(line.trim());
        if (stackMatch) {
          stackItems.push(stackMatch[2]!.trim());
          continue;
        }
      }
    }

    if (stackItems.length > 0) {
      currentStack = stackItems;
      steps.push({
        stepIndex: steps.length,
        ...(currentLine !== undefined ? { activeLine: currentLine } : {}),
        ...(currentStmt !== undefined ? { activeStatement: currentStmt } : {}),
        stack: [...currentStack],
        variables: { ...currentVars }
      });
    }
  }

  return {
    steps,
    lastStack: currentStack,
    lastVariables: currentVars
  };
}

const MAX_PROCESS_OUTPUT_BYTES = 8 * 1024 * 1024;

/**
 * R-05 · the runner's protocol (cli-debugger v1.0.0, as a local build behaves for every rejection the framework's suites
 * exercise): a pass is exit 0 with a `PASS` line; a contract rejection is exit 1 with its failure report (an `error: …`
 * line, usually a `--> line:col` span) ending in `Error: "FAIL"`. Anything else is not a verdict on the contract.
 */
export function classifySilverRunnerRun(run: {
  readonly exitCode: number | null;
  readonly signal?: string | null | undefined;
  readonly stdout: string;
  readonly stderr: string;
}): { readonly outcomeClass: SilverVmOutcomeClass; readonly detail: string } {
  const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const out = lines(run.stdout);
  const err = lines(run.stderr);
  if (run.exitCode === 0) {
    return out.includes("PASS")
      ? { outcomeClass: "SCRIPT_VM_PASS", detail: "exit 0 with the runner's PASS line" }
      : { outcomeClass: "RUNNER_PROTOCOL_ERROR", detail: "the program exited 0 without the runner's PASS line: not a verdict" };
  }
  if (run.exitCode === null) {
    return { outcomeClass: "RUNNER_INTERNAL_ERROR", detail: `the runner was terminated (${run.signal ?? "no exit code"})` };
  }
  if (run.exitCode === 101 || /\bpanicked at\b/.test(`${run.stdout}\n${run.stderr}`)) {
    return { outcomeClass: "RUNNER_INTERNAL_ERROR", detail: `the runner panicked (exit ${run.exitCode})` };
  }
  const last = err[err.length - 1] ?? "";
  if (run.exitCode === 1 && last === 'Error: "FAIL"' && err.some((l) => /^error:/.test(l))) {
    return { outcomeClass: "SCRIPT_VM_REJECTED", detail: "exit 1 with the runner's failure report and its FAIL verdict" };
  }
  if (/^Error:/.test(last) && last !== 'Error: "FAIL"') {
    return { outcomeClass: "RUNNER_INTERNAL_ERROR", detail: `the runner failed with its own error, not a verdict: ${last.slice(0, 200)}` };
  }
  return {
    outcomeClass: "RUNNER_PROTOCOL_ERROR",
    detail: `exit ${run.exitCode} without the runner's failure report and FAIL verdict: not a verdict`
  };
}

/** R-05 · a run that did not complete: which toolchain class it is (never a contract rejection). */
export function classifySilverRunnerFailure(e: unknown): { readonly outcomeClass: SilverVmOutcomeClass; readonly detail: string } {
  const err = e as { code?: unknown; message?: unknown } | null;
  const code = typeof err?.code === "string" ? err.code : undefined;
  const message = String(err?.message ?? e);
  if (code === "SILVER_RUNNER_TIMEOUT") return { outcomeClass: "RUNNER_TIMEOUT", detail: message };
  if (code === "SILVER_RUNNER_MAX_BUFFER") return { outcomeClass: "RUNNER_PROTOCOL_ERROR", detail: message };
  if (code === "ENOENT") return { outcomeClass: "RUNNER_NOT_FOUND", detail: `the runner could not be found when started (${message})` };
  if (code) return { outcomeClass: "RUNNER_START_FAILED", detail: `the runner could not be started (${code}: ${message})` };
  return { outcomeClass: "RUNNER_INTERNAL_ERROR", detail: message };
}

function runnerProcessError(code: "SILVER_RUNNER_TIMEOUT" | "SILVER_RUNNER_MAX_BUFFER", message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

function runProcess(
  command: string,
  args: readonly string[],
  timeoutMs: number,
  stdinInput?: string
): Promise<{ exitCode: number | null; signal?: string | null; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    if (stdinInput !== undefined) {
      const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
      let stdout = "";
      let stderr = "";
      let totalBytes = 0;
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        child.kill();
        reject(runnerProcessError("SILVER_RUNNER_TIMEOUT", `timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      const checkOutputLimit = (chunkLen: number) => {
        totalBytes += chunkLen;
        if (totalBytes > MAX_PROCESS_OUTPUT_BYTES && !settled) {
          settled = true;
          clearTimeout(timer);
          child.kill();
          reject(runnerProcessError("SILVER_RUNNER_MAX_BUFFER", `debugger output exceeded ${MAX_PROCESS_OUTPUT_BYTES} bytes`));
        }
      };
      // a runner that exits before reading its input must not crash the caller (EPIPE on stdin)
      child.stdin.on("error", () => {});

      child.stdout.on("data", (d: Buffer) => {
        checkOutputLimit(d.length);
        if (!settled) stdout += d.toString("utf8");
      });
      child.stderr.on("data", (d: Buffer) => {
        checkOutputLimit(d.length);
        if (!settled) stderr += d.toString("utf8");
      });
      child.on("error", (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(err);
      });
      child.on("close", (code, signal) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve({ exitCode: code, signal, stdout, stderr });
      });
      child.stdin.write(stdinInput);
      child.stdin.end();
      return;
    }

    execFile(command, [...args], { timeout: timeoutMs, maxBuffer: MAX_PROCESS_OUTPUT_BYTES, windowsHide: true }, (err, stdout, stderr) => {
      const out = String(stdout ?? "");
      const errOut = String(stderr ?? "");
      if (!err) {
        resolve({ exitCode: 0, stdout: out, stderr: errOut });
        return;
      }
      const anyErr = err as any;
      // R-05: an output past the limit kills the process too (`killed`): checked first, it is not a timeout
      if (anyErr.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" || /maxBuffer/i.test(String(anyErr.message ?? ""))) {
        reject(runnerProcessError("SILVER_RUNNER_MAX_BUFFER", `the runner's output exceeded ${MAX_PROCESS_OUTPUT_BYTES} bytes`));
        return;
      }
      if (anyErr.killed) {
        reject(runnerProcessError("SILVER_RUNNER_TIMEOUT", `timed out after ${timeoutMs}ms`));
        return;
      }
      if (typeof anyErr.code === "number") {
        resolve({ exitCode: anyErr.code, stdout: out, stderr: errOut });
        return;
      }
      if (anyErr.signal) {
        resolve({ exitCode: null, signal: String(anyErr.signal), stdout: out, stderr: errOut });
        return;
      }
      // a process that could not start: its errno code (ENOENT, EACCES, UNKNOWN, …)
      reject(err);
    });
  });
}

/**
 * Executes a SilverScript contract entrypoint or `#[covenant]` transition on the SilverScript runner (`cli-debugger`,
 * `kaspa-txscript`), returning its `SCRIPT_VM` verdict and diagnostics with the runner's identity (R-04). A runner that
 * is not VERIFIED runs only under the "allow-unverified" opt-in; one whose bytes changed since it was resolved never runs.
 */
export async function executeSilverVmScenario(
  request: SilverVmExecutionRequest
): Promise<SilverVmExecutionResult> {
  const { name: contractName } = getSilContract(request.artifact, request.contractName);
  // B-1: every int value that reaches the runner (arguments, constructor arguments, state) is checked before anything runs
  request.constructorArgs.forEach((v, i) => assertSafeSilverIntegers(v, `constructorArgs[${i}]`));
  request.args.forEach((a, i) => assertSafeSilverIntegers(a, `args[${i}]`));
  const states = [
    ...(request.tx?.inputs ?? []).map((io, i) => [`inputs[${i}]`, io.state] as const),
    ...(request.tx?.outputs ?? []).map((io, i) => [`outputs[${i}]`, io.state] as const)
  ];
  for (const [where, state] of states) {
    for (const [k, v] of Object.entries(state ?? {})) assertSafeSilverIntegers(v, `${where}.state.${k}`);
  }
  // N-3, N-4: so are the scenario's own numbers, before the runner is resolved or judged
  const tx = request.tx ? checkedScenarioTx(request.tx) : undefined;
  const blocked = (outcomeClass: SilverVmOutcomeClass, message: string, identity?: SilverRunnerIdentity): SilverVmExecutionResult => ({
    evidenceLevel: "SCRIPT_VM",
    status: "BLOCKED",
    outcomeClass,
    passed: false,
    contractName,
    entrypoint: request.entrypoint,
    exitCode: null,
    stdout: "",
    stderr: message,
    blockedReason: `${outcomeClass}: ${message}`,
    ...(identity ? { runnerIdentity: identity } : {})
  });

  // R-04: identify the runner as it is now, and apply the trust policy before anything runs. F2: its bytes are read once,
  // here, and what starts later is a private copy of exactly those bytes, whatever happens to its file meanwhile.
  const policy = silverRunnerTrustPolicy(request.runnerTrust);
  let runner: SilverRunner;
  let identity: SilverRunnerIdentity;
  let runnerBytes: Uint8Array;
  if (request.runner) {
    runner = request.runner;
    try {
      runnerBytes = fsSync.readFileSync(runner.path);
      identity = silverRunnerIdentity(runner, request.runnerIdentity?.source ?? "explicit-path", runnerBytes);
    } catch (e: any) {
      return blocked("RUNNER_NOT_FOUND", `${runner.path}: ${e?.code ?? e?.message}`);
    }
    const resolvedSha256 = request.runnerIdentity?.sha256 ?? runner.binarySha256;
    if (resolvedSha256 && resolvedSha256 !== identity.sha256) {
      return blocked(
        "RUNNER_UNVERIFIED",
        `the runner ${runner.path} changed since it was resolved (sha256 ${resolvedSha256} then, ${identity.sha256} now); it was not executed`,
        identity
      );
    }
  } else {
    const resolved = resolveAvailableSilverRunner(undefined, { trust: policy });
    if (!resolved.available || !resolved.runner || !resolved.identity) {
      return blocked(resolved.reasonCode ?? "RUNNER_NOT_FOUND", resolved.message ?? "SilverScript runner unavailable", resolved.identity);
    }
    runner = resolved.runner;
    identity = resolved.identity;
    try {
      // compared with the identity when the copy is written
      runnerBytes = fsSync.readFileSync(runner.path);
    } catch (e: any) {
      return blocked("RUNNER_NOT_FOUND", `${runner.path}: ${e?.code ?? e?.message}`, identity);
    }
  }
  if (identity.trust !== "VERIFIED" && policy !== "allow-unverified") {
    return blocked("RUNNER_UNVERIFIED", unverifiedRunnerMessage(identity), identity);
  }

  const k = loadManagedKaspaWasmSync();
  const { wasmTx, txId, activeInputIndex } = buildSilverVmScenarioTransaction({
    artifact: request.artifact,
    contractName,
    tx
  });

  const resolvedArgs: unknown[] = [];
  for (let i = 0; i < request.args.length; i++) {
    const arg = request.args[i]!;
    if (typeof arg === "object" && arg !== null && "signature" in arg) {
      if (!request.signer) {
        throw new Error(`SILVER_TEST_SIGNER_UNAVAILABLE: args[${i}] requests signature for '${arg.signature}' but no signer was provided`);
      }
      const privKeyHex = await request.signer(arg.signature);
      const rawSig = k.createInputSignature(wasmTx, activeInputIndex, new k.PrivateKey(privKeyHex), k.SighashType.All);
      const sigBytes = silverSigFromInputSignature(String(rawSig));
      resolvedArgs.push(`0x${Buffer.from(sigBytes).toString("hex")}`);
    } else if (typeof arg === "object" && arg !== null && "privateKeyHex" in arg) {
      const rawSig = k.createInputSignature(wasmTx, activeInputIndex, new k.PrivateKey(arg.privateKeyHex), k.SighashType.All);
      const sigBytes = silverSigFromInputSignature(String(rawSig));
      resolvedArgs.push(`0x${Buffer.from(sigBytes).toString("hex")}`);
    } else {
      resolvedArgs.push(silverRunnerValue(arg as SilArtifactValue, `args[${i}]`));
    }
  }

  const ctorArgsFormatted = request.constructorArgs.map((v, i) => silverRunnerValue(v, `constructorArgs[${i}]`));
  const testName = "hardkas_vm_case";

  const txJson = tx
    ? {
        version: tx.version ?? 1,
        lock_time: runnerU64(tx.lockTime ?? 0n, "lockTime"),
        active_input_index: activeInputIndex,
        inputs: tx.inputs.map((inp, idx) => ({
          ...(inp.prevTxId !== undefined ? { prev_txid: inp.prevTxId } : {}),
          ...(inp.prevIndex !== undefined ? { prev_index: inp.prevIndex } : {}),
          ...(inp.sequence !== undefined ? { sequence: runnerU64(inp.sequence, `inputs[${idx}].sequence`) } : {}),
          ...(inp.sigOpCount !== undefined ? { sig_op_count: inp.sigOpCount } : {}),
          utxo_value: runnerU64(inp.utxoValue, `inputs[${idx}].utxoValue`),
          ...(inp.covenantId !== undefined ? { covenant_id: inp.covenantId.startsWith("0x") ? inp.covenantId : `0x${inp.covenantId}` } : {}),
          ...(inp.state !== undefined ? { state: serializeStateForRunner(inp.state) } : {}),
          ...(inp.utxoScriptHex !== undefined ? { utxo_script_hex: inp.utxoScriptHex } : {}),
          ...(inp.signatureScriptHex !== undefined
            ? { signature_script_hex: cleanHex(inp.signatureScriptHex, `inputs[${idx}].signatureScriptHex`) }
            : {})
        })),
        outputs: tx.outputs.map((out, idx) => ({
          value: runnerU64(out.value, `outputs[${idx}].value`),
          ...(out.covenantId !== undefined ? { covenant_id: out.covenantId.startsWith("0x") ? out.covenantId : `0x${out.covenantId}` } : {}),
          ...(out.authorizingInput !== undefined ? { authorizing_input: out.authorizingInput } : {}),
          ...(out.state !== undefined ? { state: serializeStateForRunner(out.state) } : {}),
          ...(out.scriptHex !== undefined ? { script_hex: out.scriptHex } : {}),
          ...(out.p2pkPubkey !== undefined ? { p2pk_pubkey: out.p2pkPubkey } : {})
        }))
      }
    : undefined;

  const testFileContent = JSON.stringify(
    {
      tests: [
        {
          name: testName,
          function: request.entrypoint,
          constructor_args: ctorArgsFormatted,
          args: resolvedArgs,
          expect: "pass",
          ...(txJson ? { tx: txJson } : {})
        }
      ]
    },
    null,
    2
  );

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-covenant-vm-"));
  const sourcePath = path.join(tmpDir, "contract.sil");
  const testFilePath = path.join(tmpDir, "contract.test.json");
  const timeoutMs = request.timeoutMs ?? 30_000;
  let staged: StagedSilverRunner | undefined;

  try {
    await fs.writeFile(sourcePath, request.source, "utf8");
    await fs.writeFile(testFilePath, testFileContent, "utf8");

    // F2: the private copy of the identified bytes; it is checked again right before each start
    try {
      staged = stageSilverRunner(runner, identity.sha256, runnerBytes);
    } catch (e: any) {
      const outcome = e?.code === "SILVER_RUNNER_CHANGED" ? "RUNNER_UNVERIFIED" : e?.code === "SILVER_RUNNER_FAILED" ? "RUNNER_NOT_FOUND" : "RUNNER_START_FAILED";
      return { ...blocked(outcome, String(e?.message ?? e), identity), scenarioTxId: txId };
    }
    const startable = (): SilverVmExecutionResult | undefined => {
      try {
        staged!.verify();
        return undefined;
      } catch (e: any) {
        return { ...blocked("RUNNER_UNVERIFIED", String(e?.message ?? e), identity), scenarioTxId: txId };
      }
    };

    const runArgs = [
      ...staged.prefixArgs,
      "--run",
      `--test-file=${testFilePath}`,
      `--test-name=${testName}`,
      sourcePath
    ];
    // R-05: a run that did not complete, or whose output is not the runner's verdict, is a toolchain class (BLOCKED)
    let runRes: { exitCode: number | null; signal?: string | null; stdout: string; stderr: string };
    const changedBeforeRun = startable();
    if (changedBeforeRun) return changedBeforeRun;
    try {
      runRes = await runProcess(staged.command, runArgs, timeoutMs);
    } catch (e) {
      const failure = classifySilverRunnerFailure(e);
      return { ...blocked(failure.outcomeClass, failure.detail, identity), scenarioTxId: txId };
    }
    // R-01 (REMED-CLOSE): the runner never started (the kernel refused the copy, or it changed at the last check): BLOCKED
    const notStarted = runnerExecFailure(runRes);
    if (notStarted) {
      return { ...blocked(notStarted.code === "SILVER_RUNNER_CHANGED" ? "RUNNER_UNVERIFIED" : "RUNNER_START_FAILED", notStarted.detail, identity), scenarioTxId: txId };
    }
    const verdict = classifySilverRunnerRun(runRes);
    if (verdict.outcomeClass !== "SCRIPT_VM_PASS" && verdict.outcomeClass !== "SCRIPT_VM_REJECTED") {
      return {
        ...blocked(verdict.outcomeClass, verdict.detail, identity),
        exitCode: runRes.exitCode,
        stdout: runRes.stdout,
        stderr: runRes.stderr,
        scenarioTxId: txId
      };
    }
    const passed = verdict.outcomeClass === "SCRIPT_VM_PASS";

    let diagnostic: SilverVmFailureDiagnostic | undefined;
    if (!passed) {
      diagnostic = parseCliDebuggerFailureReport(
        runRes.stderr || runRes.stdout,
        request.source,
        request.sourceFile
      );
    }

    let trace: SilverVmTraceStep[] | undefined;
    let stackAtHalt: string[] | undefined;
    let variablesAtHalt: Record<string, string> | undefined;

    if (request.captureTrace && !runner.prefixArgs) {
      const stepsCount = Math.min(Math.max(request.maxTraceSteps ?? 16, 1), 64);
      const replCommands = Array.from({ length: stepsCount }, () => "vars\nstack\ns\n").join("") + "q\n";
      const replArgs = [
        // R-01 (REMED-CLOSE): the trace starts the same way as the run (through the exec trampoline on POSIX)
        ...staged.prefixArgs,
        `--test-file=${testFilePath}`,
        `--test-name=${testName}`,
        sourcePath
      ];
      // the trace is a second start: the same copy, checked again (a copy changed meanwhile blocks the whole result)
      const changedBeforeTrace = startable();
      if (changedBeforeTrace) return changedBeforeTrace;
      try {
        const replRes = await runProcess(staged.command, replArgs, timeoutMs, replCommands);
        const parsedTrace = parseCliDebuggerReplTrace(replRes.stdout);
        trace = parsedTrace.steps;
        stackAtHalt = parsedTrace.lastStack;
        variablesAtHalt = parsedTrace.lastVariables;
      } catch {
        // Non-fatal if REPL trace fails (e.g. pre-script covenant context error before session starts)
      }
    }

    return {
      evidenceLevel: "SCRIPT_VM",
      status: passed ? "SCRIPT_VM_PASS" : "SCRIPT_VM_FAIL",
      outcomeClass: verdict.outcomeClass,
      passed,
      contractName,
      entrypoint: request.entrypoint,
      exitCode: runRes.exitCode,
      stdout: runRes.stdout,
      stderr: runRes.stderr,
      ...(diagnostic ? { diagnostic } : {}),
      ...(trace ? { trace } : {}),
      ...(stackAtHalt ? { stackAtHalt } : {}),
      ...(variablesAtHalt ? { variablesAtHalt } : {}),
      runnerBinarySha256: identity.sha256,
      runnerIdentity: identity,
      scenarioTxId: txId
    };
  } finally {
    staged?.cleanup();
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }
}
