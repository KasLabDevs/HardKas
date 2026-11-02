import { describe, it, expect, afterAll, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  executeSilverVmScenario,
  parseSilArtifactValuesJson,
  resolveAvailableSilverRunner,
  silverRunnerTrustOf,
  silverRunnerTrustPolicy,
  SILVER_RUNNER_TRUSTED_REFERENCES,
  type SilverRunner
} from "../src/index.js";

// -----------------------------------------------------------------------------
// R-04 · the SilverScript runner (cli-debugger) has an identity and a trust state. Upstream publishes no runner binary,
// so no trusted reference exists: every runner is UNVERIFIED (a local build, digested, never "official"). By default an
// UNVERIFIED runner is never executed (RUNNER_UNVERIFIED); an explicit opt-in runs it, and every result names it as
// UNVERIFIED. A runner whose bytes change after it was resolved is refused. Hermetic: stand-in runners (node + script),
// a compiled fixture artifact, no silverc, no real runner.
// -----------------------------------------------------------------------------

const FIX = path.join(__dirname, "fixtures", "silverscript-v1");
const artifact = JSON.parse(fs.readFileSync(path.join(FIX, "abi-vectors.artifact.json"), "utf8"));
const source = fs.readFileSync(path.join(FIX, "abi-vectors.sil"), "utf8");
const constructorArgs = parseSilArtifactValuesJson(fs.readFileSync(path.join(FIX, "abi-vectors.constructor-args.json"), "utf8"));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-runner-trust-"));
const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));

// a stand-in that leaves a marker when it runs, then answers like the runner's PASS
const marker = path.join(temp, "executed.marker");
const standIn = path.join(temp, "stand-in.mjs");
fs.writeFileSync(standIn, `import fs from "node:fs";\nfs.writeFileSync(${JSON.stringify(marker)}, "ran");\nconsole.log("PASS");\n`);
const standInRunner: SilverRunner = { path: process.execPath, prefixArgs: [standIn], binarySha256: sha256(process.execPath), size: fs.statSync(process.execPath).size, provenance: "unmanaged-local-build" };
// a file that is not a runner at all
const fakeRunner = path.join(temp, "not-a-runner.bin");
fs.writeFileSync(fakeRunner, "this is not a SilverScript runner\n");

const scenario = (runner: SilverRunner | undefined, runnerTrust?: "require-verified" | "allow-unverified") =>
  executeSilverVmScenario({
    source,
    artifact,
    constructorArgs,
    entrypoint: "list",
    args: [{ kind: "array", value: [] }],
    ...(runner ? { runner } : {}),
    ...(runnerTrust ? { runnerTrust } : {})
  } as any);

// the variables resolution reads, saved and restored around every test
const saved: Record<string, string | undefined> = {};
beforeEach(() => {
  for (const k of ["HARDKAS_SILVER_RUNNER", "HARDKAS_SILVER_RUNNER_TRUST", "HARDKAS_HOME"]) saved[k] = process.env[k];
  delete process.env.HARDKAS_SILVER_RUNNER;
  delete process.env.HARDKAS_SILVER_RUNNER_TRUST;
  fs.rmSync(marker, { force: true });
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("R-04 · runner identity and trust", () => {
  it("TR1 a runner named explicitly is identified (path, SHA-256, size, provenance) and UNVERIFIED: not available by default", () => {
    const r: any = resolveAvailableSilverRunner(fakeRunner);
    expect(r.available).toBe(false);
    expect(r.reasonCode).toBe("RUNNER_UNVERIFIED");
    expect(r.identity).toMatchObject({
      path: path.resolve(fakeRunner),
      sha256: sha256(fakeRunner),
      size: fs.statSync(fakeRunner).size,
      source: "explicit-path",
      provenance: "unmanaged-local-build",
      trust: "UNVERIFIED"
    });
  });

  it("TR2 a runner named by HARDKAS_SILVER_RUNNER: same identity, source env", () => {
    process.env.HARDKAS_SILVER_RUNNER = fakeRunner;
    const r: any = resolveAvailableSilverRunner();
    expect(r.available).toBe(false);
    expect(r.reasonCode).toBe("RUNNER_UNVERIFIED");
    expect(r.identity).toMatchObject({ sha256: sha256(fakeRunner), source: "env", trust: "UNVERIFIED" });
  });

  it("TR3 a binary found in <HARDKAS_HOME>/toolchains/cli-debugger is a local build, not a managed toolchain: its toolchain.json version is only claimed", () => {
    const home = path.join(temp, "home");
    const dir = path.join(home, "toolchains", "cli-debugger", "1.0.0");
    fs.mkdirSync(dir, { recursive: true });
    const exe = path.join(dir, process.platform === "win32" ? "cli-debugger.exe" : "cli-debugger");
    fs.copyFileSync(fakeRunner, exe);
    fs.writeFileSync(path.join(dir, "toolchain.json"), JSON.stringify({ version: "1.0.0", commit: "3ed97333" }));
    process.env.HARDKAS_HOME = home;
    const r: any = resolveAvailableSilverRunner();
    expect(r.available).toBe(false);
    expect(r.reasonCode).toBe("RUNNER_UNVERIFIED");
    expect(r.identity).toMatchObject({ path: exe, sha256: sha256(exe), source: "home-toolchains", claimedVersion: "1.0.0", trust: "UNVERIFIED" });
  });

  it("TR4 by default an UNVERIFIED runner is never executed: BLOCKED (RUNNER_UNVERIFIED), its identity recorded", async () => {
    const res: any = await scenario(standInRunner);
    expect(res.status).toBe("BLOCKED");
    expect(res.passed).toBe(false);
    expect(res.blockedReason).toMatch(/^RUNNER_UNVERIFIED/);
    expect(res.exitCode).toBeNull();
    expect(fs.existsSync(marker)).toBe(false);
    expect(res.runnerIdentity).toMatchObject({ path: process.execPath, sha256: sha256(process.execPath), trust: "UNVERIFIED" });
  });

  it("TR5 with the explicit opt-in the runner runs, and its verdict carries the UNVERIFIED identity", async () => {
    const res: any = await scenario(standInRunner, "allow-unverified");
    expect(fs.existsSync(marker)).toBe(true);
    expect(res.status).toBe("SCRIPT_VM_PASS");
    expect(res.runnerIdentity).toMatchObject({ sha256: sha256(process.execPath), trust: "UNVERIFIED", provenance: "unmanaged-local-build" });
  });

  it("TR6 HARDKAS_SILVER_RUNNER_TRUST=allow-unverified is the same opt-in", async () => {
    process.env.HARDKAS_SILVER_RUNNER_TRUST = "allow-unverified";
    const res: any = await scenario(standInRunner);
    expect(fs.existsSync(marker)).toBe(true);
    expect(res.runnerIdentity?.trust).toBe("UNVERIFIED");
  });

  it("TR7 a runner whose bytes changed after it was resolved is refused before it runs", async () => {
    const changing = path.join(temp, "changing.bin");
    fs.writeFileSync(changing, "version A\n");
    const r: any = resolveAvailableSilverRunner(changing, { trust: "allow-unverified" });
    expect(r.available).toBe(true);
    fs.writeFileSync(changing, "version B, swapped after resolution\n");
    const res: any = await scenario(r.runner, "allow-unverified");
    expect(res.status).toBe("BLOCKED");
    expect(res.blockedReason).toMatch(/^RUNNER_UNVERIFIED.*changed/);
  });

  it("TR8 no digest is trusted today: upstream publishes no runner binary and no reference is invented", () => {
    expect(SILVER_RUNNER_TRUSTED_REFERENCES).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
// Control 3 · no path around the policy. The trusted list cannot be extended at run time; a runner driven through another
// program (prefixArgs: what HardKAS digests is that program, not what it runs) is never VERIFIED, even if the program's
// digest were trusted; a runner given as an object is identified from its bytes like a path; only the exact opt-in
// value of HARDKAS_SILVER_RUNNER_TRUST opts in.
// -----------------------------------------------------------------------------

describe("Control 3 · no path around the runner trust policy", () => {
  it("TR9 trust comes from a reference digest only, and never for a runner driven through another program", () => {
    const refs = [{ sha256: sha256(process.execPath), description: "a reference for this test only" }];
    expect(silverRunnerTrustOf(sha256(process.execPath), undefined, refs)).toEqual({ trust: "VERIFIED", verifiedBy: "a reference for this test only" });
    expect(silverRunnerTrustOf(sha256(process.execPath), [standIn], refs)).toEqual({ trust: "UNVERIFIED" });
    expect(silverRunnerTrustOf(sha256(fakeRunner), undefined, refs)).toEqual({ trust: "UNVERIFIED" });
    expect(silverRunnerTrustOf(sha256(process.execPath))).toEqual({ trust: "UNVERIFIED" });
  });

  it("TR10 the trusted list is frozen: code in the process cannot add a reference", () => {
    expect(Object.isFrozen(SILVER_RUNNER_TRUSTED_REFERENCES)).toBe(true);
    expect(() => (SILVER_RUNNER_TRUSTED_REFERENCES as any).push({ sha256: sha256(process.execPath), description: "injected" })).toThrow(TypeError);
    expect(SILVER_RUNNER_TRUSTED_REFERENCES).toEqual([]);
  });

  it("TR11 a runner object (stand-in with prefixArgs) is identified from its bytes and refused by default; the opt-in runs it, prefixArgs recorded", () => {
    const refused: any = resolveAvailableSilverRunner(standInRunner);
    expect(refused.available).toBe(false);
    expect(refused.reasonCode).toBe("RUNNER_UNVERIFIED");
    expect(refused.identity).toMatchObject({ path: process.execPath, sha256: sha256(process.execPath), source: "explicit-path", prefixArgs: [standIn], trust: "UNVERIFIED" });
    const allowed: any = resolveAvailableSilverRunner(standInRunner, { trust: "allow-unverified" });
    expect(allowed.available).toBe(true);
    expect(allowed.runner.prefixArgs).toEqual([standIn]);
    expect(allowed.identity.trust).toBe("UNVERIFIED");
  });

  it("TR12 a runner object whose described digest is not the file's is refused even with the opt-in", () => {
    const r: any = resolveAvailableSilverRunner({ ...standInRunner, binarySha256: "0".repeat(64) }, { trust: "allow-unverified" });
    expect(r.available).toBe(false);
    expect(r.reasonCode).toBe("RUNNER_UNVERIFIED");
    expect(r.message).toMatch(/not the one described/);
  });

  it("TR13 a runner object whose file does not exist: RUNNER_NOT_FOUND", () => {
    const r: any = resolveAvailableSilverRunner({ ...standInRunner, path: path.join(temp, "missing.exe") }, { trust: "allow-unverified" });
    expect(r.available).toBe(false);
    expect(r.reasonCode).toBe("RUNNER_NOT_FOUND");
  });

  it("TR14 only the exact value allow-unverified of HARDKAS_SILVER_RUNNER_TRUST opts in", () => {
    for (const v of ["ALLOW-UNVERIFIED", "1", "true", "yes", "allow", "allow_unverified", "allow-unverified-runner", ""]) {
      process.env.HARDKAS_SILVER_RUNNER_TRUST = v;
      expect(silverRunnerTrustPolicy(), v).toBe("require-verified");
    }
    process.env.HARDKAS_SILVER_RUNNER_TRUST = " allow-unverified ";
    expect(silverRunnerTrustPolicy()).toBe("allow-unverified");
    // an explicit policy wins over the variable, both ways
    expect(silverRunnerTrustPolicy("require-verified")).toBe("require-verified");
    delete process.env.HARDKAS_SILVER_RUNNER_TRUST;
    expect(silverRunnerTrustPolicy("allow-unverified")).toBe("allow-unverified");
  });
});
