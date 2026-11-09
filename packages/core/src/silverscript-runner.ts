import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import fsSync from "node:fs";
import os from "node:os";
import path from "node:path";
import { loadManagedKaspaWasmSync } from "./kaspa-wasm.js";
import { SILVERSCRIPT_RELEASE, getHardkasHome } from "./toolchains.js";
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

/** ELF `e_machine` and class (1 = 32-bit, 2 = 64-bit) of each Node.js architecture HardKAS knows. */
const ELF_MACHINE: Readonly<Record<string, { machine: number; elfClass: 1 | 2 }>> = {
  x64: { machine: 0x3e, elfClass: 2 },
  arm64: { machine: 0xb7, elfClass: 2 },
  riscv64: { machine: 0xf3, elfClass: 2 },
  loong64: { machine: 0x102, elfClass: 2 },
  ppc64: { machine: 0x15, elfClass: 2 },
  s390x: { machine: 0x16, elfClass: 2 },
  ia32: { machine: 0x03, elfClass: 1 },
  arm: { machine: 0x28, elfClass: 1 }
};
/** Mach-O `cputype` of each Node.js architecture macOS runs. */
const MACHO_CPU: Readonly<Record<string, number>> = { x64: 0x01000007, arm64: 0x0100000c };

/** What `runnerStartProblem` may ask of the filesystem: whether a path is an executable file, and its first bytes. */
export interface RunnerStartProbe {
  readonly executable: (file: string) => boolean;
  readonly head: (file: string, bytes: number) => Uint8Array;
}

function nativeProblem(b: Uint8Array, platform: string, arch: string, endianness: "LE" | "BE"): string | undefined {
  const u16 = (o: number, le: boolean) => (le ? b[o]! | (b[o + 1]! << 8) : (b[o]! << 8) | b[o + 1]!);
  const u32 = (o: number, le: boolean) => (le ? (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16)) + b[o + 3]! * 0x1000000 : b[o]! * 0x1000000 + ((b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!));
  const isElf = b.length >= 4 && b[0] === 0x7f && b[1] === 0x45 && b[2] === 0x4c && b[3] === 0x46;
  const isMachO = b.length >= 4 && [[0xcf, 0xfa, 0xed, 0xfe], [0xce, 0xfa, 0xed, 0xfe], [0xfe, 0xed, 0xfa, 0xcf], [0xfe, 0xed, 0xfa, 0xce], [0xca, 0xfe, 0xba, 0xbe]].some((m) => m.every((x, i) => b[i] === x));
  if (platform === "darwin") {
    if (!isMachO) return "it is not a Mach-O executable for this Mac";
    const cpu = MACHO_CPU[arch];
    if (cpu === undefined) return `HardKAS does not know the Mach-O CPU type of architecture ${arch}`;
    if (b[0] === 0xca) {
      // universal binary (big-endian header): one of its slices must be this Mac's
      const n = b.length >= 8 ? u32(4, false) : 0;
      if (n < 1 || n > 20 || b.length < 8 + n * 20) return "it is not a complete universal Mach-O binary";
      for (let i = 0; i < n; i++) if (u32(8 + i * 20, false) === cpu) return undefined;
      return `its universal Mach-O binary has no slice for ${arch}`;
    }
    if (b[0] !== 0xcf) return "it is not a 64-bit little-endian Mach-O";
    if (b.length < 16 || u32(4, true) !== cpu || u32(12, true) !== 2) return `it is not a Mach-O executable (MH_EXECUTE) for ${arch}`;
    return undefined;
  }
  if (!isElf) return isMachO ? "it is a Mach-O binary, which this system does not start" : "it is not an ELF executable";
  const want = ELF_MACHINE[arch];
  if (!want) return `HardKAS does not know the ELF machine of architecture ${arch}`;
  if (b.length < 64) return "its ELF header is incomplete";
  if (b[4] !== want.elfClass) return `its ELF class is not this machine's (${want.elfClass === 2 ? "64" : "32"}-bit)`;
  const le = b[5] === 1;
  if ((le ? "LE" : b[5] === 2 ? "BE" : "?") !== endianness) return "its ELF byte order is not this machine's";
  if (b[6] !== 1) return "its ELF version is not 1";
  const type = u16(16, le);
  if (type !== 2 && type !== 3) return "it is not an ELF executable or position-independent executable (e_type)";
  if (u16(18, le) !== want.machine) return `its ELF machine (0x${u16(18, le).toString(16)}) is not ${arch}`;
  if (u32(20, le) !== 1) return "its ELF e_version is not 1";
  // program headers inside the file: a damaged or truncated image is what the kernel refuses with ENOEXEC
  const is64 = want.elfClass === 2;
  const phoff = is64 ? u32(32, le) + u32(36, le) * 0x100000000 : u32(28, le);
  const phentsize = u16(is64 ? 54 : 42, le);
  const phnum = u16(is64 ? 56 : 44, le);
  if (phnum < 1 || phentsize !== (is64 ? 56 : 32) || phoff + phnum * phentsize > b.length) return "its ELF program headers are missing or outside the file";
  return undefined;
}

/**
 * R-01 · why a runner file could not start as it is on this platform, or undefined when it can. A file the kernel cannot
 * load falls back to /bin/sh through the exec family (ENOEXEC), so on POSIX only these start: on Linux an ELF executable
 * for this machine (class, byte order, version, type, architecture, program headers inside the file); on macOS a Mach-O
 * executable for this Mac, or a universal binary with its slice; on both a script whose `#!` names an absolute,
 * executable interpreter that is itself such a native executable. Pure (the filesystem through `probe`), so every
 * platform's rules are testable anywhere. Windows starts only a PE image and has no such fallback.
 */
export function runnerStartProblem(bytes: Uint8Array, platform: string, arch: string, endianness: "LE" | "BE", probe: RunnerStartProbe): string | undefined {
  if (platform === "win32") return undefined;
  if (bytes.length >= 2 && bytes[0] === 0x23 && bytes[1] === 0x21) {
    let end = bytes.indexOf(0x0a);
    if (end < 0) end = bytes.length;
    if (end > 255) return "its #! line is longer than the kernel reads";
    const line = Buffer.from(bytes.subarray(2, end)).toString("latin1").replace(/\r$/, "").trim();
    const interpreter = line.split(/[ \t]+/)[0] ?? "";
    if (interpreter === "") return "its #! line names no interpreter";
    if (!interpreter.startsWith("/")) return `its #! interpreter '${interpreter}' is not an absolute path`;
    if (!probe.executable(interpreter)) return `its #! interpreter ${interpreter} is not an executable file here`;
    const inner = nativeProblem(probe.head(interpreter, 4096), platform, arch, endianness);
    return inner === undefined ? undefined : `its #! interpreter ${interpreter} would not start natively: ${inner}`;
  }
  return nativeProblem(bytes, platform, arch, endianness);
}

const realProbe: RunnerStartProbe = {
  executable: (file) => {
    try {
      fsSync.accessSync(file, fsSync.constants.X_OK);
      return fsSync.statSync(file).isFile();
    } catch {
      return false;
    }
  },
  head: (file, n) => {
    const fd = fsSync.openSync(file, "r");
    try {
      const buf = Buffer.alloc(n);
      return buf.subarray(0, fsSync.readSync(fd, buf, 0, n, 0));
    } finally {
      fsSync.closeSync(fd);
    }
  }
};

/**
 * R-01 · on POSIX the private copy is executable (0o700), so it must start only what the configured file could start as
 * it is: HardKAS never grants an execute permission the file does not have here (for this user, on this filesystem), and
 * refuses what the kernel would not load natively (runnerStartProblem), which the exec family would hand to /bin/sh.
 * Both are a runner that cannot start (SILVER_RUNNER_START_FAILED). These are the checks a file can be given before it
 * starts; an image that passes them and that the kernel still refuses never reaches /bin/sh either, because the copy is
 * started through process.execve (POSIX_EXEC_TRAMPOLINE, REMED-CLOSE), not through the exec family.
 */
function assertPosixStartable(file: string, bytes: Uint8Array): void {
  if (process.platform === "win32") return;
  try {
    fsSync.accessSync(file, fsSync.constants.X_OK);
  } catch {
    throw runnerError(
      "SILVER_RUNNER_START_FAILED",
      `${file} is not executable here (no execute permission for this user, or a filesystem mounted noexec): HardKAS does not grant an execute permission the runner file does not have; it was not executed`
    );
  }
  const problem = runnerStartProblem(bytes, process.platform, process.arch, os.endianness(), realProbe);
  if (problem !== undefined) {
    throw runnerError("SILVER_RUNNER_START_FAILED", `${file} would not start natively (${problem}): the exec family would hand it to /bin/sh; it was not executed`);
  }
}

/**
 * REMED-CLOSE · R-01 · on Linux and macOS the private copy is never started through the exec family (execvp and its
 * kin, which child_process uses): when the kernel refuses a file with ENOEXEC they hand it to /bin/sh, so a file that
 * passes every header check (assertPosixStartable) and that the kernel still refuses would run as a shell script. The
 * copy is started by this trampoline instead: Node.js runs it, it checks the copy's digest once more and that the copy
 * is executable here (a copy that lost its permission, or sits on a noexec mount, ends here without an abort), then
 * replaces itself with the copy through process.execve — execve(2) itself, with no shell fallback. If the kernel still
 * refuses the file, Node.js aborts with "process.execve failed with error code <errno>" (runnerExecFailure reads it):
 * nothing was executed, and nothing ran through /bin/sh. Where the system records crash reports, that abort leaves one
 * for node (WSL keeps a core dump of several hundred MB in %TEMP%\wsl-crashes): it happens only for a file that passed
 * every check and that the kernel refused.
 */
const POSIX_EXEC_TRAMPOLINE = [
  "const fs = require('fs');",
  "const { createHash } = require('crypto');",
  "const [file, sha, ...args] = process.argv.slice(1);",
  "if (typeof process.execve !== 'function') { process.stderr.write('HARDKAS_RUNNER_UNSTARTABLE: this Node.js has no process.execve (use Node.js 24.22.1)\\n'); process.exit(126); }",
  "let now;",
  "try { now = createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }",
  "catch (e) { process.stderr.write('HARDKAS_RUNNER_UNSTARTABLE: ' + file + ': ' + ((e && e.code) || e) + '\\n'); process.exit(126); }",
  "if (now !== sha) { process.stderr.write('HARDKAS_RUNNER_CHANGED: the private copy of the runner changed before it started (sha256 ' + sha + ' staged, ' + now + ' now); it was not executed\\n'); process.exit(125); }",
  "try { fs.accessSync(file, fs.constants.X_OK); }",
  "catch (e) { process.stderr.write('HARDKAS_RUNNER_UNSTARTABLE: ' + file + ' is not executable here (' + ((e && e.code) || e) + ': no execute permission, or a filesystem mounted noexec); it was not executed\\n'); process.exit(126); }",
  "process.execve(file, [file, ...args], process.env);"
].join("\n");

/** The exit statuses the trampoline itself ends with when the copy never started. */
export const RUNNER_TRAMPOLINE_EXIT = { unstartable: 126, changed: 125 } as const;

/**
 * REMED-CLOSE · R-01 · how a file with the given digest is started on Linux and macOS: Node.js running the exec trampoline.
 * stageSilverRunner starts its copy this way; the tests start files the header checks would refuse this way too, to show
 * that even then nothing runs through /bin/sh.
 */
export function posixRunnerStart(file: string, sha256: string): { command: string; prefixArgs: string[] } {
  return { command: process.execPath, prefixArgs: ["--no-warnings", "-e", POSIX_EXEC_TRAMPOLINE, "--", file, sha256] };
}

/**
 * REMED-CLOSE · R-01 · how a start through the trampoline ended without the runner ever running: the kernel refused the
 * copy (Node.js aborts after process.execve fails), the copy changed after the last check, or the trampoline could not
 * read it. Anything else is the runner's own result.
 */
export function runnerExecFailure(r: {
  readonly exitCode: number | null;
  readonly signal?: string | null | undefined;
  readonly stderr: string;
}): { code: "SILVER_RUNNER_START_FAILED" | "SILVER_RUNNER_CHANGED"; detail: string } | undefined {
  const refused = /process\.execve failed with error code ([A-Z0-9_]+)/.exec(r.stderr);
  if (refused && (r.signal === "SIGABRT" || r.exitCode === 134)) {
    return {
      code: "SILVER_RUNNER_START_FAILED",
      detail: `the kernel refused to start the runner (${refused[1]}): it was not executed, and nothing ran through /bin/sh`
    };
  }
  const changed = /^HARDKAS_RUNNER_CHANGED: (.*)$/m.exec(r.stderr);
  if (changed && r.exitCode === RUNNER_TRAMPOLINE_EXIT.changed) return { code: "SILVER_RUNNER_CHANGED", detail: changed[1]! };
  const unstartable = /^HARDKAS_RUNNER_UNSTARTABLE: (.*)$/m.exec(r.stderr);
  if (unstartable && r.exitCode === RUNNER_TRAMPOLINE_EXIT.unstartable) return { code: "SILVER_RUNNER_START_FAILED", detail: unstartable[1]! };
  return undefined;
}

/** A runner ready to start: the private copy of its identified bytes (or, for a stand-in, the program as configured). */
export interface StagedSilverRunner {
  /** What to start: on Linux and macOS, Node.js running the exec trampoline; elsewhere the copy itself. */
  readonly command: string;
  readonly prefixArgs: readonly string[];
  /** The file that runs: the private copy (the configured program, for a stand-in). */
  readonly file: string;
  /** The digest of the bytes that start. */
  readonly sha256: string;
  /** Throws SILVER_RUNNER_CHANGED if the copy no longer holds those bytes: called right before each start. */
  verify(): void;
  /** Removes the copy (best effort: never throws, retries while Windows still holds the file after the process exits). */
  cleanup(): void;
}

/**
 * F2 (H-B2, H-B3) · what starts is the bytes HardKAS identified. A runner is started from a private copy written from one
 * read of its file (`data`, when the caller already read it for the identity), never from its configured path: on
 * Windows Node starts `<path>.exe` for a path without an extension, and that path can be replaced between the identity
 * check and the start. The copy must hold the identified digest, is checked again right before each start and lives for
 * one run, in a new directory under HARDKAS_HOME/run/silver-runners (not the system TEMP, which can be mounted noexec).
 * Limit (R-08): a process of the same user that can write there can still swap the copy between that last check and the
 * start — verify() reads the whole copy and hashes it, so the window is tens of milliseconds, and Node.js has no atomic
 * check-and-start — and on Windows it could place a DLL next to the copy, which the runner would load first.
 * A stand-in runner (`prefixArgs`: a program driven through another, never VERIFIED) starts as configured.
 * R-01 · on POSIX the copy starts only what the configured file could start as it is (assertPosixStartable), and it is
 * started through the exec trampoline (POSIX_EXEC_TRAMPOLINE): a file the kernel refuses never runs through /bin/sh.
 */
export function stageSilverRunner(runner: SilverRunner, expectedSha256: string, data?: Uint8Array): StagedSilverRunner {
  if (runner.prefixArgs && runner.prefixArgs.length > 0) {
    return { command: runner.path, prefixArgs: [...runner.prefixArgs], file: runner.path, sha256: expectedSha256, verify: () => {}, cleanup: () => {} };
  }
  let bytes: Uint8Array;
  try {
    bytes = data ?? fsSync.readFileSync(runner.path);
  } catch (e: any) {
    throw runnerError("SILVER_RUNNER_FAILED", `${runner.path}: ${e?.code ?? e?.message}`);
  }
  const sha256 = sha256Hex(bytes);
  if (sha256 !== expectedSha256) {
    throw runnerError(
      "SILVER_RUNNER_CHANGED",
      `${runner.path} is not the runner that was identified (sha256 ${expectedSha256} then, ${sha256} now); it was not executed`
    );
  }
  assertPosixStartable(runner.path, bytes);
  const root = path.join(getHardkasHome(), "run", "silver-runners");
  let dir: string;
  try {
    fsSync.mkdirSync(root, { recursive: true });
    dir = fsSync.mkdtempSync(path.join(root, "runner-"));
  } catch (e: any) {
    throw runnerError("SILVER_RUNNER_START_FAILED", `the private copy of the runner cannot be made under ${root}: ${e?.code ?? e?.message}`);
  }
  const command = path.join(dir, process.platform === "win32" ? "cli-debugger.exe" : "cli-debugger");
  try {
    fsSync.writeFileSync(command, bytes, { mode: 0o700, flag: "wx" });
  } catch (e: any) {
    fsSync.rmSync(dir, { recursive: true, force: true });
    throw runnerError("SILVER_RUNNER_START_FAILED", `the private copy of the runner cannot be written: ${e?.code ?? e?.message}`);
  }
  // R-01 (REMED-CLOSE): on POSIX the copy starts through the exec trampoline (no /bin/sh fallback); Windows has none.
  // A copy HARDKAS_HOME cannot execute (a filesystem mounted noexec) is refused here, not left to the kernel at the start.
  const posix = process.platform !== "win32";
  if (posix) {
    try {
      fsSync.accessSync(command, fsSync.constants.X_OK);
    } catch (e: any) {
      fsSync.rmSync(dir, { recursive: true, force: true });
      throw runnerError(
        "SILVER_RUNNER_START_FAILED",
        `the private copy of the runner under ${root} is not executable (${e?.code ?? e?.message}; a filesystem mounted noexec?): set HARDKAS_HOME to a directory on a filesystem that allows execution; it was not executed`
      );
    }
  }
  const start = posix ? posixRunnerStart(command, sha256) : { command, prefixArgs: [] };
  return {
    command: start.command,
    prefixArgs: start.prefixArgs,
    file: command,
    sha256,
    verify: () => {
      const now = sha256Hex(fsSync.readFileSync(command));
      if (now !== sha256) {
        throw runnerError("SILVER_RUNNER_CHANGED", `the private copy of the runner changed before it started (sha256 ${sha256} staged, ${now} now); it was not executed`);
      }
    },
    cleanup: () => {
      try {
        fsSync.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      } catch {
        // a copy left behind holds the identified bytes and is never started again
      }
    }
  };
}

// ---------------------------------------------------------------------------
// Values as the runner reads them (debugger-session args.rs)
// ---------------------------------------------------------------------------

const RUNNER_I64_MIN = -(1n << 63n);
const RUNNER_I64_MAX = (1n << 63n) - 1n;

/** An exact JSON integer (JSON.rawJSON): a JS number would round an i64, and a string is not a JSON number. */
function jsonInteger(n: bigint, where: string): unknown {
  if (n < RUNNER_I64_MIN || n > RUNNER_I64_MAX) throw runnerError("SILVER_TEST_VALUE_UNREPRESENTABLE", `${where}: ${n} is outside the runner's i64`);
  // JSON.rawJSON (JSON.parse source text access) is in Node.js since 21; TypeScript's lib does not declare it yet
  const rawJSON = (JSON as unknown as { rawJSON?: (text: string) => unknown }).rawJSON;
  if (typeof rawJSON !== "function") throw runnerError("SILVER_TEST_VALUE_UNREPRESENTABLE", `${where}: this Node.js cannot write an exact JSON integer (JSON.rawJSON)`);
  return rawJSON(n.toString());
}

/**
 * A value in the runner's test-file form. A top-level argument is a raw string the runner parses by its type: ints as
 * decimal strings (i64 does not fit a JS number), byte strings and bytes as 0x hex, bools as true/false. Inside an
 * array or a struct the runner reads JSON (debugger-session args.rs `parse_artifact_json_value`): there an int is an
 * exact JSON integer and a byte a JSON number (a string is refused: "expected int"), byte strings stay 0x hex.
 */
export function silverRunnerValue(v: SilArtifactValue, where = "value", nested = false): unknown {
  switch (v?.kind) {
    case "int":
      return nested ? jsonInteger(BigInt(v.value), where) : BigInt(v.value).toString();
    case "bool":
      return v.value ? "true" : "false";
    case "byte":
      return nested ? Number(v.value) : `0x${Number(v.value).toString(16).padStart(2, "0")}`;
    case "bytes":
      return `0x${Buffer.from(Array.from(v.value as ArrayLike<number>)).toString("hex")}`;
    case "text":
      // The runner trims a top-level argument and reads one starting with '[' or '{', or "null", as JSON.
      if (!nested && (v.value !== v.value.trim() || /^[[{]/.test(v.value) || v.value === "null")) {
        throw runnerError("SILVER_TEST_VALUE_UNREPRESENTABLE", `${where}: the runner cannot receive the text ${JSON.stringify(v.value)} unchanged`);
      }
      return v.value;
    case "array":
      return v.value.map((x, i) => silverRunnerValue(x, `${where}[${i}]`, true));
    case "object":
      return Object.fromEntries(Object.keys(v.value).sort().map((k) => [k, silverRunnerValue(v.value[k]!, `${where}.${k}`, true)]));
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

const RUNNER_U64_MAX = (1n << 64n) - 1n;
const PLAIN_INTEGER = /^-?(?:0|[1-9][0-9]*)$/;
const isRawJson = (v: unknown): v is { readonly rawJSON: string } =>
  (JSON as unknown as { isRawJSON?: (x: unknown) => boolean }).isRawJSON?.(v) === true;

/** The integer an exact test-file number holds (a safe JS number, a bigint, or a JSON.rawJSON integer). */
function exactIntegerOf(v: unknown): bigint {
  return isRawJson(v) ? BigInt(v.rawJSON) : BigInt(v as number | bigint | string);
}

/**
 * Every number of a test file reaches the runner exactly (it reads u64 and i64 values). SC-09: an integer beyond 2^53 is
 * written exactly: a JSON.rawJSON integer (how `hardkas silver test` reads the file) or a bigint (a programmatic caller),
 * between i64::MIN and u64::MAX, becomes an exact JSON integer of the runner file. A JS number that is not a safe integer
 * already lost its digits and is refused, as is any other exact literal (a fraction, an exponent, out of range). Returns
 * the test with bigints turned into exact JSON integers; everything else is kept as given.
 */
function exactNumbers(where: string, v: unknown): unknown {
  const unsafe = (shown: string): never => {
    throw runnerError(
      "SILVER_TEST_NUMBER_UNSAFE",
      `${where}: ${shown} is not an exact integer between i64::MIN and u64::MAX; the runner would not receive this value`
    );
  };
  if (typeof v === "number") return Number.isSafeInteger(v) ? v : unsafe(String(v));
  if (typeof v === "bigint" || isRawJson(v)) {
    const text = typeof v === "bigint" ? v.toString() : v.rawJSON;
    if (!PLAIN_INTEGER.test(text)) return unsafe(text);
    const n = BigInt(text);
    if (n < RUNNER_I64_MIN || n > RUNNER_U64_MAX) return unsafe(text);
    return typeof v === "bigint" ? jsonInteger64(n) : v;
  }
  if (Array.isArray(v)) return v.map((x, i) => exactNumbers(`${where}[${i}]`, x));
  if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, exactNumbers(`${where}.${k}`, x)]));
  return v;
}

/** An exact JSON integer (JSON.rawJSON) in the runner's i64..u64 range. */
function jsonInteger64(n: bigint): unknown {
  const rawJSON = (JSON as unknown as { rawJSON?: (text: string) => unknown }).rawJSON;
  if (typeof rawJSON !== "function") throw runnerError("SILVER_TEST_VALUE_UNREPRESENTABLE", `${n}: this Node.js cannot write an exact JSON integer (JSON.rawJSON)`);
  return rawJSON(n.toString());
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
  return exactNumbers(where, t) as Record<string, any>;
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
      sequence: exactIntegerOf(input.sequence ?? 0),
      sigOpCount: input.sig_op_count ?? 100,
      utxo: { outpoint, amount: exactIntegerOf(input.utxo_value), scriptPublicKey: new k.ScriptPublicKey(0, spk), blockDaaScore: 0n, isCoinbase: false }
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
    return { value: exactIntegerOf(output.value), scriptPublicKey: new k.ScriptPublicKey(0, script) };
  });
  return new k.Transaction({
    version: scenario.version ?? 1,
    inputs,
    outputs,
    lockTime: exactIntegerOf(scenario.lock_time ?? 0),
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

function execRunner(
  command: string,
  prefixArgs: readonly string[],
  args: readonly string[],
  timeoutMs: number
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command,
      [...prefixArgs, ...args],
      { windowsHide: true, timeout: timeoutMs, maxBuffer: 16 * 1024 * 1024, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (!error) return resolve({ exitCode: 0, stdout, stderr });
        // A non-zero exit carries its status in `code`; a process that could not start carries an errno string.
        const e: any = error;
        // R-01 (REMED-CLOSE): the trampoline's own ending (the runner never started) is never read as a timeout or a verdict
        const notStarted = runnerExecFailure({ exitCode: typeof e.code === "number" ? e.code : null, signal: e.signal ?? null, stderr: String(stderr ?? "") });
        if (notStarted) return reject(runnerError(notStarted.code, notStarted.detail));
        if (e.killed || e.signal) return reject(runnerError("SILVER_RUNNER_TIMEOUT", `the runner did not finish within ${timeoutMs} ms`));
        if (typeof e.code === "number") return resolve({ exitCode: e.code, stdout, stderr });
        reject(runnerError("SILVER_RUNNER_FAILED", `${command}: ${e.code ?? e.message}`));
      }
    );
  });
}

const RUNNER_PASS = new Set(["PASS", "PASS (expected failure)"]);

/**
 * F3 (H-B4) · a test run read as the runner's `--run` protocol (kaspanet/silverscript cli-debugger v1.0.0,
 * debugger/cli/src/main.rs): exit 0 with `PASS` or `PASS (expected failure)` passes; a failed test is exit 1 ending in
 * `Error: "FAIL"` after the runner's own report (`error: …` for a failed run, `FAIL: expected failure but bytecode
 * passed` for an expectation it missed). Anything else is not a verdict on the contract, the same rule as R-05.
 */
function testRunVerdict(r: { exitCode: number; stdout: string; stderr: string }): { outcome: "PASS" | "FAIL"; status: string | null } | { code: string; detail: string } {
  const lines = (s: string) => s.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (r.exitCode === 0) {
    const status = lines(r.stdout).find((l) => RUNNER_PASS.has(l)) ?? null;
    return status === null ? { code: "SILVER_RUNNER_OUTPUT_UNRECOGNIZED", detail: "the runner exited 0 without a PASS line" } : { outcome: "PASS", status };
  }
  const err = lines(r.stderr);
  const last = err[err.length - 1] ?? "";
  if (r.exitCode === 101 || /\bpanicked at\b/.test(`${r.stdout}\n${r.stderr}`)) {
    return { code: "SILVER_RUNNER_INTERNAL_ERROR", detail: `the runner panicked (exit ${r.exitCode})` };
  }
  if (r.exitCode === 1 && last === 'Error: "FAIL"' && err.some((l) => /^error:/.test(l) || l === "FAIL: expected failure but bytecode passed")) {
    return { outcome: "FAIL", status: null };
  }
  if (/^Error:/.test(last) && last !== 'Error: "FAIL"') {
    return { code: "SILVER_RUNNER_INTERNAL_ERROR", detail: `the runner failed with its own error, not a verdict: ${last.slice(0, 200)}` };
  }
  return { code: "SILVER_RUNNER_PROTOCOL_ERROR", detail: `exit ${r.exitCode} without the runner's report and FAIL verdict: not a verdict` };
}

/**
 * Runs every prepared test in its own runner process (`--run --test-name`), in order, from a private copy of the
 * identified runner (F2: the copy must hold `runner.binarySha256` and is checked again before each start). The verdict
 * is the runner's (`testRunVerdict`); anything else — no verdict, a timeout, a runner that does not start or changed —
 * is an error, never a verdict.
 */
export async function runSilverVmTests(run: SilverVmTestRun): Promise<SilverVmTestResult[]> {
  const timeoutMs = run.timeoutMs ?? 60_000;
  let staged: StagedSilverRunner | undefined;
  let work: string | undefined;
  try {
    staged = stageSilverRunner(run.runner, run.runner.binarySha256);
    work = await fs.mkdtemp(path.join(os.tmpdir(), "hardkas-silver-vm-"));
    const sourcePath = path.join(work, "contract.sil");
    const testPath = path.join(work, "contract.test.json");
    await fs.writeFile(sourcePath, typeof run.source === "string" ? Buffer.from(run.source, "utf8") : Buffer.from(run.source));
    await fs.writeFile(testPath, run.prepared.runnerTestFile, "utf8");
    const results: SilverVmTestResult[] = [];
    for (const c of run.prepared.cases) {
      staged.verify();
      // `--name=value`: a test name starting with '-' must not read as a flag.
      const r = await execRunner(staged.command, staged.prefixArgs, ["--run", `--test-file=${testPath}`, `--test-name=${c.name}`, sourcePath], timeoutMs);
      const verdict = testRunVerdict(r);
      if ("code" in verdict) throw runnerError(verdict.code, `${c.name}: ${verdict.detail}`);
      results.push({ ...c, outcome: verdict.outcome, runnerStatus: verdict.status, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr });
    }
    return results;
  } finally {
    staged?.cleanup();
    if (work) await fs.rm(work, { recursive: true, force: true }).catch(() => {});
  }
}
