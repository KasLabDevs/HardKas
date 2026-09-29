import { describe, it, expect, afterAll } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  SILVER_RUNNER_ENV,
  parseSilAbiArtifact,
  parseSilArtifactValuesJson,
  prepareSilverVmTests,
  resolveSilverRunner,
  runSilverVmTests,
  silverRunnerValue,
  type SilverRunner
} from "../src/index.js";

// The adapter's own logic, without the runner: test-file checks, constructor
// arguments, signature slots, and the verdict rules, the last against a
// stand-in runner driven through node. Real runner verdicts are at their own
// level (*.silver-runner.test.ts).

const CORPUS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures", "toccata-v2", "silver");
const load = (dir: string, stem: string) => ({
  artifact: parseSilAbiArtifact(JSON.parse(fs.readFileSync(path.join(CORPUS, dir, `${stem}.artifact.json`), "utf8"))),
  constructorArgs: parseSilArtifactValuesJson(fs.readFileSync(path.join(CORPUS, dir, `${stem}.constructor-args.json`), "utf8"))
});
const signed = load("p2sh-signed-release", "contract");
const counter = load("covenant-counter-transition", "current");

const KEY = createHash("sha256").update("hardkas-silver-runner-test").digest("hex");
const signer = (account: string) => {
  if (account !== "alice") throw new Error(`unknown account ${account}`);
  return KEY;
};
const oneOut = { version: 0, inputs: [{ utxo_value: 1_000_000_000, sig_op_count: 1 }], outputs: [{ value: 900_000_000, script_hex: `20${"11".repeat(32)}ac` }] };
const code = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e: any) {
    return e.code as string;
  }
  return "NO_ERROR";
};

const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-runner-test-"));
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));

describe("resolveSilverRunner", () => {
  it("fails closed when no runner is configured", () => {
    const saved = process.env[SILVER_RUNNER_ENV];
    delete process.env[SILVER_RUNNER_ENV];
    try {
      expect(() => resolveSilverRunner()).toThrow(/SILVER_RUNNER_NOT_CONFIGURED/);
    } finally {
      if (saved !== undefined) process.env[SILVER_RUNNER_ENV] = saved;
    }
  });

  it("fails closed on a missing file or a directory", () => {
    expect(() => resolveSilverRunner(path.join(temp, "missing.exe"))).toThrow(/SILVER_RUNNER_NOT_FOUND/);
    expect(() => resolveSilverRunner(temp)).toThrow(/SILVER_RUNNER_NOT_FOUND/);
  });

  it("digests the binary it names and records it as an unmanaged build", () => {
    const file = path.join(temp, "runner.bin");
    fs.writeFileSync(file, "not really a runner");
    const r = resolveSilverRunner(file);
    expect(r).toMatchObject({ path: file, size: 19, provenance: "unmanaged-local-build" });
    expect(r.binarySha256).toBe(createHash("sha256").update("not really a runner").digest("hex"));
  });
});

describe("silverRunnerValue", () => {
  it("writes values the way the runner parses them", () => {
    expect(silverRunnerValue({ kind: "int", value: 2n ** 62n })).toBe("4611686018427387904");
    expect(silverRunnerValue({ kind: "int", value: -7 })).toBe("-7");
    expect(silverRunnerValue({ kind: "bool", value: false })).toBe("false");
    expect(silverRunnerValue({ kind: "byte", value: 5 })).toBe("0x05");
    expect(silverRunnerValue({ kind: "bytes", value: [0xab, 0x01] })).toBe("0xab01");
    expect(silverRunnerValue({ kind: "bytes", value: [] })).toBe("0x");
    expect(silverRunnerValue({ kind: "text", value: "hello" })).toBe("hello");
    expect(silverRunnerValue({ kind: "array", value: [{ kind: "int", value: 1 }, { kind: "int", value: 2 }] })).toEqual(["1", "2"]);
    expect(silverRunnerValue({ kind: "object", value: { b: { kind: "bool", value: true }, a: { kind: "int", value: 3 } } })).toEqual({ a: "3", b: "true" });
  });

  it("refuses text the runner would read as something else", () => {
    for (const value of [" padded", "[1]", "{\"a\":1}", "null"]) {
      expect(() => silverRunnerValue({ kind: "text", value })).toThrow(/SILVER_TEST_VALUE_UNREPRESENTABLE/);
    }
  });
});

describe("prepareSilverVmTests", () => {
  const prepare = (tests: unknown, withSigner = true) =>
    prepareSilverVmTests({ ...signed, tests, ...(withSigner ? { signer } : {}) });

  it("puts the record's constructor arguments on every test and keeps the rest", async () => {
    const p = await prepare({ tests: [{ name: "a", function: "release", args: ["0x" + "00".repeat(65)], expect: "fail", tx: oneOut }, { name: "b", function: "release", args: [], expect: "fail" }] });
    const file = JSON.parse(p.runnerTestFile);
    const pubkey = `0x${Buffer.from((signed.constructorArgs[0] as any).value).toString("hex")}`;
    expect(file.tests.map((t: any) => t.constructor_args)).toEqual([[pubkey], [pubkey]]);
    expect(file.tests[0].tx).toEqual(oneOut);
    expect(p.contract).toBe("SignedRelease");
    expect(p.cases).toEqual([
      { name: "a", function: "release", expect: "fail", signedArgs: [] },
      { name: "b", function: "release", expect: "fail", signedArgs: [] }
    ]);
  });

  it("signs a signature slot for its account over the scenario", async () => {
    const p = await prepare({ tests: [{ name: "owner", function: "release", args: [{ signature: "alice" }], expect: "pass", tx: oneOut }] });
    const arg = JSON.parse(p.runnerTestFile).tests[0].args[0];
    expect(arg).toMatch(/^0x[0-9a-f]{130}$/);
    expect(arg.endsWith("01")).toBe(true); // SighashType.All
    expect(p.cases[0]!.signedArgs).toEqual([0]);
    expect(p.runnerTestFile).not.toContain(KEY);
  });

  it("signs the runner's default scenario when a test has no tx", async () => {
    const p = await prepare({ tests: [{ name: "owner", function: "release", args: [{ signature: "alice" }], expect: "pass" }] });
    expect(JSON.parse(p.runnerTestFile).tests[0].args[0]).toMatch(/^0x[0-9a-f]{130}$/);
    expect(JSON.parse(p.runnerTestFile).tests[0].tx).toBeUndefined();
  });

  it("rejects what the runner would ignore or HardKAS cannot vouch for", async () => {
    const t = (extra: Record<string, unknown>) => ({ tests: [{ name: "t", function: "release", args: [], expect: "pass", ...extra }] });
    expect(await code(prepare([]))).toBe("SILVER_TEST_FILE_INVALID");
    expect(await code(prepare({ tests: [], extra: 1 }))).toBe("SILVER_TEST_FILE_INVALID");
    expect(await code(prepare({ tests: [] }))).toBe("SILVER_TEST_FILE_INVALID");
    expect(await code(prepare({ tests: [{ name: "t", function: "release", expect: "pass" }, { name: "t", function: "release", expect: "pass" }] }))).toBe("SILVER_TEST_FILE_INVALID");
    expect(await code(prepare(t({ expect: "passes" })))).toBe("SILVER_TEST_FILE_INVALID");
    expect(await code(prepare(t({ expected: "pass" })))).toBe("SILVER_TEST_FILE_INVALID");
    expect(await code(prepare(t({ constructor_args: ["0x00"] })))).toBe("SILVER_TEST_CONSTRUCTOR_ARGS_FORBIDDEN");
    expect(await code(prepare(t({ tx: { ...oneOut, inputs: [{ utxo_value: 1, signature_script_hex: "00" }] } })))).toBe("SILVER_TEST_UNLOCK_NOT_EXECUTED");
    expect(await code(prepare(t({ tx: { ...oneOut, inputs: [{ utxo_value: 1, sequnce: 5 }] } })))).toBe("SILVER_TEST_FILE_INVALID");
    expect(await code(prepare(t({ tx: { ...oneOut, inputs: [{ utxo_value: 2 ** 53 + 2 }] } })))).toBe("SILVER_TEST_NUMBER_UNSAFE");
    expect(await code(prepare(t({ tx: { ...oneOut, active_input_index: 1 } })))).toBe("SILVER_TEST_FILE_INVALID");
  });

  it("allows signature slots only where the entry takes a sig, with a signer, in a plain P2SH scenario", async () => {
    const slot = { signature: "alice" };
    expect(await code(prepare({ tests: [{ name: "t", function: "release", args: [slot], expect: "pass" }] }, false))).toBe("SILVER_TEST_SIGNER_UNAVAILABLE");
    expect(await code(prepare({ tests: [{ name: "t", function: "release", args: ["0x00", slot], expect: "pass" }] }))).toBe("SILVER_TEST_SIGNATURE_SLOT_INVALID");
    expect(await code(prepare({ tests: [{ name: "t", function: "release", args: [slot], expect: "pass", tx: { ...oneOut, inputs: [{ utxo_value: 1, covenant_id: "0x" + "22".repeat(32) }] } }] }))).toBe("SILVER_TEST_SIGNATURE_UNSUPPORTED");
    expect(await code(prepare({ tests: [{ name: "t", function: "release", args: [slot], expect: "pass", tx: { ...oneOut, outputs: [{ value: 1, state: { value: 1 } }] } }] }))).toBe("SILVER_TEST_SIGNATURE_UNSUPPORTED");
    // A covenant policy is not an entry: its generated entrypoint is the runner's to encode.
    expect(await code(prepareSilverVmTests({ ...counter, signer, tests: { tests: [{ name: "t", function: "bump", args: [slot], expect: "pass" }] } }))).toBe("SILVER_TEST_SIGNATURE_UNSUPPORTED");
  });

  it("never echoes what a signer returned", async () => {
    const leaky = "not-a-key-but-secret";
    const err: any = await prepareSilverVmTests({ ...signed, signer: () => leaky, tests: { tests: [{ name: "t", function: "release", args: [{ signature: "alice" }], expect: "pass" }] } }).catch((e) => e);
    expect(err.code).toBe("SILVER_TEST_SIGNER_FAILED");
    expect(String(err.message)).not.toContain(leaky);
  });

  it("refuses artifacts with more than one contract", async () => {
    const two = { ...signed.artifact, contracts: { ...signed.artifact.contracts, Other: signed.artifact.contracts.SignedRelease! } };
    expect(await code(prepareSilverVmTests({ ...signed, artifact: two, tests: { tests: [] } }))).toBe("SILVER_TEST_CONTRACT_AMBIGUOUS");
  });
});

describe("runSilverVmTests (stand-in runner)", () => {
  // Answers by test name; reports what it was given, so the test can check the files handed over.
  const standIn = path.join(temp, "stand-in-runner.mjs");
  fs.writeFileSync(
    standIn,
    `import fs from "node:fs";
import { createHash } from "node:crypto";
const a = process.argv.slice(2);
const flag = (f) => a.find((x) => x.startsWith(f + "="))?.slice(f.length + 1);
const name = flag("--test-name");
const file = flag("--test-file");
const source = a[a.length - 1];
if (!a.includes("--run")) process.exit(9);
console.log("given " + createHash("sha256").update(fs.readFileSync(file)).digest("hex") + " " + fs.readFileSync(source, "utf8").length);
if (name === "passes") console.log("PASS");
else if (name === "fails-as-expected") console.log("PASS (expected failure)");
else if (name === "fails") { console.error("error: script ran, but verification failed"); process.exit(1); }
else if (name === "silent") process.exit(0);
else if (name === "hangs") setTimeout(() => {}, 60000);
`
  );
  const runner: SilverRunner = { path: process.execPath, prefixArgs: [standIn], binarySha256: "0".repeat(64), size: 1, provenance: "unmanaged-local-build" };
  const prepared = (names: string[]) =>
    prepareSilverVmTests({ ...signed, tests: { tests: names.map((name) => ({ name, function: "release", args: ["0x" + "00".repeat(65)], expect: "pass" })) } });

  it("takes the runner's exit status as the verdict, one process per test", async () => {
    const p = await prepared(["passes", "fails-as-expected", "fails"]);
    const results = await runSilverVmTests({ runner, source: "contract X {}", prepared: p });
    expect(results.map((r) => [r.name, r.outcome, r.runnerStatus, r.exitCode])).toEqual([
      ["passes", "PASS", "PASS", 0],
      ["fails-as-expected", "PASS", "PASS (expected failure)", 0],
      ["fails", "FAIL", null, 1]
    ]);
    const given = createHash("sha256").update(p.runnerTestFile).digest("hex");
    for (const r of results) expect(r.stdout).toContain(`given ${given} 13`);
    expect(results[2]!.stderr).toContain("verification failed");
  });

  it("treats a silent success, a timeout and a runner that does not start as errors, never verdicts", async () => {
    expect(await code(prepared(["silent"]).then((p) => runSilverVmTests({ runner, source: "x", prepared: p })))).toBe("SILVER_RUNNER_OUTPUT_UNRECOGNIZED");
    expect(await code(prepared(["hangs"]).then((p) => runSilverVmTests({ runner, source: "x", prepared: p, timeoutMs: 1500 })))).toBe("SILVER_RUNNER_TIMEOUT");
    const missing = { ...runner, path: path.join(temp, "no-such-runner.exe"), prefixArgs: [] };
    expect(await code(prepared(["passes"]).then((p) => runSilverVmTests({ runner: missing, source: "x", prepared: p })))).toBe("SILVER_RUNNER_FAILED");
  });
});
