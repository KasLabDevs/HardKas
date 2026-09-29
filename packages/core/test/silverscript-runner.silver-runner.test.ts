import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  compileSilverScript,
  loadManagedKaspaWasmSync,
  prepareSilverVmTests,
  resolveSilverRunner,
  runSilverVmTests,
  type SilArtifactValue
} from "../src/index.js";

// Runner level: verdicts of the official SilverScript runner through the
// adapter. Preconditions: the pinned silverc installed for the HARDKAS_HOME in
// use, and HARDKAS_SILVER_RUNNER naming a cli-debugger built from the pinned
// SilverScript release. Without either the suite fails; it never skips.

const CORPUS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "fixtures", "toccata-v2", "silver");
const runner = resolveSilverRunner();
const k = loadManagedKaspaWasmSync();
const keyOf = (name: string) => createHash("sha256").update(`hardkas-silver-runner-level-${name}`).digest("hex");
const xonly = (name: string) => String(new k.PrivateKey(keyOf(name)).toPublicKey().toXOnlyPublicKey().toString());
const bytes = (hex: string): SilArtifactValue => ({ kind: "bytes", value: [...Buffer.from(hex, "hex")] });
const signer = (account: string) => keyOf(account);
const oneOut = (value: number, sequence = 0) => ({
  version: 0,
  inputs: [{ utxo_value: 1_000_000_000, sig_op_count: 1, sequence }],
  outputs: [{ value, script_hex: `20${xonly("bob")}ac` }]
});

async function run(source: string, constructorArgs: SilArtifactValue[], tests: unknown[], artifactArgs = constructorArgs) {
  const { artifact } = await compileSilverScript({ source, constructorArgs: artifactArgs });
  const prepared = await prepareSilverVmTests({ artifact, constructorArgs, tests: { tests }, signer });
  const results = await runSilverVmTests({ runner, source, prepared });
  return Object.fromEntries(results.map((r) => [r.name, r.runnerStatus ?? r.outcome]));
}

describe("official SilverScript runner through the adapter", () => {
  it("arguments: a failing require is a failure, and expect fail turns it into an expected one", async () => {
    const GUESS = "pragma silverscript ^0.1.0;\n\ncontract Guess(int secret) {\n    entry open(int guess) {\n        require(guess == secret);\n    }\n}\n";
    expect(
      await run(GUESS, [{ kind: "int", value: 42 }], [
        { name: "right", function: "open", args: ["42"], expect: "pass", tx: oneOut(900_000_000) },
        { name: "wrong", function: "open", args: ["41"], expect: "pass", tx: oneOut(900_000_000) },
        { name: "wrong-expected", function: "open", args: ["41"], expect: "fail", tx: oneOut(900_000_000) },
        { name: "right-marked-fail", function: "open", args: ["42"], expect: "fail", tx: oneOut(900_000_000) },
        // A name that looks like a flag still reaches the runner as a name.
        { name: "-right", function: "open", args: ["42"], expect: "pass", tx: oneOut(900_000_000) }
      ])
    ).toEqual({ right: "PASS", wrong: "FAIL", "wrong-expected": "PASS (expected failure)", "right-marked-fail": "FAIL", "-right": "PASS" });
  });

  it("signatures: HardKAS signs for local accounts over the runner's scenario, bound to the compiled lock", async () => {
    const SIGNED = fs.readFileSync(path.join(CORPUS, "p2sh-signed-release", "contract.sil"), "utf8");
    const tests = [
      { name: "owner", function: "release", args: [{ signature: "alice" }], expect: "pass", tx: oneOut(900_000_000) },
      { name: "other-key", function: "release", args: [{ signature: "bob" }], expect: "pass", tx: oneOut(900_000_000) },
      { name: "owner-default-scenario", function: "release", args: [{ signature: "alice" }], expect: "pass" }
    ];
    expect(await run(SIGNED, [bytes(xonly("alice"))], tests)).toEqual({ owner: "PASS", "other-key": "FAIL", "owner-default-scenario": "PASS" });
    // Control: signed over another instance's lock (artifact for carol), run on alice's instance: the signature does not bind.
    expect(await run(SIGNED, [bytes(xonly("alice"))], tests.slice(0, 1), [bytes(xonly("carol"))])).toEqual({ owner: "FAIL" });
  });

  it("relative timelock: the input sequence against the contract's period", async () => {
    const TIMEOUT = fs.readFileSync(path.join(CORPUS, "p2sh-transfer-with-timeout", "contract.sil"), "utf8");
    const ctor = [bytes(xonly("alice")), bytes(xonly("bob")), { kind: "int", value: 500 } as SilArtifactValue];
    expect(
      await run(TIMEOUT, ctor, [
        { name: "early", function: "reclaim", args: [{ signature: "alice" }], expect: "pass", tx: oneOut(900_000_000, 499) },
        { name: "at-period", function: "reclaim", args: [{ signature: "alice" }], expect: "pass", tx: oneOut(900_000_000, 500) }
      ])
    ).toEqual({ early: "FAIL", "at-period": "PASS" });
  });

  it("covenant transition: a wrong successor fails in the script; a wrong covenant id fails before it", async () => {
    const COUNTER = fs.readFileSync(path.join(CORPUS, "covenant-counter-transition", "current.sil"), "utf8");
    const id = `0x${"11".repeat(32)}`;
    const bump = (successor: number, outputId = id) => ({
      active_input_index: 0,
      inputs: [{ utxo_value: 1_000_000_000, covenant_id: id, state: { value: 7 } }],
      outputs: [{ value: 999_000_000, covenant_id: outputId, state: { value: successor }, authorizing_input: 0 }]
    });
    expect(
      await run(COUNTER, [{ kind: "int", value: 7 }], [
        { name: "bump", function: "bump", args: ["5"], expect: "pass", tx: bump(12) },
        { name: "wrong-successor", function: "bump", args: ["5"], expect: "fail", tx: bump(13) },
        // The runner rejects the scenario before the script runs, so this is not an "expected failure".
        { name: "other-covenant-id", function: "bump", args: ["5"], expect: "fail", tx: bump(12, `0x${"22".repeat(32)}`) }
      ])
    ).toEqual({ bump: "PASS", "wrong-successor": "PASS (expected failure)", "other-covenant-id": "FAIL" });
  });
});
