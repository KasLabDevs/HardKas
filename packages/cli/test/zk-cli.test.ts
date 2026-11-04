import { describe, expect, it } from "vitest";
import { resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, cpSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { buildHardkasProgram } from "../src/program.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function repoRoot(): string {
  let current = __dirname;
  while (current !== resolve(current, "..")) {
    if (existsSync(resolve(current, "pnpm-workspace.yaml"))) return current;
    current = resolve(current, "..");
  }
  throw new Error("repo root not found");
}

describe("CLI ZK commands and truth in advertising", () => {
  const cliDist = resolve(__dirname, "../dist/index.js");
  const multiplierPath = resolve(repoRoot(), "fixtures", "toccata-v2", "zk", "groth16-multiplier");

  function runHardkas(commandString: string, timeoutMs = 60000) {
    const rawArgs =
      commandString.match(/(?:[^\s"]+|"[^"]*")+/g)?.map((s) => s.replace(/^"|"$/g, "")) ?? [];
    const r = spawnSync(process.execPath, [cliDist, ...rawArgs], {
      encoding: "utf-8",
      timeout: timeoutMs,
      env: {
        ...process.env,
        HARDKAS_TEST_IGNORE_STALENESS: "1",
        NO_COLOR: "1",
        NODE_OPTIONS: "--no-warnings"
      }
    });
    return {
      ok: r.status === 0,
      status: r.status,
      signal: r.signal,
      stdout: r.stdout ?? "",
      stderr: r.stderr ?? ""
    };
  }

  function copyZkCorpus(): string {
    const target = mkdtempSync(resolve(os.tmpdir(), "hardkas-zk-cli-"));
    cpSync(resolve(repoRoot(), "fixtures", "toccata-v2", "zk"), target, { recursive: true });
    return target;
  }

  it("help text honestly describes fixture coherence without claiming cryptographic verification", () => {
    const program = buildHardkasProgram({ forDocs: true });
    const zkCmd = program.commands.find((c) => c.name() === "zk");
    const proofCmd = zkCmd?.commands.find((c) => c.name() === "proof");
    const verifyCmd = proofCmd?.commands.find((c) => c.name() === "verify");
    expect(verifyCmd).toBeDefined();
    expect(verifyCmd?.description()).toMatch(/fixture coherence/i);
    expect(verifyCmd?.description()).not.toMatch(/cryptographically verify a zk proof/i);
    const mathCmd = proofCmd?.commands.find((c) => c.name() === "verify-math");
    expect(mathCmd?.description()).toMatch(/No on-chain claims/i);
    expect(mathCmd?.description()).toMatch(/bound to its content hashes/i);
  });

  it("zk capabilities returns explicit fixture-only and non-claimed on-chain claims", () => {
    const res = runHardkas("zk capabilities --json");
    expect(res.ok).toBe(true);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.schema).toBe("hardkas.zkCapabilities.v1");
    expect(parsed.experimental).toBe(true);
    expect(parsed.proofSystems.groth16.verifyLocal).toBe("FIXTURE_COHERENCE_ONLY");
    expect(parsed.proofSystems.groth16.verifyMath).toBe("SNARKJS_BN254_FIXTURE_BOUND");
    expect(parsed.proofSystems.groth16.trustedSetupProvenance).toBe("NOT_CLAIMED");
    expect(parsed.proofSystems.risc0.verifyLocal).toBe("RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED");
    expect(parsed.proofSystems.risc0.toccataL1Scripts).toBe("KASPA_WASM_ZK_SCRIPT_BUILDER_2_1_0");
    expect(parsed.claims.zkOnchainVerification).toBe("NOT_CLAIMED");
    expect(parsed.claims.vmConsensusEquivalence).toBe("NOT_CLAIMED");
  });

  it("zk proof inspect successfully inspects valid Groth16 fixture", () => {
    const fixturePath = resolve(repoRoot(), "fixtures", "toccata-v2", "zk", "groth16");
    const res = runHardkas(`zk proof inspect "${fixturePath}" --json`);
    expect(res.ok).toBe(true);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe("ZK_PROOF_INSPECTED");
    expect(parsed.proofSystem).toBe("groth16");
  });

  it("zk proof verify outputs ZK_FIXTURE_COHERENCE_PASS on valid fixtures", () => {
    for (const dir of ["groth16", "groth16-multiplier"]) {
      const fixturePath = resolve(repoRoot(), "fixtures", "toccata-v2", "zk", dir);
      const res = runHardkas(`zk proof verify "${fixturePath}" --json`);
      expect(res.ok).toBe(true);
      const parsed = JSON.parse(res.stdout);
      expect(parsed.ok).toBe(true);
      expect(parsed.status).toBe("ZK_FIXTURE_COHERENCE_PASS");
    }
  });

  it("zk proof verify reports ZK_FIXTURE_COHERENCE_FAILED when fixture is corrupted", () => {
    const corpus = copyZkCorpus();
    const proofPath = resolve(corpus, "groth16", "proof.json");
    const proof = JSON.parse(readFileSync(proofPath, "utf8"));
    proof.pi_a[0] = "corrupted-signal";
    writeFileSync(proofPath, JSON.stringify(proof, null, 2));
    try {
      const res = runHardkas(`zk proof verify "${resolve(corpus, "groth16")}" --json`);
      expect(res.ok).toBe(false);
      expect(res.status).toBe(1);
      expect(res.stdout + res.stderr).toMatch(/ZK_FIXTURE_COHERENCE_FAILED|ZK_FIXTURE_COHERENCE_FAIL/);
    } finally {
      rmSync(corpus, { recursive: true, force: true });
    }
  });

  it("zk corpus verify succeeds on the shipping toccata-v2 fixtures and covers all four of them", () => {
    const corpusPath = resolve(repoRoot(), "fixtures", "toccata-v2", "zk");
    const res = runHardkas(`zk corpus verify "${corpusPath}" --json`, 120000);
    expect(res.ok).toBe(true);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.status).toBe("ZK_CORPUS_VERIFICATION_PASS");
    expect(parsed.summary.fixturesChecked).toBe(4);
    expect(parsed.summary.mathChecked).toBe(1);
  });

  it("zk proof verify-math rejects the toy multiplier key by default (known trapdoor)", () => {
    const res = runHardkas(`zk proof verify-math "${multiplierPath}" --json`);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(1);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(parsed.summary.verificationKeyStrength).toBe("WEAK_TRAPDOOR_SUSPECTED");
    expect(parsed.issues.some((i: any) => i.code === "ZK_VERIFICATION_KEY_WEAK_TRAPDOOR")).toBe(true);
  });

  it("zk proof verify-math --allow-weak-vk computes the pairing, bound to the fixture, and names the digests", () => {
    const res = runHardkas(`zk proof verify-math "${multiplierPath}" --json --allow-weak-vk`);
    expect(res.ok).toBe(true);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.verified).toBe(true);
    expect(parsed.status).toBe("ZK_GROTH16_MATH_VERIFIED");
    expect(parsed.engine).toBe("snarkjs-bn254");
    expect(parsed.summary.binding).toBe("FIXTURE_COHERENCE");
    expect(parsed.summary.verificationKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(parsed.claims.zkMathematicalVerification).toBe("GROTH16_SNARKJS_BN254_FIXTURE_BOUND");
    expect(parsed.claims.zkOnchainVerification).toBe("NOT_CLAIMED");
  });

  it("zk proof verify-math refuses an incoherent fixture unless --math-only is given, and then fails the pairing", () => {
    const target = mkdtempSync(resolve(os.tmpdir(), "hardkas-zk-cli-mult-"));
    cpSync(multiplierPath, target, { recursive: true });
    const inputsPath = resolve(target, "public-inputs.json");
    const inputs = JSON.parse(readFileSync(inputsPath, "utf8"));
    inputs.publicSignals = ["34"];
    writeFileSync(inputsPath, JSON.stringify(inputs, null, 2));
    try {
      const bound = runHardkas(`zk proof verify-math "${target}" --json --allow-weak-vk`);
      expect(bound.status).toBe(1);
      const boundParsed = JSON.parse(bound.stdout);
      expect(boundParsed.status).toBe("ZK_GROTH16_MATH_REJECTED");
      expect(boundParsed.issues.some((i: any) => i.code === "ZK_FIXTURE_INCOHERENT")).toBe(true);

      const unbound = runHardkas(`zk proof verify-math "${target}" --json --allow-weak-vk --math-only`);
      expect(unbound.status).toBe(1);
      const unboundParsed = JSON.parse(unbound.stdout);
      expect(unboundParsed.summary.binding).toBe("MATH_ONLY");
      expect(unboundParsed.claims.zkMathematicalVerification).toBe("GROTH16_SNARKJS_BN254_MATH_ONLY");
      expect(unboundParsed.issues.some((i: any) => i.code === "ZK_GROTH16_PAIRING_FAILED")).toBe(true);
    } finally {
      rmSync(target, { recursive: true, force: true });
    }
  });

  it("zk proof verify-math --expect-vk-hash pins the verification key", () => {
    const ok = runHardkas(`zk proof verify-math "${multiplierPath}" --json --allow-weak-vk`);
    const vkHash = JSON.parse(ok.stdout).summary.verificationKeyHash as string;
    const pinned = runHardkas(`zk proof verify-math "${multiplierPath}" --json --allow-weak-vk --expect-vk-hash ${vkHash}`);
    expect(pinned.ok).toBe(true);
    const wrong = runHardkas(`zk proof verify-math "${multiplierPath}" --json --allow-weak-vk --expect-vk-hash ${"0".repeat(64)}`);
    expect(wrong.status).toBe(1);
    expect(JSON.parse(wrong.stdout).issues.some((i: any) => i.code === "ZK_VERIFICATION_KEY_HASH_MISMATCH")).toBe(true);
    const malformed = runHardkas(`zk proof verify-math "${multiplierPath}" --json --expect-vk-hash nope`);
    expect(malformed.status).toBe(2);
  });

  it("zk proof verify-math validates --timeout and always exits after a timeout (M-07)", () => {
    const invalid = runHardkas(`zk proof verify-math "${multiplierPath}" --json --timeout abc`);
    expect(invalid.status).toBe(2);
    expect(invalid.stdout + invalid.stderr).toMatch(/ZK_TIMEOUT_INVALID/);

    const started = Date.now();
    const timedOut = runHardkas(`zk proof verify-math "${multiplierPath}" --json --allow-weak-vk --timeout 1`, 30000);
    expect(timedOut.signal).toBeNull(); // not killed by the test harness: the process exited by itself
    expect(timedOut.status).toBe(1);
    expect(Date.now() - started).toBeLessThan(30000);
    const parsed = JSON.parse(timedOut.stdout);
    expect(parsed.status).toBe("ZK_GROTH16_VERIFIER_ERROR");
    expect(parsed.verified).toBe(false);
  });

  it("zk proof verify-math without --json prints a human summary", () => {
    const res = runHardkas(`zk proof verify-math "${multiplierPath}" --allow-weak-vk`);
    expect(res.ok).toBe(true);
    expect(res.stdout).toMatch(/status: ZK_GROTH16_MATH_VERIFIED/);
    expect(res.stdout).toMatch(/summary\.binding: FIXTURE_COHERENCE/);
    expect(() => JSON.parse(res.stdout)).toThrow();
  });

  it("zk toccata rules outputs the precompile facts", () => {
    const res = runHardkas("zk toccata rules --json");
    expect(res.ok).toBe(true);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.opcode).toBe("0xa6");
    expect(parsed.tag).toBe("0x20");
    expect(parsed.curve).toBe("BN254");
    expect(parsed.groth16PrecompileCostGrams).toBe(140000);
    expect(parsed.recommendedComputeBudget).toBe(1600);
    expect(parsed.computeBudgetGramsEquivalent).toBeUndefined();
  });

  it("zk toccata build-scripts builds valid scripts from official RISC Zero receipt file", () => {
    const fixtureDir = resolve(repoRoot(), "fixtures", "toccata-v2", "zk", "r0-groth16-official");
    const receiptPath = resolve(fixtureDir, "receipt.hex");
    const imageId = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
    const journalHash = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";
    const res = runHardkas(
      `zk toccata build-scripts --image-id ${imageId} --journal-hash ${journalHash} --receipt "${receiptPath}" --json`
    );
    expect(res.ok).toBe(true);
    const parsed = JSON.parse(res.stdout);
    expect(parsed.ok).toBe(true);
    expect(parsed.redeemScript.length).toBe(1602);
    expect(parsed.sigScript.length).toBe(1934);
    expect(parsed.p2shAddresses.testnet10).toBe(
      "kaspatest:prr6mc7myqn2umzt758qhv2gnvahrqapq0d5zwul4y5t55gexw55gcz66pvdf"
    );
    expect(parsed.warnings.some((w: any) => w.code === "ZK_RECEIPT_CLAIM_NOT_CROSSCHECKED")).toBe(true);
  });
});
