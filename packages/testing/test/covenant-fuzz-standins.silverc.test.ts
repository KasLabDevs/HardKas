import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import "../src/setup.js";
import {
  createCovenantTestbed,
  fuzzCounterAuthorization,
  fuzzCounterTransitions,
  invalidSignatureHexArbitrary,
  runCovenantPropertyFuzz,
  successorStateTransitionArbitrary,
  type CompiledCovenantContract
} from "../src/index.js";

// -----------------------------------------------------------------------------
// Control 3 · the fuzz properties against stand-in runners, through the real testbed (silverc level: OwnedCounter is
// compiled with the pinned silverc; the "VM" is a node script driven as a runner object with prefixArgs, run only under
// the explicit allow-unverified opt-in). A stand-in answers every run exactly as the real cli-debugger does for a pass or
// a rejection (protocol-conformant), so the testbed takes its answers as VM verdicts:
//   always-reject  rejects every transition (its report and `Error: "FAIL"`, exit 1) at a fixed line
//   always-accept  accepts every transition (exit 0, PASS)
//   garbage        is not a runner (exit 0 without PASS)
// BEFORE: the old one-directional properties pass with a VM that rejects everything. AFTER: the bidirectional ones fail
// on it, and on one that accepts everything; a runner that gives no verdict stops the run as an infrastructure failure.
// -----------------------------------------------------------------------------

const repoRoot = path.resolve(__dirname, "../../..");
const ownedCounterSource = fs.readFileSync(path.join(repoRoot, "examples", "09-silver-reference", "contracts", "owned-counter.sil"), "utf8");
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-fuzz-standins-"));
const sha256 = (file: string) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const starts = path.join(temp, "starts.log");

const rejectReport = (line: number, text: string) =>
  `error: script ran, but verification failed\n   --> ${line}:9\n   |\n${line} |         ${text}\n   |         ^^^^ verification failed here\n   |\n\nError: "FAIL"\n`;

/** A stand-in runner: logs its start, prints `stdout`/`stderr`, exits with `code`. */
function standIn(name: string, stdout: string, stderr: string, code: number) {
  const script = path.join(temp, `${name}.mjs`);
  fs.writeFileSync(
    script,
    // hardkas-append-allow: the generated stand-in logs each start so the test can count them (test code)
    `import fs from "node:fs";\nfs.appendFileSync(${JSON.stringify(starts)}, ${JSON.stringify(name)} + "\\n");\n` +
      `process.stdout.write(${JSON.stringify(stdout)});\nprocess.stderr.write(${JSON.stringify(stderr)});\nprocess.exitCode = ${code};\n`
  );
  return { path: process.execPath, prefixArgs: [script], binarySha256: sha256(process.execPath), size: fs.statSync(process.execPath).size, provenance: "unmanaged-local-build" as const };
}
const startsOf = (name: string) => (fs.existsSync(starts) ? fs.readFileSync(starts, "utf8").split("\n").filter((l) => l === name).length : 0);

const RUNNERS = {
  rejectAt14: standIn("reject-14", "", rejectReport(14, "require(delta > 0);"), 1),
  rejectAt13: standIn("reject-13", "", rejectReport(13, "require(checkSig(s, owner));"), 1),
  accept: standIn("accept", "PASS\n", "", 0),
  garbage: standIn("garbage", "laptop\\someone\n", "", 0)
};

let ownedCounter: CompiledCovenantContract;
const bed = (runner: (typeof RUNNERS)[keyof typeof RUNNERS], runnerTrust: "allow-unverified" | "require-verified" = "allow-unverified") =>
  createCovenantTestbed({ runner, runnerTrust });

beforeAll(async () => {
  const tb = createCovenantTestbed();
  ownedCounter = await tb.compileContract({
    source: ownedCounterSource,
    sourceFile: "owned-counter.sil",
    constructorArgs: [`0x${tb.getAccount("owner").xOnlyPublicKey}`, 10n]
  });
});
afterAll(() => fs.rmSync(temp, { recursive: true, force: true }));

describe("BEFORE · the old one-directional properties pass with a VM that rejects everything", () => {
  it("SI1 the old Property 3 (seed 888002, 12 runs) passes: none of its samples is legitimate", async () => {
    const testbed = bed(RUNNERS.rejectAt14);
    let legitimate = 0;
    const report = await runCovenantPropertyFuzz(
      successorStateTransitionArbitrary({ allowInvalidDelta: true, allowStateMismatch: true }),
      async (sample) => {
        if (sample.isLegitimate) legitimate++;
        const genesis = await testbed.deployGenesis({ contract: ownedCounter, initialState: { value: sample.initialCount }, amountSompi: 1_000_000_000n });
        const res = await testbed.executeTransition({
          contract: ownedCounter,
          utxo: genesis.utxo,
          entrypoint: "bump",
          args: [
            { kind: "int", value: sample.delta },
            { kind: "signer", signer: "owner" }
          ],
          nextStates: [{ state: { value: sample.successorCount } }],
          backends: ["SYNTHETIC", "SCRIPT_VM"]
        });
        expect(res.passed).toBe(sample.isLegitimate);
        if (!sample.isLegitimate) expect(res.status).toBe("SCRIPT_VM_FAIL");
      },
      { propertyName: "state-transition-bi-implication-script-vm", backend: "SCRIPT_VM", numRuns: 12, seed: 888002 }
    );
    expect(report.passed).toBe(true);
    expect(legitimate).toBe(0);
  });

  it("SI2 the old Property 2 (forged signatures, seed 777001) passes: it never asks the VM to accept anything", async () => {
    const testbed = bed(RUNNERS.rejectAt13);
    const genesis = await testbed.deployGenesis({ contract: ownedCounter, initialState: { value: 10n }, amountSompi: 1_000_000_000n });
    const report = await runCovenantPropertyFuzz(
      invalidSignatureHexArbitrary(),
      async (forgedSigHex) => {
        const res = await testbed.executeTransition({
          contract: ownedCounter,
          utxo: genesis.utxo,
          entrypoint: "bump",
          args: [
            { kind: "int", value: 5n },
            { kind: "bytes", value: [...Buffer.from(forgedSigHex, "hex")] }
          ],
          nextStates: [{ state: { value: 15n } }],
          backends: ["SCRIPT_VM"]
        });
        expect(res.passed).toBe(false);
        expect(res.status).toBe("SCRIPT_VM_FAIL");
        expect(res.diagnostic?.location?.line).toBe(13);
      },
      { propertyName: "no-forged-signature-passes-script-vm", backend: "SCRIPT_VM", numRuns: 12, seed: 777001 }
    );
    expect(report.passed).toBe(true);
  });
});

describe("AFTER · the bidirectional properties catch a VM that rejects or accepts everything", () => {
  it("SI3 counter transitions, VM that rejects everything: COUNTEREXAMPLE at the first legitimate boundary sample", async () => {
    const r = await fuzzCounterTransitions(bed(RUNNERS.rejectAt14), ownedCounter, { deltaCheckLine: 14, seed: 888002, numRuns: 12 });
    expect(r.passed).toBe(false);
    expect(r.outcome).toBe("COUNTEREXAMPLE");
    expect(r.failure?.error).toMatch(/^expected ACCEPT, observed REJECTED by the VM at line 14/);
    expect(r.runner?.trust).toBe("UNVERIFIED");
    expect(r.runner?.prefixArgs).toEqual(RUNNERS.rejectAt14.prefixArgs);
  });

  it("SI4 authorization, VM that rejects everything (at the signature line, like a real rejection): COUNTEREXAMPLE on the authorized signature", async () => {
    const r = await fuzzCounterAuthorization(bed(RUNNERS.rejectAt13), ownedCounter, { sigCheckLine: 13, seed: 777001, numRuns: 12 });
    expect(r.outcome).toBe("COUNTEREXAMPLE");
    expect(r.failure?.error).toMatch(/^expected ACCEPT, observed REJECTED by the VM at line 13.*\[AUTHORIZED_SIGNATURE\]/);
  });

  it("SI5 counter transitions, VM that accepts everything: COUNTEREXAMPLE on an illegitimate sample", async () => {
    const r = await fuzzCounterTransitions(bed(RUNNERS.accept), ownedCounter, { deltaCheckLine: 14, seed: 888002, numRuns: 12 });
    expect(r.outcome).toBe("COUNTEREXAMPLE");
    expect(r.failure?.error).toMatch(/^expected REJECT, observed ACCEPTED/);
  });

  it("SI6 authorization, VM that accepts everything: COUNTEREXAMPLE on a forged signature (the VM accepted it; only the structural validation refused it)", async () => {
    const r = await fuzzCounterAuthorization(bed(RUNNERS.accept), ownedCounter, { sigCheckLine: 13, seed: 777001, numRuns: 12 });
    expect(r.outcome).toBe("COUNTEREXAMPLE");
    expect(r.failure?.error).toMatch(/^expected a SCRIPT_VM rejection, observed accepted by the VM but refused by the structural validation \(.+\): forged signature .*\[FORGED_SIGNATURE\]$/);
  });
});

describe("AFTER · a runner that gives no verdict stops the run as an infrastructure failure", () => {
  it("SI7 a program that is not the runner: INFRASTRUCTURE_ERROR RUNNER_PROTOCOL_ERROR, started once", async () => {
    const before = startsOf("garbage");
    const r = await fuzzCounterTransitions(bed(RUNNERS.garbage), ownedCounter, { seed: 1, numRuns: 5 });
    expect(r.outcome).toBe("INFRASTRUCTURE_ERROR");
    expect(r.failure?.kind).toBe("INFRASTRUCTURE");
    expect(r.infrastructureFailure?.outcomeClass).toBe("RUNNER_PROTOCOL_ERROR");
    expect(startsOf("garbage") - before).toBe(1);
  });

  it("SI8 the default policy refuses the UNVERIFIED runner: INFRASTRUCTURE_ERROR RUNNER_UNVERIFIED and it never starts", async () => {
    const before = startsOf("accept");
    const r = await fuzzCounterTransitions(bed(RUNNERS.accept, "require-verified"), ownedCounter, { seed: 1, numRuns: 5 });
    expect(r.outcome).toBe("INFRASTRUCTURE_ERROR");
    expect(r.infrastructureFailure?.outcomeClass).toBe("RUNNER_UNVERIFIED");
    expect(r.infrastructureFailure?.runner?.trust).toBe("UNVERIFIED");
    expect(startsOf("accept") - before).toBe(0);
  });

  it("SI9 no runner at all: INFRASTRUCTURE_ERROR RUNNER_NOT_FOUND", async () => {
    const r = await fuzzCounterTransitions(
      createCovenantTestbed({ runnerPath: path.join(temp, "no-such-runner.exe"), runnerTrust: "allow-unverified" }),
      ownedCounter,
      { seed: 1, numRuns: 5 }
    );
    expect(r.outcome).toBe("INFRASTRUCTURE_ERROR");
    expect(r.infrastructureFailure?.outcomeClass).toBe("RUNNER_NOT_FOUND");
  });
});
