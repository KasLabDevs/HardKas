import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadManagedKaspaWasmSync } from "./kaspa-wasm.js";
import { SILVERSCRIPT_RELEASE } from "./toolchains.js";
import { getSilContract, silContractBytecodeHex, type SilAbiArtifact, type SilArtifactValue } from "./silverscript.js";
import { silverP2shLock, silverSigFromInputSignature } from "./silverscript-abi.js";

/**
 * SilverScript contract tests on the official SilverScript runner
 * (`cli-debugger` of kaspanet/silverscript), which executes the Kaspa script
 * engine against a synthetic scenario transaction.
 *
 * Experimental: upstream releases no runner binary, so HardKAS cannot pin one
 * the way it pins silverc. The runner is a local build of the pinned
 * SilverScript release, named by `HARDKAS_SILVER_RUNNER`; HardKAS digests it
 * and never installs or builds it.
 *
 * What a runner verdict covers: the runner's own compilation of the source
 * with the given constructor arguments and its own encoding of the entry
 * arguments, run through the script engine in that scenario. It never executes
 * an input's signature script and makes no P2SH check, so HardKAS never hands
 * it an unlock script: how HardKAS spends a contract is validated by the node.
 * A verdict is contract execution, not transaction validity and not consensus
 * evidence.
 *
 * HardKAS's part: the contract under test is a compile record's (its exact
 * source and constructor arguments); a `sig` argument may name a local account
 * and is signed over the scenario transaction the runner builds; each test runs
 * in its own runner process and its verdict is that process's exit status.
 *
 * The signing rebuilds that transaction the way the pinned release's runner
 * does. A runner that builds it differently makes every signature invalid:
 * positive signed tests then fail, but negative ones pass for the wrong reason,
 * so negative signed tests prove something only next to a positive one.
 */

function runnerError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

const sha256Hex = (data: Uint8Array | string) => createHash("sha256").update(data).digest("hex");

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

export const SILVER_RUNNER_ENV = "HARDKAS_SILVER_RUNNER";

/** What a runner has to be built from: the `cli-debugger` of the pinned SilverScript release. */
export const SILVER_RUNNER_SOURCE = {
  repository: SILVERSCRIPT_RELEASE.repository,
  releaseTag: SILVERSCRIPT_RELEASE.releaseTag,
  commit: SILVERSCRIPT_RELEASE.commit,
  package: "cli-debugger"
} as const;

export interface SilverRunner {
  /** Absolute path of the runner binary. */
  readonly path: string;
  readonly binarySha256: string;
  readonly size: number;
  /** No release binary exists: HardKAS can digest this build, not verify what it was built from. */
  readonly provenance: "unmanaged-local-build";
  /** Arguments placed before the runner's own, so tests can drive a stand-in runner through node. */
  readonly prefixArgs?: readonly string[] | undefined;
}

const BUILD_HINT =
  `Build it from ${SILVER_RUNNER_SOURCE.repository} ${SILVER_RUNNER_SOURCE.releaseTag} ` +
  `(cargo build --release -p ${SILVER_RUNNER_SOURCE.package}) and set ${SILVER_RUNNER_ENV} to the binary. ` +
  "No release binary exists yet: the runner is experimental and optional.";

/**
 * The runner named explicitly or by `HARDKAS_SILVER_RUNNER`, digested.
 * Fails closed: never a runner from PATH.
 */
export function resolveSilverRunner(explicitPath?: string): SilverRunner {
  const configured = explicitPath ?? process.env[SILVER_RUNNER_ENV];
  if (!configured || configured.trim() === "") {
    throw runnerError("SILVER_RUNNER_NOT_CONFIGURED", `no SilverScript runner configured. ${BUILD_HINT}`);
  }
  const file = path.resolve(configured);
  let data: Buffer;
  try {
    if (!fsSync.statSync(file).isFile()) throw Object.assign(new Error("not a file"), { code: "ENOTFILE" });
    data = fsSync.readFileSync(file);
  } catch (e: any) {
    throw runnerError("SILVER_RUNNER_NOT_FOUND", `${file}: ${e?.code ?? e?.message}. ${BUILD_HINT}`);
  }
  return { path: file, binarySha256: sha256Hex(data), size: data.length, provenance: "unmanaged-local-build" };
}

// ---------------------------------------------------------------------------
// Values as the runner reads them (debugger-session args.rs)
// ---------------------------------------------------------------------------

/**
 * A constructor argument in the runner's test-file form: ints as decimal
 * strings (i64 does not fit a JS number), byte strings as 0x hex, bools as
 * true/false, arrays and structs as JSON of the same.
 */
export function silverRunnerValue(v: SilArtifactValue, where = "value"): unknown {
  switch (v?.kind) {
    case "int":
      return BigInt(v.value).toString();
    case "bool":
      return v.value ? "true" : "false";
    case "byte":
      return `0x${Number(v.value).toString(16).padStart(2, "0")}`;
    case "bytes":
      return `0x${Buffer.from(Array.from(v.value as ArrayLike<number>)).toString("hex")}`;
    case "text":
      // The runner trims an argument and reads one starting with '[' or '{', or "null", as JSON.
      if (v.value !== v.value.trim() || /^[[{]/.test(v.value) || v.value === "null") {
        throw runnerError("SILVER_TEST_VALUE_UNREPRESENTABLE", `${where}: the runner cannot receive the text ${JSON.stringify(v.value)} unchanged`);
      }
      return v.value;
    case "array":
      return v.value.map((x, i) => silverRunnerValue(x, `${where}[${i}]`));
    case "object":
      return Object.fromEntries(Object.keys(v.value).sort().map((k) => [k, silverRunnerValue(v.value[k]!, `${where}.${k}`)]));
    default:
      throw runnerError("SILVER_TEST_VALUE_UNREPRESENTABLE", `${where}: unknown value kind '${(v as any)?.kind}'`);
  }
}

// ---------------------------------------------------------------------------
// Test file
// ---------------------------------------------------------------------------

// The runner's test-file fields (debugger-session test_runner.rs). The runner
// ignores unknown fields, so a misspelt one would silently weaken a test:
// HardKAS rejects them instead.
const FILE_KEYS = ["tests"];
const TEST_KEYS = ["name", "function", "constructor_args", "args", "expect", "tx"];
const TX_KEYS = ["version", "lock_time", "active_input_index", "inputs", "outputs"];
const INPUT_KEYS = ["prev_txid", "prev_index", "sequence", "sig_op_count", "utxo_value", "covenant_id", "constructor_args", "state", "signature_script_hex", "utxo_script_hex"];
const OUTPUT_KEYS = ["value", "covenant_id", "authorizing_input", "constructor_args", "state", "script_hex", "p2pk_pubkey"];

export interface SilverVmTestCase {
  readonly name: string;
  readonly function: string;
  readonly expect: "pass" | "fail";
  /** Positions of the arguments HardKAS signed for a local account. */
  readonly signedArgs: readonly number[];
}

export interface PreparedSilverVmTests {
  readonly contract: string;
  /**
   * The test file handed to the runner, exactly. It carries constructor
   * arguments and signatures: record its digest, never its content.
   */
  readonly runnerTestFile: string;
  readonly cases: readonly SilverVmTestCase[];
}

export interface SilverVmTestRequest {
  readonly artifact: SilAbiArtifact;
  /** Needed only when the artifact holds more than one contract. */
  readonly contractName?: string | undefined;
  /** The constructor arguments the artifact was compiled with. */
  readonly constructorArgs: readonly SilArtifactValue[];
  /** The parsed test file, in the runner's `.test.json` form. */
  readonly tests: unknown;
  /** The private key (hex) of a local account, for `{"signature": "<account>"}` arguments. */
  readonly signer?: ((account: string) => string | Promise<string>) | undefined;
}

function invalidFile(where: string, what: string): never {
  throw runnerError("SILVER_TEST_FILE_INVALID", `${where}: ${what}`);
}

function onlyKeys(where: string, o: Record<string, unknown>, allowed: readonly string[]): void {
  for (const k of Object.keys(o)) if (!allowed.includes(k)) invalidFile(where, `unknown field '${k}' (the runner would ignore it)`);
}

/** Every JSON number must survive JSON.parse exactly: the runner reads u64 and i64 values. */
function checkNumbers(where: string, v: unknown): void {
  if (typeof v === "number") {
    if (!Number.isSafeInteger(v)) {
      throw runnerError("SILVER_TEST_NUMBER_UNSAFE", `${where}: ${v} is not an exact integer; the runner would not receive this value (large amounts must stay below 2^53)`);
    }
  } else if (Array.isArray(v)) {
    v.forEach((x, i) => checkNumbers(`${where}[${i}]`, x));
  } else if (isObject(v)) {
    for (const [k, x] of Object.entries(v)) checkNumbers(`${where}.${k}`, x);
  }
}

function isSignatureSlot(v: unknown): v is { signature: string } {
  return isObject(v) && Object.keys(v).length === 1 && typeof v.signature === "string";
}

function checkTest(where: string, t: unknown, names: Set<string>): Record<string, any> {
  if (!isObject(t)) invalidFile(where, "not an object");
  onlyKeys(where, t, TEST_KEYS);
  if (typeof t.name !== "string" || t.name === "") invalidFile(where, "name is not a non-empty string");
  if (names.has(t.name)) invalidFile(where, `name '${t.name}' is used by another test`);
  names.add(t.name);
  if (typeof t.function !== "string" || t.function === "") invalidFile(where, "function is not a non-empty string");
  if (t.expect !== "pass" && t.expect !== "fail") invalidFile(where, "expect must be \"pass\" or \"fail\"");
  if (t.constructor_args !== undefined) {
    throw runnerError(
      "SILVER_TEST_CONSTRUCTOR_ARGS_FORBIDDEN",
      `${where}: the contract under test is the compile record's; its constructor arguments come from the record, not the test file`
    );
  }
  if (t.args !== undefined && !Array.isArray(t.args)) invalidFile(where, "args is not a list");
  if (t.tx !== undefined) {
    if (!isObject(t.tx)) invalidFile(`${where}.tx`, "not an object");
    onlyKeys(`${where}.tx`, t.tx, TX_KEYS);
    if (!Array.isArray(t.tx.inputs) || t.tx.inputs.length === 0) invalidFile(`${where}.tx`, "inputs is not a non-empty list");
    if (!Array.isArray(t.tx.outputs)) invalidFile(`${where}.tx`, "outputs is not a list");
    t.tx.inputs.forEach((input: unknown, i: number) => {
      const w = `${where}.tx.inputs[${i}]`;
      if (!isObject(input)) invalidFile(w, "not an object");
      onlyKeys(w, input, INPUT_KEYS);
      if (input.utxo_value === undefined) invalidFile(w, "utxo_value is required");
      if (input.signature_script_hex !== undefined) {
        throw runnerError(
          "SILVER_TEST_UNLOCK_NOT_EXECUTED",
          `${w}: the runner never executes an input's signature script (it runs its own encoding of the arguments), so HardKAS does not pass one`
        );
      }
    });
    t.tx.outputs.forEach((output: unknown, i: number) => {
      const w = `${where}.tx.outputs[${i}]`;
      if (!isObject(output)) invalidFile(w, "not an object");
      onlyKeys(w, output, OUTPUT_KEYS);
      if (output.value === undefined) invalidFile(w, "value is required");
    });
    const active = t.tx.active_input_index ?? 0;
    if (typeof active !== "number" || !Number.isInteger(active) || active < 0 || active >= t.tx.inputs.length) {
      invalidFile(`${where}.tx`, `active_input_index ${active} is not an input`);
    }
  }
  checkNumbers(where, t);
  return t;
}

function hexOf(where: string, raw: unknown, exactBytes?: number): string {
  if (typeof raw !== "string") return invalidFile(where, "not a hex string");
  const hex = raw.trim().replace(/^0x/i, "").toLowerCase();
  if (!/^(?:[0-9a-f]{2})*$/.test(hex)) invalidFile(where, "not an even-length hex string");
  if (exactBytes !== undefined && hex.length !== exactBytes * 2) invalidFile(where, `expected ${exactBytes} bytes`);
  return hex;
}

/**
 * The transaction the runner builds for a scenario (debugger/cli main.rs):
 * prev txid [input index; 32] unless given, UTXO at DAA score 0 locked to the
 * contract's P2SH unless `utxo_script_hex`, outputs by `script_hex` or a P2PK
 * of `p2pk_pubkey` or else the contract's P2SH, native subnetwork, no gas, no
 * payload. Without a `tx`, the runner's default scenario. Covenant scenarios
 * are refused: HardKAS does not reproduce the runner's state materialization.
 */
function scenarioTransaction(k: any, where: string, tx: Record<string, any> | undefined, lockHex: string): any {
  const scenario = tx ?? { version: 1, inputs: [{ utxo_value: 5000 }], outputs: [{ value: 5000 }] };
  const unsupported = (w: string, field: string): never => {
    throw runnerError(
      "SILVER_TEST_SIGNATURE_UNSUPPORTED",
      `${w}: HardKAS signs only plain P2SH scenarios; '${field}' needs the runner's covenant or state materialization, which HardKAS does not reproduce`
    );
  };
  const inputs = scenario.inputs.map((input: Record<string, any>, index: number) => {
    const w = `${where}.tx.inputs[${index}]`;
    if (input.covenant_id !== undefined) unsupported(w, "covenant_id");
    if (input.state !== undefined) unsupported(w, "state");
    if (input.constructor_args !== undefined && input.utxo_script_hex === undefined) unsupported(w, "constructor_args");
    const outpoint = {
      transactionId: input.prev_txid !== undefined ? hexOf(`${w}.prev_txid`, input.prev_txid, 32) : (index & 0xff).toString(16).padStart(2, "0").repeat(32),
      index: input.prev_index ?? 0
    };
    const spk = input.utxo_script_hex !== undefined ? hexOf(`${w}.utxo_script_hex`, input.utxo_script_hex) : lockHex;
    return {
      previousOutpoint: outpoint,
      signatureScript: "",
      sequence: BigInt(input.sequence ?? 0),
      sigOpCount: input.sig_op_count ?? 100,
      utxo: { outpoint, amount: BigInt(input.utxo_value), scriptPublicKey: new k.ScriptPublicKey(0, spk), blockDaaScore: 0n, isCoinbase: false }
    };
  });
  const outputs = scenario.outputs.map((output: Record<string, any>, index: number) => {
    const w = `${where}.tx.outputs[${index}]`;
    if (output.covenant_id !== undefined) unsupported(w, "covenant_id");
    if (output.authorizing_input !== undefined) unsupported(w, "authorizing_input");
    if (output.state !== undefined) unsupported(w, "state");
    let script: string;
    if (output.script_hex !== undefined) script = hexOf(`${w}.script_hex`, output.script_hex);
    else if (output.p2pk_pubkey !== undefined) {
      script = String(new k.ScriptBuilder().addData(hexOf(`${w}.p2pk_pubkey`, output.p2pk_pubkey)).addOp(k.Opcodes.OpCheckSig).drain());
    } else if (output.constructor_args !== undefined) return unsupported(w, "constructor_args");
    else script = lockHex;
    return { value: BigInt(output.value), scriptPublicKey: new k.ScriptPublicKey(0, script) };
  });
  return new k.Transaction({
    version: scenario.version ?? 1,
    inputs,
    outputs,
    lockTime: BigInt(scenario.lock_time ?? 0),
    subnetworkId: "00".repeat(20),
    gas: 0n,
    payload: ""
  });
}

/**
 * Turns a runner test file into the one the runner receives: the compile
 * record's constructor arguments on every test, and each
 * `{"signature": "<account>"}` argument (allowed where the entry takes a
 * `sig`) replaced by that account's signature over the test's scenario.
 */
export async function prepareSilverVmTests(request: SilverVmTestRequest): Promise<PreparedSilverVmTests> {
  const contractNames = Object.keys(request.artifact.contracts);
  if (contractNames.length !== 1) {
    // The runner compiles the source itself and tests the one contract it declares.
    throw runnerError("SILVER_TEST_CONTRACT_AMBIGUOUS", `the runner tests single-contract sources; this artifact has ${contractNames.join(", ")}`);
  }
  const { name: contractName, contract } = getSilContract(request.artifact, request.contractName);
  const file = request.tests;
  if (!isObject(file)) invalidFile("test file", "not a JSON object");
  onlyKeys("test file", file, FILE_KEYS);
  if (!Array.isArray(file.tests) || file.tests.length === 0) invalidFile("test file", "tests is not a non-empty list");

  const constructorArgs = request.constructorArgs.map((v, i) => silverRunnerValue(v, `constructor_args[${i}]`));
  const lockHex = silverP2shLock(silContractBytecodeHex(contract)).script.toLowerCase();
  const names = new Set<string>();
  const tests: Record<string, unknown>[] = [];
  const cases: SilverVmTestCase[] = [];

  for (let i = 0; i < file.tests.length; i++) {
    const where = `tests[${i}]`;
    const t = checkTest(where, file.tests[i], names);
    const args: unknown[] = [...(t.args ?? [])];
    const slots = args.flatMap((a, j) => (isSignatureSlot(a) ? [j] : []));
    if (slots.length > 0) {
      const entry = contract.entries[t.function];
      if (!entry) {
        throw runnerError(
          "SILVER_TEST_SIGNATURE_UNSUPPORTED",
          `${where}: '${t.function}' is not an entry of ${contractName}; HardKAS signs arguments of plain entries only`
        );
      }
      for (const j of slots) {
        const kind = entry.params[j]?.type.kind;
        if (kind !== "sig") {
          throw runnerError("SILVER_TEST_SIGNATURE_SLOT_INVALID", `${where}.args[${j}]: ${t.function} takes ${kind ?? "no argument"} there, not a sig`);
        }
      }
      if (!request.signer) throw runnerError("SILVER_TEST_SIGNER_UNAVAILABLE", `${where}: signature arguments need local accounts`);
      const k = loadManagedKaspaWasmSync();
      const transaction = scenarioTransaction(k, where, t.tx, lockHex);
      const active = t.tx?.active_input_index ?? 0;
      for (const j of slots) {
        const account = (args[j] as { signature: string }).signature;
        const keyHex = await request.signer(account);
        let privateKey: any;
        try {
          privateKey = new k.PrivateKey(keyHex);
        } catch {
          // Never echo the SDK's message: it may quote the key.
          throw runnerError("SILVER_TEST_SIGNER_FAILED", `${where}.args[${j}]: account '${account}' did not yield a usable private key`);
        }
        const inputSignature = String(k.createInputSignature(transaction, active, privateKey, k.SighashType.All));
        args[j] = `0x${Buffer.from(silverSigFromInputSignature(inputSignature)).toString("hex")}`;
      }
    }
    tests.push({ ...t, constructor_args: constructorArgs, args });
    cases.push({ name: t.name, function: t.function, expect: t.expect, signedArgs: slots });
  }

  return { contract: contractName, runnerTestFile: `${JSON.stringify({ tests }, null, 2)}\n`, cases };
}

// ---------------------------------------------------------------------------
// Execution
// ---------------------------------------------------------------------------

export interface SilverVmTestResult extends SilverVmTestCase {
  readonly outcome: "PASS" | "FAIL";
  /** The runner's status line on success: "PASS" or "PASS (expected failure)". */
  readonly runnerStatus: string | null;
  readonly exitCode: number;
  /** The runner's output. It can print argument and constructor values: show it, never record it. */
  readonly stdout: string;
  readonly stderr: string;
}

export interface SilverVmTestRun {
  readonly runner: SilverRunner;
  /** The exact source the compile record identifies. */
  readonly source: string | Uint8Array;
  readonly prepared: PreparedSilverVmTests;
  /** Per test (default 60 s). */
  readonly timeoutMs?: number | undefined;
}

function execRunner(runner: SilverRunner, args: readonly string[], timeoutMs: number): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      runner.path,
      [...(runner.prefixArgs ?? []), ...args],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (!error) return resolve({ exitCode: 0, stdout, stderr });
        // A non-zero exit carries its status in `code`; a process that could not start carries an errno string.
        const e: any = error;
        if (e.killed || e.signal) return reject(runnerError("SILVER_RUNNER_TIMEOUT", `the runner did not finish within ${timeoutMs} ms`));
        if (typeof e.code === "number") return resolve({ exitCode: e.code, stdout, stderr });
        reject(runnerError("SILVER_RUNNER_FAILED", `${runner.path}: ${e.code ?? e.message}`));
      }
    );
  });
}

const RUNNER_PASS = new Set(["PASS", "PASS (expected failure)"]);

/**
 * Runs every prepared test in its own runner process (`--run --test-name`),
 * in order. The verdict is the runner's: exit 0 with its PASS line, or FAIL.
 * Anything else — no PASS line on exit 0, a timeout, a runner that does not
 * start — is an error, never a verdict.
 */
export async function runSilverVmTests(run: SilverVmTestRun): Promise<SilverVmTestResult[]> {
  const timeoutMs = run.timeoutMs ?? 60_000;
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-silver-vm-"));
  try {
    const sourcePath = path.join(work, "contract.sil");
    const testPath = path.join(work, "contract.test.json");
    await fs.writeFile(sourcePath, typeof run.source === "string" ? Buffer.from(run.source, "utf8") : Buffer.from(run.source));
    await fs.writeFile(testPath, run.prepared.runnerTestFile, "utf8");
    const results: SilverVmTestResult[] = [];
    for (const c of run.prepared.cases) {
      // `--name=value`: a test name starting with '-' must not read as a flag.
      const r = await execRunner(run.runner, ["--run", `--test-file=${testPath}`, `--test-name=${c.name}`, sourcePath], timeoutMs);
      const status = r.stdout.split(/\r?\n/).map((l) => l.trim()).find((l) => RUNNER_PASS.has(l)) ?? null;
      if (r.exitCode === 0 && status === null) {
        throw runnerError("SILVER_RUNNER_OUTPUT_UNRECOGNIZED", `${c.name}: the runner exited 0 without a PASS line`);
      }
      results.push({ ...c, outcome: r.exitCode === 0 ? "PASS" : "FAIL", runnerStatus: r.exitCode === 0 ? status : null, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr });
    }
    return results;
  } finally {
    await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
