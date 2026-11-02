import { describe, it, expect, afterAll, beforeAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { executeSilverVmScenario, parseSilArtifactValuesJson, type SilverRunner } from "../src/index.js";

// -----------------------------------------------------------------------------
// H-B1 · the SCRIPT_VM bridge writes the runner's test file. The runner (kaspanet/silverscript cli-debugger v1.0.0,
// debugger-session test_runner.rs) reads lock_time, sequence, utxo_value and value as u64 JSON integers, and HardKAS signs
// the scenario with exact bigints: what the runner reads must be those same values, never a Number() rounding of them.
// A value outside the u64 range, or a JS number that is not an exact integer, is refused before anything runs.
// Hermetic: a stand-in runner (node + script, under the explicit allow-unverified opt-in) that keeps a copy of the test
// file it was given, and a compiled fixture artifact; no silverc, no real runner.
// -----------------------------------------------------------------------------

const FIX = path.join(__dirname, "fixtures", "silverscript-v1");
const artifact = JSON.parse(fs.readFileSync(path.join(FIX, "abi-vectors.artifact.json"), "utf8"));
const source = fs.readFileSync(path.join(FIX, "abi-vectors.sil"), "utf8");
const constructorArgs = parseSilArtifactValuesJson(fs.readFileSync(path.join(FIX, "abi-vectors.constructor-args.json"), "utf8"));
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-vm-exact-"));
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));
const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");

const U64_MAX = (1n << 64n) - 1n;
const P53 = 1n << 53n;

/** A stand-in runner that copies the test file it receives (`--test-file=<path>`) to `capture` and prints PASS. */
function capturingRunner(name: string): { runner: SilverRunner; capture: string } {
  const capture = path.join(temp, `${name}.received.json`);
  const script = path.join(temp, `${name}.mjs`);
  fs.writeFileSync(
    script,
    'import fs from "node:fs";\n' +
      'const arg = process.argv.find((a) => a.startsWith("--test-file="));\n' +
      `fs.copyFileSync(arg.slice("--test-file=".length), ${JSON.stringify(capture)});\n` +
      'process.stdout.write("PASS\\n");\n'
  );
  return {
    runner: { path: process.execPath, prefixArgs: [script], binarySha256: sha256(process.execPath), size: fs.statSync(process.execPath).size, provenance: "unmanaged-local-build" },
    capture
  };
}

interface U64Fields {
  readonly lockTime?: number | bigint;
  readonly sequence?: number | bigint;
  readonly utxoValue?: number | bigint;
  readonly value?: number | bigint;
}

const run = (runner: SilverRunner, f: U64Fields) =>
  executeSilverVmScenario({
    source,
    artifact,
    constructorArgs,
    entrypoint: "list",
    args: [{ kind: "array", value: [] }],
    tx: {
      version: 1,
      lockTime: f.lockTime ?? 0n,
      activeInputIndex: 0,
      inputs: [{ utxoValue: f.utxoValue ?? 5000n, sequence: f.sequence ?? 0n }],
      outputs: [{ value: f.value ?? 5000n }]
    },
    runner,
    runnerTrust: "allow-unverified"
  } as any) as Promise<any>;

/** The four u64 fields exactly as written in the received test file (digits, never re-read through a double). */
function writtenU64(capture: string) {
  const text = fs.readFileSync(capture, "utf8");
  JSON.parse(text); // still one valid JSON document
  const digits = (key: string) => [...text.matchAll(new RegExp(`"${key}":\\s*(-?\\d+)`, "g"))].map((m) => m[1]);
  return { lockTime: digits("lock_time"), sequence: digits("sequence"), utxoValue: digits("utxo_value"), value: digits("value") };
}

describe("H-B1 · the runner receives the u64 fields exactly", () => {
  const cases: Array<[string, Required<U64Fields>]> = [
    ["E1 just above 2^53 (not doubles)", { lockTime: P53 + 1n, sequence: P53 + 3n, utxoValue: P53 + 1n, value: P53 + 3n }],
    ["E2 u64::MAX in every field", { lockTime: U64_MAX, sequence: U64_MAX, utxoValue: U64_MAX, value: U64_MAX }],
    ["E3 u64::MAX - 1, the maximum supply - 1 and 2^63", { lockTime: U64_MAX - 1n, sequence: U64_MAX - 1n, utxoValue: 2_899_999_999_999_999_999n, value: 1n << 63n }]
  ];
  for (const [title, f] of cases) {
    it(title, async () => {
      const { runner, capture } = capturingRunner(title.slice(0, 2));
      const r = await run(runner, f);
      expect(r.status, r.stderr).toBe("SCRIPT_VM_PASS");
      expect(writtenU64(capture)).toEqual({
        lockTime: [String(f.lockTime)],
        sequence: [String(f.sequence)],
        utxoValue: [String(f.utxoValue)],
        value: [String(f.value)]
      });
    });
  }

  it("E4 safe JS numbers keep working, written as the same integers", async () => {
    const { runner, capture } = capturingRunner("E4");
    const r = await run(runner, { lockTime: 1000, sequence: 0, utxoValue: Number.MAX_SAFE_INTEGER, value: 4000 });
    expect(r.status, r.stderr).toBe("SCRIPT_VM_PASS");
    expect(writtenU64(capture)).toEqual({ lockTime: ["1000"], sequence: ["0"], utxoValue: [String(Number.MAX_SAFE_INTEGER)], value: ["4000"] });
  });
});

describe("H-B1 · values the runner cannot read exactly are refused before anything runs", () => {
  const outOfRange: Array<[string, U64Fields]> = [
    ["lockTime 2^64", { lockTime: U64_MAX + 1n }],
    ["sequence -1", { sequence: -1n }],
    ["utxoValue 2^64", { utxoValue: U64_MAX + 1n }],
    ["value -1", { value: -1n }]
  ];
  for (const [title, f] of outOfRange) {
    it(`R1 ${title}: SILVER_VM_NUMBER_OUT_OF_RANGE, the runner never starts`, async () => {
      const { runner, capture } = capturingRunner(`R1-${title.replace(/\W+/g, "-")}`);
      await expect(run(runner, f)).rejects.toThrow(/^SILVER_VM_NUMBER_OUT_OF_RANGE: /);
      expect(fs.existsSync(capture)).toBe(false);
    });
  }

  const unsafe: Array<[string, U64Fields]> = [
    ["utxoValue 2^53 + 2 as a JS number", { utxoValue: Number(P53) + 2 }],
    ["value Number.MAX_SAFE_INTEGER + 1", { value: Number.MAX_SAFE_INTEGER + 1 }],
    ["lockTime 1.5", { lockTime: 1.5 }],
    ["sequence NaN", { sequence: Number.NaN }]
  ];
  for (const [title, f] of unsafe) {
    it(`R2 ${title}: SILVER_VM_NUMBER_UNSAFE, the runner never starts`, async () => {
      const { runner, capture } = capturingRunner(`R2-${title.replace(/\W+/g, "-")}`);
      await expect(run(runner, f)).rejects.toThrow(/^SILVER_VM_NUMBER_UNSAFE: /);
      expect(fs.existsSync(capture)).toBe(false);
    });
  }
});

// -----------------------------------------------------------------------------
// M-1 · a process that uses the SDK may define BigInt.prototype.toJSON (to a string, or to a Number). JSON.stringify calls
// it before any replacer: the test file must not depend on it. Under both variants the runner still reads exact integers.
// -----------------------------------------------------------------------------

const TO_JSON_VARIANTS: Array<[string, (this: bigint) => unknown]> = [
  ["toString", function (this: bigint) {
    return this.toString();
  }],
  ["Number", function (this: bigint) {
    return Number(this);
  }]
];

for (const [variant, toJSON] of TO_JSON_VARIANTS) {
  describe(`M-1 · with a host BigInt.prototype.toJSON (${variant}) the runner still receives exact integers`, () => {
    beforeAll(() => {
      Object.defineProperty(BigInt.prototype, "toJSON", { value: toJSON, configurable: true, writable: true });
    });
    afterAll(() => {
      delete (BigInt.prototype as any).toJSON;
    });

    for (const [title, f] of [
      ["T1 just above 2^53", { lockTime: P53 + 1n, sequence: P53 + 3n, utxoValue: P53 + 1n, value: P53 + 3n }],
      ["T2 u64::MAX in every field", { lockTime: U64_MAX, sequence: U64_MAX, utxoValue: U64_MAX, value: U64_MAX }],
      ["T3 small values", { lockTime: 1000n, sequence: 0n, utxoValue: 5000n, value: 4000n }]
    ] as const) {
      it(title, async () => {
        const { runner, capture } = capturingRunner(`M1-${variant}-${title.slice(0, 2)}`);
        const r = await run(runner, f);
        expect(r.status, r.stderr).toBe("SCRIPT_VM_PASS");
        expect(writtenU64(capture)).toEqual({
          lockTime: [String(f.lockTime)],
          sequence: [String(f.sequence)],
          utxoValue: [String(f.utxoValue)],
          value: [String(f.value)]
        });
      });
    }
  });
}

// -----------------------------------------------------------------------------
// B-1 · int (and temporal) values of arguments, constructor arguments and state also reach the runner: a JS number that is
// not a safe integer has already lost its value and is refused before anything runs; an exact bigint is kept exact.
// -----------------------------------------------------------------------------

const UNSAFE = Number.MAX_SAFE_INTEGER + 2;
const OTHER_SCRIPT = `20${"11".repeat(32)}ac`;

const runWith = (runner: SilverRunner, over: { args?: unknown[]; constructorArgs?: unknown[]; inputState?: unknown; outputState?: unknown }) =>
  executeSilverVmScenario({
    source,
    artifact,
    constructorArgs: over.constructorArgs ?? constructorArgs,
    entrypoint: "list",
    args: over.args ?? [{ kind: "array", value: [] }],
    tx: {
      version: 1,
      lockTime: 0n,
      activeInputIndex: 0,
      inputs: [{ utxoValue: 5000n, ...(over.inputState ? { state: over.inputState, utxoScriptHex: OTHER_SCRIPT } : {}) }],
      outputs: [{ value: 4000n, ...(over.outputState ? { state: over.outputState, scriptHex: OTHER_SCRIPT } : {}) }]
    },
    runner,
    runnerTrust: "allow-unverified"
  } as any) as Promise<any>;

describe("B-1 · unsafe JS numbers in int values are refused before anything runs", () => {
  const cases: Array<[string, Parameters<typeof runWith>[1]]> = [
    ["U1 an int argument", { args: [{ kind: "int", value: UNSAFE }] }],
    ["U2 an int inside an array argument", { args: [{ kind: "array", value: [{ kind: "int", value: 1 }, { kind: "int", value: UNSAFE }] }] }],
    ["U3 an int inside a struct argument", { args: [{ kind: "object", value: { a: { kind: "int", value: UNSAFE } } }] }],
    ["U4 a constructor argument", { constructorArgs: [{ kind: "int", value: UNSAFE }, ...constructorArgs.slice(1)] }],
    ["U5 a state field of an input with its own script", { inputState: { value: { kind: "int", value: UNSAFE } } }],
    ["U6 a state field of an output with its own script", { outputState: { value: { kind: "int", value: UNSAFE } } }],
    ["U7 a fraction in a state field", { outputState: { value: { kind: "int", value: 1.5 } } }]
  ];
  for (const [title, over] of cases) {
    it(`${title}: SILVER_VM_NUMBER_UNSAFE, the runner never starts`, async () => {
      const { runner, capture } = capturingRunner(`B1-${title.slice(0, 2)}`);
      await expect(runWith(runner, over)).rejects.toThrow(/^SILVER_VM_NUMBER_UNSAFE: /);
      expect(fs.existsSync(capture)).toBe(false);
    });
  }
});

describe("B-1 · exact bigints in int values are kept exact", () => {
  it("K1 an int argument of 2^63 - 1 and state fields of 2^53 + 1 and -(2^63 - 1) reach the runner digit for digit", async () => {
    const { runner, capture } = capturingRunner("B1-K1");
    const big = (1n << 63n) - 1n;
    const r = await runWith(runner, {
      args: [{ kind: "array", value: [{ kind: "int", value: big }] }],
      inputState: { value: { kind: "int", value: P53 + 1n } },
      outputState: { value: { kind: "int", value: -big } }
    });
    expect(r.status, r.stderr).toBe("SCRIPT_VM_PASS");
    const text = fs.readFileSync(capture, "utf8");
    // N-12: inside the array argument the int is an exact JSON integer (the runner refuses a string there)
    expect(text).toMatch(new RegExp(`"args":\\s*\\[\\s*\\[\\s*${big}\\s*\\]`));
    // state values the runner reads as strings when they are past 2^53
    expect(text).toContain(`"${P53 + 1n}"`);
    expect(text).toContain(`"${-big}"`);
  });
});

// -----------------------------------------------------------------------------
// N-3 · the scenario's numbers are checked before anything else, the runner's resolution and trust policy included: an
// unsafe or out-of-range value is a usage error whatever the runner, never hidden behind a BLOCKED result.
// N-4 · the small fields have their own ranges in the runner's test file (version u16, prev_index u32, sig_op_count u8,
// authorizing_input u16, active_input_index an index of the inputs); a bigint there is written as a plain JSON integer.
// -----------------------------------------------------------------------------

const baseRequest = {
  source,
  artifact,
  constructorArgs,
  entrypoint: "list",
  args: [{ kind: "array", value: [] }]
};

describe("N-3 · the scenario's numbers are checked before the runner is resolved or judged", () => {
  it("Q1 an unsafe lockTime with an UNVERIFIED runner and no opt-in: SILVER_VM_NUMBER_UNSAFE, not BLOCKED", async () => {
    const { runner, capture } = capturingRunner("Q1");
    const tx = { version: 1, lockTime: Number.MAX_SAFE_INTEGER + 2, activeInputIndex: 0, inputs: [{ utxoValue: 5000n }], outputs: [{ value: 5000n }] };
    await expect(executeSilverVmScenario({ ...baseRequest, tx, runner, runnerTrust: "require-verified" } as any)).rejects.toThrow(/^SILVER_VM_NUMBER_UNSAFE: /);
    expect(fs.existsSync(capture)).toBe(false);
  });

  it("Q2 a negative output value with no runner configured: SILVER_VM_NUMBER_OUT_OF_RANGE, not BLOCKED", async () => {
    const tx = { version: 1, lockTime: 0n, activeInputIndex: 0, inputs: [{ utxoValue: 5000n }], outputs: [{ value: -1n }] };
    await expect(executeSilverVmScenario({ ...baseRequest, tx } as any)).rejects.toThrow(/^SILVER_VM_NUMBER_OUT_OF_RANGE: /);
  });
});

describe("N-4 · the small fields are integers of their own range", () => {
  const small = (over: Record<string, unknown>, input: Record<string, unknown> = {}, output: Record<string, unknown> = {}) => ({
    version: 1,
    lockTime: 0n,
    activeInputIndex: 0,
    inputs: [{ utxoValue: 5000n, ...input }],
    outputs: [{ value: 4000n, ...output }],
    ...over
  });
  const cases: Array<[string, unknown, RegExp]> = [
    ["version 65536", small({ version: 65536 }), /^SILVER_VM_NUMBER_OUT_OF_RANGE: version/],
    ["prevIndex 2^32", small({}, { prevIndex: 2 ** 32 }), /^SILVER_VM_NUMBER_OUT_OF_RANGE: inputs\[0\]\.prevIndex/],
    ["sigOpCount 256", small({}, { sigOpCount: 256 }), /^SILVER_VM_NUMBER_OUT_OF_RANGE: inputs\[0\]\.sigOpCount/],
    ["sigOpCount 1.5", small({}, { sigOpCount: 1.5 }), /^SILVER_VM_NUMBER_UNSAFE: inputs\[0\]\.sigOpCount/],
    ["authorizingInput 65536", small({}, {}, { authorizingInput: 65536 }), /^SILVER_VM_NUMBER_OUT_OF_RANGE: outputs\[0\]\.authorizingInput/],
    ["activeInputIndex 1 with one input", small({ activeInputIndex: 1 }), /^SILVER_VM_NUMBER_OUT_OF_RANGE: activeInputIndex/]
  ];
  it("Z the active input's signature script is the runner's own: signatureScriptHex there is refused (review I-7)", async () => {
    const { runner, capture } = capturingRunner("Z-active-sigscript");
    const tx = small({}, { signatureScriptHex: "00" });
    await expect(executeSilverVmScenario({ ...baseRequest, tx, runner, runnerTrust: "allow-unverified" } as any)).rejects.toThrow(/^SILVER_VM_SCENARIO_INVALID: inputs\[0\]\.signatureScriptHex/);
    expect(fs.existsSync(capture)).toBe(false);
  });
  for (const [title, tx, err] of cases) {
    it(`Z ${title}: refused before the runner starts`, async () => {
      const { runner, capture } = capturingRunner(`Z-${title.replace(/\W+/g, "-")}`);
      await expect(executeSilverVmScenario({ ...baseRequest, tx, runner, runnerTrust: "allow-unverified" } as any)).rejects.toThrow(err);
      expect(fs.existsSync(capture)).toBe(false);
    });
  }

  describe("with a host BigInt.prototype.toJSON (toString)", () => {
    beforeAll(() => {
      Object.defineProperty(BigInt.prototype, "toJSON", { value: function (this: bigint) { return this.toString(); }, configurable: true, writable: true });
    });
    afterAll(() => {
      delete (BigInt.prototype as any).toJSON;
    });

    it("Z bigints in the small fields are written as plain JSON integers", async () => {
      const { runner, capture } = capturingRunner("Z-bigint-small");
      const tx = small({ version: 1n, activeInputIndex: 0n }, { prevIndex: 7n, sigOpCount: 3n }, { authorizingInput: 0n });
      const r = await executeSilverVmScenario({ ...baseRequest, tx, runner, runnerTrust: "allow-unverified" } as any);
      expect(r.status, r.stderr).toBe("SCRIPT_VM_PASS");
      const test = JSON.parse(fs.readFileSync(capture, "utf8")).tests[0].tx;
      expect([test.version, test.active_input_index, test.inputs[0].prev_index, test.inputs[0].sig_op_count, test.outputs[0].authorizing_input]).toEqual([1, 0, 7, 3, 0]);
    });
  });
});
