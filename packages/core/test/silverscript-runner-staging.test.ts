import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import {
  RUNNER_TRAMPOLINE_EXIT,
  posixRunnerStart,
  runnerExecFailure,
  runnerStartProblem,
  stageSilverRunner,
  type RunnerStartProbe,
  type SilverRunner
} from "../src/index.js";
import { LINUX_LE, elfHeader, elfOneByteInterpSegment, elfOverProgramHeaderLimit, programHeader, shellLines } from "./helpers/runner-images.js";

// -----------------------------------------------------------------------------
// F2 (H-B2, H-B3) · a runner is started from a private copy of the bytes HardKAS identified, never from its configured
// path: on Windows Node starts `<path>.exe` for a path without an extension, and the configured file can be replaced
// between the identity check and the start. The copy is written from one read, checked again before each start and
// removed afterwards. A stand-in runner (driven through another program) is never VERIFIED and is not staged. On POSIX
// (R-01) the configured file must be startable as it is. Canonical level: no SilverScript runner is executed; the
// REMED-CLOSE starts below run only this file's own scripts and crafted images, in its temporary directory.
// -----------------------------------------------------------------------------

const sha256 = (b: Uint8Array | string) => createHash("sha256").update(b).digest("hex");
let temp = "";
let home = "";
const savedHome = process.env.HARDKAS_HOME;
beforeAll(() => {
  temp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-stage-"));
  home = path.join(temp, "home");
  fs.mkdirSync(home);
  process.env.HARDKAS_HOME = home;
});
afterAll(() => {
  if (savedHome === undefined) delete process.env.HARDKAS_HOME;
  else process.env.HARDKAS_HOME = savedHome;
  fs.rmSync(temp, { recursive: true, force: true });
});

const POSIX = process.platform !== "win32";
// R-01: on POSIX a runner file starts only as it is, executable and either native or with an interpreter line, so the
// fixture runners of S1-S6 are executable scripts there; on Windows they stay plain files.
const fileRunner = (name: string, body: string): SilverRunner => {
  const p = path.join(temp, name);
  const bytes = POSIX ? `#!/bin/sh\n${body}` : body;
  fs.writeFileSync(p, bytes);
  if (POSIX) fs.chmodSync(p, 0o755);
  return { path: p, binarySha256: sha256(bytes), size: Buffer.byteLength(bytes), provenance: "unmanaged-local-build" };
};
const rawRunner = (name: string, bytes: Buffer, mode: number): SilverRunner => {
  const p = path.join(temp, name);
  fs.writeFileSync(p, bytes);
  fs.chmodSync(p, mode);
  return { path: p, binarySha256: sha256(bytes), size: bytes.length, provenance: "unmanaged-local-build" };
};
const stagedDirs = () => {
  const root = path.join(home, "run", "silver-runners");
  return fs.existsSync(root) ? fs.readdirSync(root) : [];
};

describe("F2 · stageSilverRunner", () => {
  it("S1 a private copy of the identified bytes under HARDKAS_HOME (named .exe on Windows); removed by cleanup", () => {
    const r = fileRunner("cli-debugger", "runner bytes v1");
    const staged = stageSilverRunner(r, r.binarySha256);
    try {
      expect(staged.file).not.toBe(r.path);
      expect(path.resolve(staged.file).startsWith(path.resolve(home, "run", "silver-runners"))).toBe(true);
      if (process.platform === "win32") expect(staged.file.toLowerCase().endsWith(".exe")).toBe(true);
      expect(sha256(fs.readFileSync(staged.file))).toBe(r.binarySha256);
      expect(staged.sha256).toBe(r.binarySha256);
      // R-01 (REMED-CLOSE): POSIX starts the copy through the exec trampoline (Node.js, process.execve); Windows starts it
      if (POSIX) {
        expect(staged.command).toBe(process.execPath);
        expect(staged.prefixArgs.slice(-3)).toEqual(["--", staged.file, r.binarySha256]);
      } else {
        expect(staged.command).toBe(staged.file);
        expect(staged.prefixArgs).toEqual([]);
      }
      staged.verify();
    } finally {
      staged.cleanup();
    }
    expect(fs.existsSync(staged.file)).toBe(false);
  });

  it("S2 a file that no longer has the identified bytes is refused (SILVER_RUNNER_CHANGED); nothing is staged", () => {
    const r = fileRunner("cli-debugger-changed.exe", "the bytes now");
    const before = stagedDirs().length;
    expect(() => stageSilverRunner(r, sha256("the bytes identified"))).toThrow(/^SILVER_RUNNER_CHANGED: /);
    expect(stagedDirs().length).toBe(before);
  });

  it("S3 the copy is checked again before each start: a changed copy is refused (SILVER_RUNNER_CHANGED)", () => {
    const r = fileRunner("cli-debugger-v3.exe", "runner bytes v3");
    const staged = stageSilverRunner(r, r.binarySha256);
    try {
      fs.writeFileSync(staged.file, "substituted after staging");
      expect(() => staged.verify()).toThrow(/^SILVER_RUNNER_CHANGED: /);
    } finally {
      staged.cleanup();
    }
  });

  it("S4 the bytes read for the identity are the bytes staged: replacing the file after that read changes nothing", () => {
    const r = fileRunner("cli-debugger-v4.exe", "runner bytes v4");
    const data = fs.readFileSync(r.path);
    fs.writeFileSync(r.path, "substituted after the identity was read");
    const staged = stageSilverRunner(r, sha256(data), data);
    try {
      expect(sha256(fs.readFileSync(staged.file))).toBe(sha256(data));
    } finally {
      staged.cleanup();
    }
  });

  it("S5 a stand-in (a program driven through another) is not staged: it is never VERIFIED", () => {
    const r: SilverRunner = { path: process.execPath, prefixArgs: ["stand-in.mjs"], binarySha256: "0".repeat(64), size: 1, provenance: "unmanaged-local-build" };
    const staged = stageSilverRunner(r, r.binarySha256);
    expect(staged.command).toBe(process.execPath);
    expect(staged.prefixArgs).toEqual(["stand-in.mjs"]);
  });

  it("S6 a runner file that cannot be read: SILVER_RUNNER_FAILED", () => {
    const missing: SilverRunner = { path: path.join(temp, "no-such-runner.exe"), binarySha256: "0".repeat(64), size: 1, provenance: "unmanaged-local-build" };
    expect(() => stageSilverRunner(missing, missing.binarySha256)).toThrow(/^SILVER_RUNNER_FAILED: /);
  });
});

// R-01 / R2-01 · what each platform starts natively, checked by the pure classifier on every platform (Windows included):
// the cases the second review reproduced on Linux (D, E, F, G, H, I, K) are refused; real executables are not.
const elf = (o: { cls?: number; data?: number; type?: number; machine?: number; phoff?: number; phnum?: number; len?: number } = {}) => {
  const b = Buffer.alloc(120);
  b.set([0x7f, 0x45, 0x4c, 0x46], 0);
  b[4] = o.cls ?? 2;
  b[5] = o.data ?? 1;
  b[6] = 1;
  b.writeUInt16LE(o.type ?? 2, 16);
  b.writeUInt16LE(o.machine ?? 0x3e, 18);
  b.writeUInt32LE(1, 20);
  b.writeUInt32LE(o.phoff ?? 64, 32);
  b.writeUInt16LE(56, 54);
  b.writeUInt16LE(o.phnum ?? 1, 56);
  return b.subarray(0, o.len ?? 120);
};
const machO = (cpu: number) => {
  const b = Buffer.alloc(32);
  b.set([0xcf, 0xfa, 0xed, 0xfe], 0);
  b.writeUInt32LE(cpu, 4);
  b.writeUInt32LE(2, 12);
  return b;
};
const fat = (cpus: number[]) => {
  const b = Buffer.alloc(8 + cpus.length * 20);
  b.set([0xca, 0xfe, 0xba, 0xbe], 0);
  b.writeUInt32BE(cpus.length, 4);
  cpus.forEach((c, i) => b.writeUInt32BE(c, 8 + i * 20));
  return b;
};
const probe = (files: Record<string, Buffer>): RunnerStartProbe => ({
  executable: (f) => f in files,
  head: (f, n) => files[f]!.subarray(0, n)
});
const NONE = probe({});
const linux = (b: Buffer, p: RunnerStartProbe = NONE) => runnerStartProblem(b, "linux", "x64", "LE", p);

describe("R-01 · runnerStartProblem: what the platform would start natively (pure; every platform)", () => {
  it("Linux x64: an ELF executable for this machine starts; a PIE (ET_DYN) too", () => {
    expect(linux(elf())).toBeUndefined();
    expect(linux(elf({ type: 3 }))).toBeUndefined();
  });

  it("Linux: the second review's cases D, E, F, H and K are refused (bad ELF, Mach-O, universal, other machines)", () => {
    expect(linux(Buffer.from("\x7fELF\necho pwned; exit 42\n", "latin1"))).toMatch(/ELF/); // D
    expect(linux(machO(0x01000007))).toMatch(/Mach-O/); // E
    expect(linux(fat([0x01000007]))).toMatch(/Mach-O/); // F
    expect(linux(elf({ machine: 0xb7 }))).toMatch(/machine/); // H aarch64
    expect(linux(elf({ machine: 0x32 }))).toMatch(/machine/); // K IA-64
  });

  it("Linux: a damaged ELF is refused (class, byte order, type, program headers outside the file)", () => {
    expect(linux(elf({ cls: 1 }))).toMatch(/class/);
    expect(linux(elf({ data: 2 }))).toMatch(/byte order/);
    expect(linux(elf({ type: 1 }))).toMatch(/e_type/);
    expect(linux(elf({ phoff: 4000 }))).toMatch(/program headers/);
    expect(linux(elf({ phnum: 0 }))).toMatch(/program headers/);
    expect(linux(elf({ len: 40 }))).toMatch(/incomplete/);
  });

  it("scripts: G (no interpreter), a relative or missing interpreter and I (an interpreter that is text) are refused; a native one starts", () => {
    expect(linux(Buffer.from("#!\necho pwned\n"))).toMatch(/names no interpreter/); // G
    expect(linux(Buffer.from("#!   \t\n"))).toMatch(/names no interpreter/);
    expect(linux(Buffer.from("#!sh\n"))).toMatch(/absolute/);
    expect(linux(Buffer.from("#!/no/such/shell\n"))).toMatch(/not an executable file/);
    expect(linux(Buffer.from("#!/opt/text-interp\n"), probe({ "/opt/text-interp": Buffer.from("echo pwned\n") }))).toMatch(/would not start natively/); // I
    expect(linux(Buffer.from(`#!/opt/${"x".repeat(300)}\n`))).toMatch(/longer than the kernel reads/);
    expect(linux(Buffer.from("#!/bin/sh -e\necho ran\n"), probe({ "/bin/sh": elf() }))).toBeUndefined(); // C
  });

  it("macOS: a Mach-O for this Mac or a universal binary with its slice starts; ELF, other CPUs and a Java class do not", () => {
    const mac = (b: Buffer) => runnerStartProblem(b, "darwin", "arm64", "LE", NONE);
    expect(mac(machO(0x0100000c))).toBeUndefined();
    expect(mac(fat([0x01000007, 0x0100000c]))).toBeUndefined();
    expect(mac(fat([0x01000007]))).toMatch(/no slice/);
    expect(mac(machO(0x01000007))).toMatch(/MH_EXECUTE|for arm64/);
    expect(mac(elf())).toMatch(/not a Mach-O/);
    const javaClass = Buffer.from([0xca, 0xfe, 0xba, 0xbe, 0x00, 0x00, 0x00, 0x41]);
    expect(mac(javaClass)).toMatch(/universal/);
  });

  it("Windows starts only PE images and has no shell fallback: nothing to refuse here", () => {
    expect(runnerStartProblem(Buffer.from("anything"), "win32", "x64", "LE", NONE)).toBeUndefined();
  });
});

// R-01 · POSIX: the private copy never grants an execute permission the configured file does not have, and a file the
// kernel would not load natively never falls through to /bin/sh.
describe.runIf(POSIX)("R-01 · stageSilverRunner on POSIX starts only what the file can start as it is", () => {
  it("S7 a runner file without the execute permission is refused (SILVER_RUNNER_START_FAILED); nothing is staged", () => {
    const r = rawRunner("not-executable", Buffer.from("#!/bin/sh\necho ran\n"), 0o644);
    const before = stagedDirs().length;
    expect(() => stageSilverRunner(r, r.binarySha256)).toThrow(/^SILVER_RUNNER_START_FAILED: .*not executable/);
    expect(stagedDirs().length).toBe(before);
  });

  it("S8 an executable file that is neither native nor an interpreter script is refused (it would run through /bin/sh)", () => {
    const r = rawRunner("text-runner", Buffer.from("not an executable\n"), 0o755);
    const before = stagedDirs().length;
    expect(() => stageSilverRunner(r, r.binarySha256)).toThrow(/^SILVER_RUNNER_START_FAILED: .*\/bin\/sh/);
    expect(stagedDirs().length).toBe(before);
  });

  it("S9 an executable script with an interpreter line is staged; the copy is executable by its owner only", () => {
    const r = rawRunner("script-runner", Buffer.from("#!/bin/sh\necho ran\n"), 0o755);
    const staged = stageSilverRunner(r, r.binarySha256);
    try {
      expect(fs.statSync(staged.file).mode & 0o777).toBe(0o700);
      expect(sha256(fs.readFileSync(staged.file))).toBe(r.binarySha256);
    } finally {
      staged.cleanup();
    }
  });

  it("S11 an executable that only looks like ELF (D: `\\x7fELF` then shell text) is refused; nothing is staged", () => {
    const r = rawRunner("fake-elf", Buffer.from("\x7fELF\necho pwned; exit 42\n", "latin1"), 0o755);
    const before = stagedDirs().length;
    expect(() => stageSilverRunner(r, r.binarySha256)).toThrow(/^SILVER_RUNNER_START_FAILED: .*would not start natively/);
    expect(stagedDirs().length).toBe(before);
  });

  it("S12 a script whose #! interpreter is a text file (I) is refused; nothing is staged", () => {
    const interp = rawRunner("text-interpreter", Buffer.from("echo pwned; exit 46\n"), 0o755);
    const r = rawRunner("script-via-text", Buffer.from(`#!${interp.path}\necho ran\n`), 0o755);
    const before = stagedDirs().length;
    expect(() => stageSilverRunner(r, r.binarySha256)).toThrow(/^SILVER_RUNNER_START_FAILED: .*interpreter/);
    expect(stagedDirs().length).toBe(before);
  });

  it("S10 a native executable (the system's `true`) is staged with its bytes", () => {
    const bytes = fs.readFileSync(fs.existsSync("/bin/true") ? "/bin/true" : "/usr/bin/true");
    const r = rawRunner("native-runner", bytes, 0o755);
    const staged = stageSilverRunner(r, r.binarySha256, bytes);
    try {
      expect(sha256(fs.readFileSync(staged.file))).toBe(r.binarySha256);
    } finally {
      staged.cleanup();
    }
  });
});

// -----------------------------------------------------------------------------
// REMED-CLOSE · R-01 · the residual case of the second review: a file that passes every header check and that the kernel
// still refuses. The exec family (child_process.execFile, spawn) hands such a file to /bin/sh on ENOEXEC; HardKAS starts
// the private copy through process.execve instead (POSIX_EXEC_TRAMPOLINE), which has no shell fallback. Each bad file's
// body would create a marker file if a shell ever interpreted it; the controls show the old start did exactly that.
// -----------------------------------------------------------------------------

describe("REMED-CLOSE · runnerExecFailure: how a trampoline start ended without the runner (pure; every platform)", () => {
  it("an abort after process.execve failed is START_FAILED; the copy changed at the last check is CHANGED; the runner's own output is neither", () => {
    const aborted = "node:internal/process/per_thread:326\n    _execve(execPath, args, envArray);\n    ^\n\nprocess.execve failed with error code ENOEXEC\n";
    expect(runnerExecFailure({ exitCode: null, signal: "SIGABRT", stderr: aborted })).toEqual({
      code: "SILVER_RUNNER_START_FAILED",
      detail: expect.stringMatching(/kernel refused to start the runner \(ENOEXEC\).*nothing ran through \/bin\/sh/)
    });
    expect(runnerExecFailure({ exitCode: 134, stderr: "process.execve failed with error code EACCES" })?.code).toBe("SILVER_RUNNER_START_FAILED");
    expect(runnerExecFailure({ exitCode: 1, signal: null, stderr: aborted })).toBeUndefined();
    expect(runnerExecFailure({ exitCode: RUNNER_TRAMPOLINE_EXIT.changed, stderr: "HARDKAS_RUNNER_CHANGED: the private copy changed\n" })?.code).toBe("SILVER_RUNNER_CHANGED");
    expect(runnerExecFailure({ exitCode: 1, stderr: "HARDKAS_RUNNER_CHANGED: x\n" })).toBeUndefined();
    expect(runnerExecFailure({ exitCode: RUNNER_TRAMPOLINE_EXIT.unstartable, stderr: "HARDKAS_RUNNER_UNSTARTABLE: /x: ENOENT\n" })?.code).toBe("SILVER_RUNNER_START_FAILED");
    expect(runnerExecFailure({ exitCode: 1, stderr: 'error: script failed\nError: "FAIL"\n' })).toBeUndefined();
    expect(runnerExecFailure({ exitCode: 0, stderr: "" })).toBeUndefined();
  });
});

type Started = { exitCode: number | null; signal: string | null; stdout: string; stderr: string };
const started = (resolve: (s: Started) => void) => (err: any, stdout: unknown, stderr: unknown) =>
  resolve({ exitCode: err ? (typeof err.code === "number" ? err.code : null) : 0, signal: err?.signal ?? null, stdout: String(stdout), stderr: String(stderr) });
/**
 * Starts a staged runner exactly as HardKAS's run sites do: `command` with `prefixArgs`, then the runner's own args. Every
 * start in this file runs in its temporary directory: a shell that interprets an ELF header can redirect into a file
 * named by the header's bytes, which must never land in the worker's working directory (the repository root).
 */
const startStaged = (staged: { readonly command: string; readonly prefixArgs: readonly string[] }, args: string[] = []): Promise<Started> =>
  new Promise((resolve) => {
    execFile(staged.command, [...staged.prefixArgs, ...args], { cwd: temp, timeout: 30_000 }, started(resolve));
  });
/** A file started through the trampoline as stageSilverRunner starts its copy, here without the header checks before it. */
const startThroughTrampoline = (file: string): Promise<Started> => startStaged(posixRunnerStart(file, sha256(fs.readFileSync(file))));
/** The old start, through the exec family: the control that shows the hazard the trampoline removes. */
const startThroughExecFamily = (file: string): Promise<Started> =>
  new Promise((resolve) => {
    execFile(file, [], { cwd: temp, timeout: 30_000 }, started(resolve));
  });
const marker = (name: string) => path.join(temp, `pwned-${name}`);
/**
 * A start the kernel refuses ends in a Node.js abort. Where the system records a crash report of it (core_pattern piped
 * to a helper: WSL's wsl-capture-crash, apport, systemd-coredump) that alone took 3.4 to 5.4 s per abort on the Linux
 * REMED-CLOSE ran on, so the tests that abort have room for it.
 */
const ABORTING = 60_000;

describe.runIf(LINUX_LE)("REMED-CLOSE · R-01 · Linux starts the copy through execve: a file the kernel refuses never runs through /bin/sh", () => {
  it("S13 ELF images that pass every header check and that the kernel refuses (too many program headers; a 1-byte PT_INTERP): START_FAILED, not executed; control: the exec family ran each through /bin/sh", async () => {
    const images: Array<[string, (markerFile: string) => Buffer]> = [
      ["s13-phnum", elfOverProgramHeaderLimit],
      ["s13-interp-segment", elfOneByteInterpSegment]
    ];
    for (const [name, build] of images) {
      const r = rawRunner(name, build(marker(name)), 0o755);
      expect(runnerStartProblem(fs.readFileSync(r.path), "linux", process.arch, "LE", { executable: () => true, head: () => Buffer.alloc(0) }), name).toBeUndefined();
      const staged = stageSilverRunner(r, r.binarySha256);
      try {
        const s = await startStaged(staged);
        expect(runnerExecFailure(s), `${name}: ${s.stderr.slice(0, 400)}`).toEqual({ code: "SILVER_RUNNER_START_FAILED", detail: expect.stringMatching(/ENOEXEC/) });
        expect(fs.existsSync(marker(name)), `${name}: a shell interpreted the file`).toBe(false);
      } finally {
        staged.cleanup();
      }
      // control: the same bytes started through the exec family run as a shell script (exit 42, the marker written)
      const control = await startThroughExecFamily(r.path);
      expect([control.exitCode, fs.existsSync(marker(name))], `${name}: control`).toEqual([42, true]);
    }
  }, 2 * ABORTING);

  it("S14 wrong interpreter: a script whose #! interpreter is an ELF the kernel refuses passes the checks: START_FAILED, not executed; control: the exec family ran the script through /bin/sh", async () => {
    const interp = rawRunner("refused-interp", elfOneByteInterpSegment(marker("s14-interp")), 0o755);
    const r = rawRunner("script-via-refused-interp", Buffer.from(`#!${interp.path}\ntouch ${marker("s14")}\nexit 47\n`), 0o755);
    const staged = stageSilverRunner(r, r.binarySha256);
    try {
      const s = await startStaged(staged);
      expect(runnerExecFailure(s), s.stderr.slice(0, 400)).toEqual({ code: "SILVER_RUNNER_START_FAILED", detail: expect.stringMatching(/kernel refused to start the runner \(ENOEXEC\)/) });
      expect([fs.existsSync(marker("s14")), fs.existsSync(marker("s14-interp"))], "a shell interpreted the script or its interpreter").toEqual([false, false]);
    } finally {
      staged.cleanup();
    }
    const control = await startThroughExecFamily(r.path);
    expect([control.exitCode, fs.existsSync(marker("s14"))]).toEqual([47, true]);
  }, ABORTING);

  it("S14b wrong interpreter: one whose program headers lie beyond the 4096 bytes the check reads is refused before staging; nothing is staged", () => {
    const interp = rawRunner("refused-interp-large", elfOverProgramHeaderLimit(marker("s14b-interp")), 0o755);
    const r = rawRunner("script-via-large-interp", Buffer.from(`#!${interp.path}\ntouch ${marker("s14b")}\nexit 47\n`), 0o755);
    const before = stagedDirs().length;
    expect(() => stageSilverRunner(r, r.binarySha256)).toThrow(/^SILVER_RUNNER_START_FAILED: .*its #! interpreter .* would not start natively/);
    expect(stagedDirs().length).toBe(before);
  });

  it("S14c wrong interpreter line: a #! line longer than the 256 bytes Linux reads (its interpreter a real executable) is refused before staging; started through the trampoline anyway, the kernel refuses it and nothing runs; control: the exec family ran it through /bin/sh", async () => {
    let dir = temp;
    for (const c of ["a", "b", "c"]) dir = path.join(dir, c.repeat(100));
    fs.mkdirSync(dir, { recursive: true });
    const longInterp = path.join(dir, "true");
    fs.copyFileSync(fs.existsSync("/bin/true") ? "/bin/true" : "/usr/bin/true", longInterp);
    fs.chmodSync(longInterp, 0o755);
    expect(`#!${longInterp}`.length).toBeGreaterThan(256);
    const r = rawRunner("script-long-shebang", Buffer.from(`#!${longInterp}\ntouch ${marker("s14c")}\nexit 42\n`), 0o755);
    const before = stagedDirs().length;
    expect(() => stageSilverRunner(r, r.binarySha256)).toThrow(/^SILVER_RUNNER_START_FAILED: .*its #! line is longer than the kernel reads/);
    expect(stagedDirs().length).toBe(before);
    const s = await startThroughTrampoline(r.path);
    expect(runnerExecFailure(s), s.stderr.slice(0, 400)).toEqual({ code: "SILVER_RUNNER_START_FAILED", detail: expect.stringMatching(/ENOEXEC/) });
    expect(fs.existsSync(marker("s14c")), "a shell interpreted the script").toBe(false);
    const control = await startThroughExecFamily(r.path);
    expect([control.exitCode, fs.existsSync(marker("s14c"))]).toEqual([42, true]);
  }, ABORTING);

  it("S16 noexec: HARDKAS_HOME on a noexec mount is refused when the copy is made; a copy on one started anyway is refused (EACCES); a runner file on one is refused before staging; nothing runs", async (ctx) => {
    const noexec = noexecDir();
    if (!noexec) {
      ctx.skip(); // reported as skipped: this machine offers no writable noexec mount (set HARDKAS_TEST_NOEXEC_DIR)
      return;
    }
    const bytes = Buffer.from(`#!/bin/sh\ntouch ${marker("s16")}\nexit 42\n`);
    const configured = rawRunner("script-for-noexec", bytes, 0o755);
    const area = fs.mkdtempSync(path.join(noexec, "hk-noexec-"));
    try {
      // HARDKAS_HOME on the noexec mount: the copy is refused when it is made (synchronous: restored before anything else runs)
      const saved = process.env.HARDKAS_HOME;
      process.env.HARDKAS_HOME = area;
      try {
        expect(() => stageSilverRunner(configured, configured.binarySha256)).toThrow(/^SILVER_RUNNER_START_FAILED: the private copy of the runner under .* is not executable/);
      } finally {
        if (saved === undefined) delete process.env.HARDKAS_HOME;
        else process.env.HARDKAS_HOME = saved;
      }
      expect(fs.readdirSync(path.join(area, "run", "silver-runners")), "no copy is left behind").toEqual([]);
      // a copy on the noexec mount, started the way the trampoline starts the private copy
      const onNoexec = path.join(area, "cli-debugger");
      fs.writeFileSync(onNoexec, bytes, { mode: 0o755 });
      const s = await startThroughTrampoline(onNoexec);
      expect(runnerExecFailure(s), s.stderr.slice(0, 400)).toEqual({ code: "SILVER_RUNNER_START_FAILED", detail: expect.stringMatching(/EACCES/) });
      expect(fs.existsSync(marker("s16")), "the script ran").toBe(false);
      // a configured runner file on the noexec mount: refused before staging
      const r: SilverRunner = { path: onNoexec, binarySha256: sha256(bytes), size: bytes.length, provenance: "unmanaged-local-build" };
      expect(() => stageSilverRunner(r, r.binarySha256, bytes)).toThrow(/^SILVER_RUNNER_START_FAILED: .*noexec/);
    } finally {
      fs.rmSync(area, { recursive: true, force: true });
    }
  }, ABORTING);

  it("S19 damaged and invalid images (a cut header, a short program header table, none, another machine, Mach-O): refused before staging; started through the trampoline anyway, the kernel refuses each and nothing runs; control: the exec family ran each through /bin/sh", async () => {
    const damaged: Array<[string, (markerFile: string) => Buffer]> = [
      ["header-cut", (m) => Buffer.concat([elfHeader().subarray(0, 24), shellLines(m)])],
      [
        "phdr-table-short",
        (m) => {
          const lines = shellLines(m);
          return Buffer.concat([elfHeader({ phoff: 64 + lines.length, phnum: 4 }), lines, programHeader(1, 0, 0)]);
        }
      ],
      ["phnum-0", (m) => Buffer.concat([elfHeader({ phnum: 0 }), shellLines(m)])],
      // IA-64: a machine no system here runs through binfmt_misc (QEMU has no IA-64 user mode)
      ["machine-ia64", (m) => Buffer.concat([elfHeader({ machine: 50 }), programHeader(1, 0, 0), shellLines(m)])],
      [
        "mach-o",
        (m) => {
          const h = Buffer.alloc(32);
          h.writeUInt32LE(0xfeedfacf, 0);
          h.writeUInt32LE(0x01000007, 4);
          h.writeUInt32LE(2, 12);
          return Buffer.concat([h, shellLines(m)]);
        }
      ]
    ];
    for (const [what, build] of damaged) {
      const name = `s19-${what}`;
      const r = rawRunner(name, build(marker(name)), 0o755);
      expect(() => stageSilverRunner(r, r.binarySha256), what).toThrow(/^SILVER_RUNNER_START_FAILED: .*would not start natively/);
      const s = await startThroughTrampoline(r.path);
      expect(runnerExecFailure(s), `${what}: ${s.stderr.slice(0, 300)}`).toEqual({ code: "SILVER_RUNNER_START_FAILED", detail: expect.stringMatching(/ENOEXEC/) });
      expect(fs.existsSync(marker(name)), `${what}: a shell interpreted it`).toBe(false);
      const control = await startThroughExecFamily(r.path);
      expect([control.exitCode, fs.existsSync(marker(name))], `${what}: control`).toEqual([42, true]);
    }
  }, 5 * ABORTING);
});

describe.runIf(POSIX)("REMED-CLOSE · R-01 · POSIX trampoline: the digest is checked once more at the start, and a good runner runs as before", () => {
  it("S15 a copy swapped after the parent's last check is refused by the trampoline (CHANGED); neither content runs", async () => {
    const r = rawRunner("swap-target", Buffer.from(`#!/bin/sh\ntouch ${marker("s15-original")}\n`), 0o755);
    const staged = stageSilverRunner(r, r.binarySha256);
    try {
      fs.writeFileSync(staged.file, `#!/bin/sh\ntouch ${marker("s15-swapped")}\n`);
      const started = await startStaged(staged);
      expect(runnerExecFailure(started), started.stderr.slice(0, 400)).toEqual({ code: "SILVER_RUNNER_CHANGED", detail: expect.stringMatching(/changed before it started/) });
      expect([fs.existsSync(marker("s15-original")), fs.existsSync(marker("s15-swapped"))]).toEqual([false, false]);
    } finally {
      staged.cleanup();
    }
  });

  it("S17 a good runner started through the trampoline gets its arguments, stdin and exit status as before", async () => {
    const r = rawRunner("good-script", Buffer.from('#!/bin/sh\nread line\necho "args=$1,$2 stdin=$line"\nexit 3\n'), 0o755);
    const staged = stageSilverRunner(r, r.binarySha256);
    try {
      const out = await new Promise<Started>((resolve) => {
        const child = execFile(staged.command, [...staged.prefixArgs, "--run", "x y"], { cwd: temp, timeout: 30_000 }, started(resolve));
        child.stdin!.end("from-stdin\n");
      });
      expect(runnerExecFailure(out)).toBeUndefined();
      expect([out.exitCode, out.stdout.trim()]).toEqual([3, "args=--run,x y stdin=from-stdin"]);
    } finally {
      staged.cleanup();
    }
  });

  it("S20 permissions: a private copy that lost its execute permission after it was staged is refused at the start (EACCES): START_FAILED, not executed", async () => {
    const r = rawRunner("perm-lost", Buffer.from(`#!/bin/sh\ntouch ${marker("s20")}\nexit 42\n`), 0o755);
    const staged = stageSilverRunner(r, r.binarySha256);
    try {
      fs.chmodSync(staged.file, 0o600);
      const s = await startStaged(staged);
      expect(runnerExecFailure(s), s.stderr.slice(0, 400)).toEqual({ code: "SILVER_RUNNER_START_FAILED", detail: expect.stringMatching(/EACCES/) });
      expect(fs.existsSync(marker("s20")), "the script ran").toBe(false);
    } finally {
      staged.cleanup();
    }
  }, ABORTING);
});

describe.runIf(LINUX_LE)("REMED-CLOSE · R-01 · `silver test`'s run path (runSilverVmTests) on a runner the kernel refuses", () => {
  it("S18 SILVER_RUNNER_START_FAILED (never a timeout, a verdict or a shell run)", async () => {
    const { runSilverVmTests } = await import("../src/index.js");
    const r = rawRunner("kernel-refused-for-test", elfOverProgramHeaderLimit(marker("s18")), 0o755);
    await expect(
      runSilverVmTests({ runner: r, source: "contract X() {}", prepared: { runnerTestFile: "{}", cases: [{ name: "t" }] } as any, timeoutMs: 20_000 })
    ).rejects.toThrow(/^SILVER_RUNNER_START_FAILED: the kernel refused to start the runner \(ENOEXEC\)/);
    expect(fs.existsSync(marker("s18"))).toBe(false);
  }, ABORTING);
});

/** A writable directory on a noexec mount: HARDKAS_TEST_NOEXEC_DIR, else one found in /proc/mounts (e.g. Docker's /dev/shm). */
function noexecDir(): string | undefined {
  const fromEnv = process.env.HARDKAS_TEST_NOEXEC_DIR;
  if (fromEnv) return fromEnv;
  let mounts = "";
  try {
    mounts = fs.readFileSync("/proc/mounts", "utf8");
  } catch {
    return undefined;
  }
  for (const line of mounts.split("\n")) {
    const [, mountPoint, , options] = line.split(" ");
    if (!mountPoint || !options || !options.split(",").includes("noexec") || !options.split(",").includes("rw")) continue;
    // usable only if a directory and a file can really be made there (not /proc, /dev/mqueue…)
    try {
      const probeDir = fs.mkdtempSync(path.join(mountPoint, "hk-noexec-probe-"));
      fs.writeFileSync(path.join(probeDir, "f"), "x");
      fs.rmSync(probeDir, { recursive: true, force: true });
      return mountPoint;
    } catch {
      continue;
    }
  }
  return undefined;
}
