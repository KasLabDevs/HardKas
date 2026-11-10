import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { parseSilArtifactValuesJson } from "@hardkas/core";
import { readExactJson, readExactTestsJson, readExactValuesJson } from "../src/commands/silver-dev-framework.js";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// -----------------------------------------------------------------------------
// ISSUE-ONCHAIN-JSON-PRECISION-1, N-2 and P-1 · develop's on-chain commands read their argument, next-state and spec files
// with JSON.parse (a number past 2^53 rounded without a word) and `silver test --tests` rewrote 1e3 as 1000. They now read
// by the --constructor-args rule: each number by its literal, a fraction or an exponent refused, a larger integer kept as
// its exact digits, an int's string form decimal digits only. Canonical level: the CLI checks run where a command reads
// its file before any compiler, runner or node.
// -----------------------------------------------------------------------------

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e: any) {
    return e?.code;
  }
};

describe("ISSUE-ONCHAIN-JSON-PRECISION-1 · the exact readers", () => {
  it("readExactValuesJson keeps a larger int exact in any key order, and the core parser reads it exactly", () => {
    const raw = readExactValuesJson('[{"value":9007199254740993,"kind":"int"},{"kind":"signature","account":"alice"}]', "--args") as any[];
    expect(raw[0]).toEqual({ value: "9007199254740993", kind: "int" });
    expect(raw[1]).toEqual({ kind: "signature", account: "alice" });
    expect(parseSilArtifactValuesJson(JSON.stringify([raw[0]]))[0]!.value).toBe(9007199254740993n);
  });

  it("readExactValuesJson refuses a fraction or an exponent (SILVER_JSON_NUMBER_UNSAFE), an int string that is not digits (SILVER_JSON_INT_INVALID), text that is not JSON (SILVER_ARGS_INVALID)", () => {
    expect(code(() => readExactValuesJson('[{"kind":"int","value":1e3}]', "--args"))).toBe("SILVER_JSON_NUMBER_UNSAFE");
    expect(code(() => readExactValuesJson('{"count":{"value":1.0000000000000001,"kind":"int"}}', "--next-state"))).toBe("SILVER_JSON_NUMBER_UNSAFE");
    expect(code(() => readExactValuesJson('[{"kind":"int","value":"0x10"}]', "--args"))).toBe("SILVER_JSON_INT_INVALID");
    expect(code(() => readExactValuesJson("[{", "--args"))).toBe("SILVER_ARGS_INVALID");
  });

  // SC-09 (7-nov-2026): this test also pinned 9007199254740993 as refused by the --tests reader, which was the defect (a
  // u64 amount past 2^53 could not be written at all). The --tests reader is now readExactTestsJson and keeps it exact
  // (silver-test-exact-numbers-sc09.test.ts); readExactJson (kcc) still refuses it.
  it("N-2 · the --tests reader refuses 1e3, 1.0000000000000001 and 0.0 instead of rewriting them; a larger integer is kept exact (SC-09)", () => {
    for (const lit of ["1e3", "1.0000000000000001", "0.0"]) {
      expect(code(() => readExactTestsJson(`{"tests":[{"tx":{"inputs":[{"utxo_value":${lit}}]}}]}`, "--tests")), lit).toBe("SILVER_JSON_NUMBER_UNSAFE");
      expect(code(() => readExactJson(`{"tests":[{"tx":{"inputs":[{"utxo_value":${lit}}]}}]}`, "--tests")), lit).toBe("SILVER_JSON_NUMBER_UNSAFE");
    }
    expect(code(() => readExactJson('{"tests":[{"tx":{"inputs":[{"utxo_value":9007199254740993}]}}]}', "--tests"))).toBe("SILVER_JSON_NUMBER_UNSAFE");
    expect(JSON.stringify(readExactTestsJson('{"tests":[{"tx":{"inputs":[{"utxo_value":9007199254740993}]}}]}', "--tests"))).toBe('{"tests":[{"tx":{"inputs":[{"utxo_value":9007199254740993}]}}]}');
    expect(readExactTestsJson('{"tests":[{"tx":{"inputs":[{"utxo_value":1000}]}}]}', "--tests")).toEqual({ tests: [{ tx: { inputs: [{ utxo_value: 1000 }] } }] });
  });

  it("silver.ts reads no argument, next-state, spec or tests file with a bare JSON.parse any more", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../src/commands/silver.ts"), "utf8");
    const parses = src.split(/\r?\n/).filter((l) => /JSON\.parse\(/.test(l));
    // the remaining ones read a HardKAS record, its embedded artifact, the --state-map option and the engine's mass
    for (const line of parses) expect(line, line.trim()).toMatch(/"record"|artifactJson|opts\.stateMap|r\.mass/);
    for (const fn of ["async function engineEntryArgs", "async function entryArgs"]) {
      const body = src.slice(src.indexOf(fn), src.indexOf("\n}\n", src.indexOf(fn)));
      expect(body, fn).toMatch(/readExactValuesJson\(/);
    }
  });
});

describe("ISSUE-ONCHAIN-JSON-PRECISION-1 · `silver engine plan` reads its spec exactly (built CLI, before any SDK or node)", () => {
  let ws = "";
  beforeAll(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-onchain-json-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    fs.writeFileSync(path.join(ws, "spec-exponent.json"), '{"contract":"x","args":[{"kind":"int","value":1e3}]}');
    fs.writeFileSync(path.join(ws, "spec-hex.json"), '{"contract":"x","args":[{"kind":"int","value":"0x10"}]}');
    fs.writeFileSync(path.join(ws, "spec-broken.json"), '{"contract":');
  });
  afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));
  const run = (args: string[]) => {
    const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, env: childEnv({ NO_COLOR: "1" }), encoding: "utf8", timeout: 60_000 });
    return { exit: r.status, text: `${r.stdout}\n${r.stderr}` };
  };

  it("an exponent is SILVER_JSON_NUMBER_UNSAFE, a hex int string SILVER_JSON_INT_INVALID, broken JSON SILVER_ENGINE_SPEC_INVALID: all exit 2", () => {
    const exp = run(["silver", "engine", "plan", "genesis", "spec-exponent.json", "--json"]);
    expect(exp.exit, exp.text.slice(0, 600)).toBe(2);
    expect(exp.text).toMatch(/SILVER_JSON_NUMBER_UNSAFE/);
    const hex = run(["silver", "engine", "plan", "genesis", "spec-hex.json", "--json"]);
    expect(hex.exit, hex.text.slice(0, 600)).toBe(2);
    expect(hex.text).toMatch(/SILVER_JSON_INT_INVALID/);
    const broken = run(["silver", "engine", "plan", "genesis", "spec-broken.json", "--json"]);
    expect(broken.exit, broken.text.slice(0, 600)).toBe(2);
    expect(broken.text).toMatch(/SILVER_ENGINE_SPEC_INVALID/);
  });
});
