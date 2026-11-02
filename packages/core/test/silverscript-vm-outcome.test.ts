import { describe, it, expect, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { executeSilverVmScenario, parseSilArtifactValuesJson, type SilverRunner } from "../src/index.js";
import { LINUX_LE, elfOneByteInterpSegment } from "./helpers/runner-images.js";

// -----------------------------------------------------------------------------
// R-05 · a SCRIPT_VM result says what happened to the runner, never more. The runner's protocol (kaspanet/silverscript
// cli-debugger v1.0.0, as observed on a local build): a pass is exit 0 with a PASS line; a contract rejection is exit 1
// with its failure report ("error: …", a "--> line:col" span) ending in `Error: "FAIL"`. Anything else — a program that
// is not the runner (exit 0 without PASS, like whoami), a usage error, the runner's own error, a panic, a timeout, a
// binary that does not start, an endless output — is an infrastructure class (BLOCKED), never a contract rejection.
// Hermetic: stand-in runners (node + script, run under the explicit allow-unverified opt-in), a compiled fixture
// artifact; no silverc, no real runner.
// -----------------------------------------------------------------------------

const FIX = path.join(__dirname, "fixtures", "silverscript-v1");
const artifact = JSON.parse(fs.readFileSync(path.join(FIX, "abi-vectors.artifact.json"), "utf8"));
const source = fs.readFileSync(path.join(FIX, "abi-vectors.sil"), "utf8");
const constructorArgs = parseSilArtifactValuesJson(fs.readFileSync(path.join(FIX, "abi-vectors.constructor-args.json"), "utf8"));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-vm-outcome-"));
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));
const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

// the real runner's report for a rejected transition (OwnedCounter, delta 0), as a local cli-debugger build printed it
const REAL_FAIL_STDERR =
  "error: script ran, but verification failed\n   --> 14:9\n   |\n13 |         require(checkSig(s, owner));\n14 |         require(delta > 0);\n" +
  "   |         ^^^^^^^^^^^^^^^^^^^ verification failed here\n   |   delta = 0, init_value = 10\n   |\n\nError: \"FAIL\"\n";

/** A stand-in runner: a node script that prints `stdout`/`stderr` and exits with `code` (or hangs, or floods). */
function standIn(name: string, body: string): SilverRunner {
  const script = path.join(temp, `${name}.mjs`);
  fs.writeFileSync(script, body);
  return { path: process.execPath, prefixArgs: [script], binarySha256: sha256(process.execPath), size: fs.statSync(process.execPath).size, provenance: "unmanaged-local-build" };
}
const prints = (stdout: string, stderr: string, code: number) =>
  `process.stdout.write(${JSON.stringify(stdout)});\nprocess.stderr.write(${JSON.stringify(stderr)});\nprocess.exitCode = ${code};\n`;

const run = (runner: SilverRunner, timeoutMs?: number) =>
  executeSilverVmScenario({
    source,
    artifact,
    constructorArgs,
    entrypoint: "list",
    args: [{ kind: "array", value: [] }],
    runner,
    runnerTrust: "allow-unverified",
    ...(timeoutMs ? { timeoutMs } : {})
  } as any) as Promise<any>;

describe("R-05 · the runner's verdicts", () => {
  it("V1 exit 0 with the PASS line: SCRIPT_VM_PASS", async () => {
    const r = await run(standIn("pass", prints("PASS\n", "", 0)));
    expect(r.status).toBe("SCRIPT_VM_PASS");
    expect(r.outcomeClass).toBe("SCRIPT_VM_PASS");
  });

  it("V2 exit 1 with the runner's failure report ending in Error: \"FAIL\": SCRIPT_VM_REJECTED (status SCRIPT_VM_FAIL), its diagnostic parsed", async () => {
    const r = await run(standIn("reject", prints("", REAL_FAIL_STDERR, 1)));
    expect(r.status).toBe("SCRIPT_VM_FAIL");
    expect(r.outcomeClass).toBe("SCRIPT_VM_REJECTED");
    expect(r.diagnostic?.message).toBe("script ran, but verification failed");
    expect(r.diagnostic?.location?.line).toBe(14);
  });
});

describe("R-05 · infrastructure failures are never contract rejections", () => {
  it("W1 a program that is not the runner (exit 0, no PASS line — like whoami): RUNNER_PROTOCOL_ERROR, BLOCKED", async () => {
    const r = await run(standIn("whoami-like", prints("laptop\\someone\n", "", 0)));
    expect(r.status).toBe("BLOCKED");
    expect(r.passed).toBe(false);
    expect(r.outcomeClass).toBe("RUNNER_PROTOCOL_ERROR");
    expect(r.blockedReason).toMatch(/^RUNNER_PROTOCOL_ERROR/);
  });

  it("W2 exit 1 without the runner's failure report (a usage error): RUNNER_PROTOCOL_ERROR, not a rejection", async () => {
    const r = await run(standIn("usage", prints("", "usage: cli-debugger [OPTIONS] <FILE>\n", 1)));
    expect(r.status).toBe("BLOCKED");
    expect(r.outcomeClass).toBe("RUNNER_PROTOCOL_ERROR");
  });

  it("W3 `Error: \"FAIL\"` without any failure report: RUNNER_PROTOCOL_ERROR", async () => {
    const r = await run(standIn("bare-fail", prints("", 'Error: "FAIL"\n', 1)));
    expect(r.status).toBe("BLOCKED");
    expect(r.outcomeClass).toBe("RUNNER_PROTOCOL_ERROR");
  });

  it("W4 the runner's own error (cannot read its test file): RUNNER_INTERNAL_ERROR", async () => {
    const r = await run(standIn("own-error", prints("", 'Error: Os { code: 2, kind: NotFound, message: "The system cannot find the file specified." }\n', 1)));
    expect(r.status).toBe("BLOCKED");
    expect(r.outcomeClass).toBe("RUNNER_INTERNAL_ERROR");
  });

  it("W5 a panic (exit 101): RUNNER_INTERNAL_ERROR", async () => {
    const r = await run(standIn("panic", prints("", "thread 'main' panicked at debugger/cli/src/main.rs:1:1:\nindex out of bounds\n", 101)));
    expect(r.status).toBe("BLOCKED");
    expect(r.outcomeClass).toBe("RUNNER_INTERNAL_ERROR");
  });

  it("W6 a runner that never finishes: RUNNER_TIMEOUT, BLOCKED (never thrown, never a rejection)", async () => {
    const r = await run(standIn("hang", "setTimeout(() => {}, 60000);\n"), 1500);
    expect(r.status).toBe("BLOCKED");
    expect(r.outcomeClass).toBe("RUNNER_TIMEOUT");
  });

  it("W7 a runner file that is not an executable: RUNNER_START_FAILED, BLOCKED", async () => {
    const notExe = path.join(temp, process.platform === "win32" ? "not-exe.exe" : "not-exe");
    fs.writeFileSync(notExe, "not an executable\n");
    const r = await run({ path: notExe, binarySha256: sha256(notExe), size: 18, provenance: "unmanaged-local-build" });
    expect(r.status).toBe("BLOCKED");
    expect(r.outcomeClass).toBe("RUNNER_START_FAILED");
  });

  it("W8 a runner whose file disappeared: RUNNER_NOT_FOUND, BLOCKED", async () => {
    const gone = path.join(temp, "gone.exe");
    const r = await run({ path: gone, binarySha256: "0".repeat(64), size: 0, provenance: "unmanaged-local-build" });
    expect(r.status).toBe("BLOCKED");
    expect(r.outcomeClass).toBe("RUNNER_NOT_FOUND");
  });

  it("W9 an endless output past the limit: RUNNER_PROTOCOL_ERROR, BLOCKED", async () => {
    const r = await run(standIn("flood", "const chunk = 'x'.repeat(1 << 20);\nfor (let i = 0; i < 12; i++) process.stdout.write(chunk);\n"));
    expect(r.status).toBe("BLOCKED");
    expect(r.outcomeClass).toBe("RUNNER_PROTOCOL_ERROR");
  });

  // REMED-CLOSE · R-01: an image that passes every header check and that the kernel refuses (the exec family would hand
  // it to /bin/sh, which would run its shell lines); a Node.js abort after it can take seconds where crash reports are kept
  it.runIf(LINUX_LE)("W10 a runner the kernel refuses after every header check: RUNNER_START_FAILED, BLOCKED; nothing ran through /bin/sh", async () => {
    const marker = path.join(temp, "pwned-w10");
    const refused = path.join(temp, "kernel-refused");
    fs.writeFileSync(refused, elfOneByteInterpSegment(marker), { mode: 0o755 });
    const r = await run({ path: refused, binarySha256: sha256(refused), size: fs.statSync(refused).size, provenance: "unmanaged-local-build" });
    expect(r.status).toBe("BLOCKED");
    expect(r.outcomeClass).toBe("RUNNER_START_FAILED");
    expect(r.blockedReason).toMatch(/^RUNNER_START_FAILED: the kernel refused to start the runner \(ENOEXEC\)/);
    expect(fs.existsSync(marker)).toBe(false);
  }, 60_000);
});
