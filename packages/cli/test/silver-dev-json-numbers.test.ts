import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv, repoRoot } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 60_000 });

// -----------------------------------------------------------------------------
// H-B1 · `silver preflight` and `silver debug` read --state, --next-state and --args as JSON, whose numbers are doubles: a
// number that is not an exact integer below 2^53 would reach the VM rounded. Both commands refuse it before they compile or
// run anything (exit 2, SILVER_JSON_NUMBER_UNSAFE, naming where it is); a larger integer goes exact as
// {"kind":"int","value":"<digits>"}. Canonical level: neither silverc nor a runner.
// -----------------------------------------------------------------------------

const OWNED = path.join(repoRoot, "examples", "09-silver-reference", "contracts", "owned-counter.sil");
let ws = "";
beforeAll(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-silver-json-numbers-"));
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), 'export default { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };\n');
  fs.writeFileSync(path.join(ws, "next-state-float.json"), '{"value": 1.5}');
  fs.writeFileSync(path.join(ws, "state-u64max.json"), '{"value": {"kind": "int", "value": 18446744073709551615}}');
  // N-1: OwnedCounter(pubkey owner, int init_value) constructor arguments whose int is not a plain safe integer literal
  const owner = `{"kind":"bytes","value":[${new Array(32).fill(7).join(",")}]}`;
  for (const [name, init] of Object.entries(CTOR_INITS)) fs.writeFileSync(path.join(ws, `ctor-${name}.json`), `[${owner},${init}]`);
});

const CTOR_INITS: Record<string, string> = {
  "value-first-exponent": '{"value":1e3,"kind":"int"}',
  "middle-key-fraction": '{"kind":"int","note":0,"value":4.9999999999999999}',
  "canonical-fraction": '{"kind":"int","value":5.0}',
  "value-first-fraction": '{"value":1.0000000000000001,"kind":"int"}',
  "canonical-exponent": '{"kind":"int","value":1e3}',
  "string-fraction": '{"kind":"int","value":"5.0"}'
};
afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));

const run = (args: string[]) => {
  const env = childEnv({ NO_COLOR: "1" });
  delete env.HARDKAS_SILVER_RUNNER;
  delete env.HARDKAS_SILVER_RUNNER_TRUST;
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, env, encoding: "utf8", timeout: 60_000 });
  return { exit: r.status, text: `${r.stdout}\n${r.stderr}` };
};

const ARGS = '[{"kind":"int","value":5},{"kind":"signer","signer":"owner"}]';

describe("H-B1 · inexact JSON numbers are refused before anything runs", () => {
  const cases: Array<[string, string[], string]> = [
    ["J1 preflight --state inline 2^53 + 1", ["preflight", OWNED, "--entry", "bump", "--demo-fixture", "--state", '{"value": 9007199254740993}'], "--state.value"],
    ["J2 preflight --next-state file with 1.5", ["preflight", OWNED, "--entry", "bump", "--demo-fixture", "--next-state", "next-state-float.json"], "--next-state.value"],
    ["J3 debug --args with an int value of 2^53 + 1", ["debug", OWNED, "--entry", "bump", "--demo-fixture", "--args", '[{"kind":"int","value":9007199254740993},{"kind":"signer","signer":"owner"}]'], "--args[0].value"],
    ["J4 debug --state file with u64::MAX as a JSON number", ["debug", OWNED, "--entry", "bump", "--demo-fixture", "--state", "state-u64max.json", "--args", ARGS], "--state.value.value"]
  ];
  for (const [title, args, where] of cases) {
    it(`${title}: SILVER_JSON_NUMBER_UNSAFE at ${where}, exit 2`, () => {
      const r = run(["silver", ...args, "--json"]);
      expect(r.exit, r.text.slice(0, 800)).toBe(2);
      expect(r.text).toContain("SILVER_JSON_NUMBER_UNSAFE");
      expect(r.text).toContain(where);
    });
  }

});

// -----------------------------------------------------------------------------
// B-2 · the check reads each number's own literal (JSON.parse's context.source), not the double it became: a fraction or an
// exponent that a double turns into a safe integer is refused too. Deliberate rule: a JSON number is accepted only as a
// plain integer literal between -(2^53 - 1) and 2^53 - 1; 5.0, 1e3 or 1E+2 are refused although their value is an
// integer. That the accepted forms reach the VM exactly is shown end to end at the runner level
// (silver-dev-json-numbers.silver-runner.test.ts).
// -----------------------------------------------------------------------------

describe("B-2 · JSON literals that are not plain integers are refused before anything runs", () => {
  const cases: Array<[string, string[], string, string]> = [
    ["L1 --state 1.0000000000000001 (reads as 1)", ["preflight", OWNED, "--entry", "bump", "--demo-fixture", "--state", '{"value": 1.0000000000000001}'], "--state.value", "1.0000000000000001"],
    ["L2 --args delta 4.9999999999999999 (reads as 5)", ["debug", OWNED, "--entry", "bump", "--demo-fixture", "--args", '[{"kind":"int","value":4.9999999999999999},{"kind":"signer","signer":"owner"}]'], "--args[0].value", "4.9999999999999999"],
    ["L3 --next-state 1e-400 (reads as 0)", ["preflight", OWNED, "--entry", "bump", "--demo-fixture", "--next-state", '{"value": 1e-400}'], "--next-state.value", "1e-400"],
    ["L4 deliberate rule: 5.0", ["debug", OWNED, "--entry", "bump", "--demo-fixture", "--state", '{"value": 5.0}'], "--state.value", "5.0"],
    ["L5 deliberate rule: 1e3", ["preflight", OWNED, "--entry", "bump", "--demo-fixture", "--next-state", '{"value": 1e3}'], "--next-state.value", "1e3"],
    ["L6 deliberate rule: -0.0 inside --args", ["debug", OWNED, "--entry", "bump", "--demo-fixture", "--args", '[{"kind":"int","value":-0.0},{"kind":"signer","signer":"owner"}]'], "--args[0].value", "-0.0"]
  ];
  for (const [title, args, where, literal] of cases) {
    it(`${title}: SILVER_JSON_NUMBER_UNSAFE at ${where}, naming the literal, exit 2`, () => {
      const r = run(["silver", ...args, "--json"]);
      expect(r.exit, r.text.slice(0, 800)).toBe(2);
      expect(r.text).toContain("SILVER_JSON_NUMBER_UNSAFE");
      expect(r.text).toContain(where);
      expect(r.text).toContain(literal);
    });
  }
});

// -----------------------------------------------------------------------------
// N-7 · the exact form of an int, {"kind":"int","value":"<digits>"}, must be decimal digits: BigInt() would otherwise read
// "" as 0, "0x10" as 16 and " 10 " as 10 without a word. Refused before anything runs (exit 2, SILVER_JSON_INT_INVALID),
// in --state, --next-state, --args and the constructor arguments alike.
// -----------------------------------------------------------------------------

describe("N-7 · an int written as a string must be decimal digits", () => {
  const cases: Array<[string, string[], string, string]> = [
    ["S1 --state 0x10", ["preflight", OWNED, "--entry", "bump", "--demo-fixture", "--state", '{"value":{"kind":"int","value":"0x10"}}'], "--state.value.value", '"0x10"'],
    ["S2 --args an empty string", ["debug", OWNED, "--entry", "bump", "--demo-fixture", "--args", '[{"kind":"int","value":""},{"kind":"signer","signer":"owner"}]'], "--args[0].value", '""'],
    ["S3 --next-state with spaces", ["preflight", OWNED, "--entry", "bump", "--demo-fixture", "--next-state", '{"value":{"kind":"int","value":" 10 "}}'], "--next-state.value.value", '" 10 "'],
    ["S4 --constructor-args 5.0 as a string", ["debug", OWNED, "--entry", "bump", "--demo-fixture", "--constructor-args", "ctor-string-fraction.json"], "--constructor-args[1].value", '"5.0"']
  ];
  for (const [title, args, where, literal] of cases) {
    it(`${title}: SILVER_JSON_INT_INVALID at ${where}, exit 2`, () => {
      const r = run(["silver", ...args, "--json"]);
      expect(r.exit, r.text.slice(0, 800)).toBe(2);
      expect(r.text).toContain("SILVER_JSON_INT_INVALID");
      expect(r.text).toContain(where);
      // the literal is quoted in the message, and the --json error envelope escapes those quotes
      expect(r.text).toContain(JSON.stringify(literal).slice(1, -1));
    });
  }
});

// -----------------------------------------------------------------------------
// N-1 · the constructor arguments of the dev-framework commands (--constructor-args of preflight, debug and fuzz; --args of
// audit) go through develop's {kind, value} parser, which reads an int exactly only when "kind":"int" comes right before
// "value". The same rule as B-2 now judges every number by its literal first, whatever the key order: a fraction or an
// exponent is refused before anything compiles or runs (exit 2, SILVER_JSON_NUMBER_UNSAFE). Canonical level.
// -----------------------------------------------------------------------------

describe("N-1 · constructor-argument literals that are not plain integers are refused, whatever the key order", () => {
  const cases: Array<[string, string[], string, string]> = [
    ["N1 preflight, value before kind, 1e3", ["preflight", OWNED, "--entry", "bump", "--demo-fixture", "--constructor-args", "ctor-value-first-exponent.json"], "--constructor-args[1].value", "1e3"],
    ["N2 debug, a key between kind and value, 4.9999999999999999", ["debug", OWNED, "--entry", "bump", "--demo-fixture", "--constructor-args", "ctor-middle-key-fraction.json"], "--constructor-args[1].value", "4.9999999999999999"],
    ["N3 fuzz, canonical order, 5.0", ["fuzz", OWNED, "--entry", "bump", "--constructor-args", "ctor-canonical-fraction.json"], "--constructor-args[1].value", "5.0"],
    ["N4 audit --args, value before kind, 1.0000000000000001", ["audit", OWNED, "--args", "ctor-value-first-fraction.json"], "--args[1].value", "1.0000000000000001"],
    ["N5 audit --args, canonical order, 1e3", ["audit", OWNED, "--args", "ctor-canonical-exponent.json"], "--args[1].value", "1e3"]
  ];
  for (const [title, args, where, literal] of cases) {
    it(`${title}: SILVER_JSON_NUMBER_UNSAFE at ${where}, naming the literal, exit 2`, () => {
      const r = run(["silver", ...args, "--json"]);
      expect(r.exit, r.text.slice(0, 800)).toBe(2);
      expect(r.text).toContain("SILVER_JSON_NUMBER_UNSAFE");
      expect(r.text).toContain(where);
      expect(r.text).toContain(literal);
    });
  }
});
