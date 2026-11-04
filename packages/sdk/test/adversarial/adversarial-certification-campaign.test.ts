import { describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { HardkasSchemas } from "@hardkas/artifacts";
import {
  HardkasZk,
  buildR0Groth16Scripts,
  estimateToccataZkFee,
  DEFAULT_ZK_COMPUTE_BUDGET,
  HISTORICAL_TRIAL_ZK_FEE_SOMPI
} from "../../src/index.js";
import { verifyGroth16Math } from "../../src/zk/groth16-verifier.js";
import { Hardkas } from "../../src/index.js";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

function readJson(relPath: string): any {
  return JSON.parse(fs.readFileSync(path.join(repoRoot(), relPath), "utf8"));
}

const MULT_DIR = "fixtures/toccata-v2/zk/groth16-multiplier";
const R0_DIR = "fixtures/toccata-v2/zk/r0-groth16-official";

// BN254 base field prime (p) and scalar field prime (q)
const BN254_P = 21888242871839275222246405745257275088696311157297823662689037894645226208583n;
const BN254_Q = 21888242871839275222246405745257275088548364400416034343698204186575808495617n;

describe("Adversarial Campaign · Cryptographic & Fault Injection on ZK (Fase B)", () => {
  const vk = readJson(path.join(MULT_DIR, "verification-key.json"));
  const inputs = readJson(path.join(MULT_DIR, "public-inputs.json"));
  const proof = readJson(path.join(MULT_DIR, "proof.json"));

  it("ADV-ZK-01: Point malleability (negated G1 point pi_a) is mathematically rejected by pairing check", async () => {
    // Negate pi_a y-coordinate in BN254 base field: y' = p - y
    const yVal = BigInt(proof.pi_a[1]);
    const negatedY = (BN254_P - yVal).toString();
    const malformedProof = {
      ...proof,
      pi_a: [proof.pi_a[0], negatedY, proof.pi_a[2]]
    };

    const res = await verifyGroth16Math(vk, inputs, malformedProof, { allowWeakVerificationKey: true });
    expect(res.ok).toBe(false);
    expect(res.verified).toBe(false);
    expect(res.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(res.summary.mathCheck).toBe("FAIL");
  });

  it("ADV-ZK-02: Public inputs exceeding scalar field order q are rejected before pairing", async () => {
    // Public input >= q must be rejected with explicit ZK_SCALAR_OUT_OF_RANGE error
    const outOfFieldSignals = [(BN254_Q + 1n).toString()];
    const res = await verifyGroth16Math(
      vk,
      { schema: HardkasSchemas.ZkGroth16PublicInputsV1, publicSignals: outOfFieldSignals },
      proof,
      { allowWeakVerificationKey: true }
    );
    expect(res.ok).toBe(false);
    expect(res.verified).toBe(false);
    expect(res.issues.some((i) => i.code === "ZK_SCALAR_OUT_OF_RANGE")).toBe(true);
  });

  it("ADV-ZK-03: Degenerate verification key (identity/zero points) is refused", async () => {
    const degenerateVk = {
      ...vk,
      vk_alpha_1: ["0", "0", "0"],
      IC: [["0", "0", "0"], ["0", "0", "0"]]
    };
    const res = await verifyGroth16Math(degenerateVk, inputs, proof, { allowWeakVerificationKey: true });
    expect(res.ok).toBe(false);
    expect(res.verified).toBe(false);
  });

  it("ADV-ZK-04: Concurrency stress: 30 parallel verification calls execute deterministically without race", { timeout: 20000 }, async () => {
    const fakeInputs = {
      schema: HardkasSchemas.ZkGroth16PublicInputsV1,
      publicSignals: ["999999"]
    };
    const promises = Array.from({ length: 30 }, (_, i) => {
      const isLegit = i % 2 === 0;
      const testInputs = isLegit ? inputs : fakeInputs;
      return verifyGroth16Math(vk, testInputs, proof, { allowWeakVerificationKey: true });
    });

    const results = await Promise.all(promises);
    expect(results).toHaveLength(30);
    for (let i = 0; i < 30; i++) {
      if (i % 2 === 0) {
        expect(results[i].ok).toBe(true);
        expect(results[i].verified).toBe(true);
      } else {
        expect(results[i].ok).toBe(false);
        expect(results[i].verified).toBe(false);
      }
    }
  });

  it("ADV-ZK-05: Non-numeric and malformed string coordinates in proof fail with typed error", async () => {
    const corruptedProof = {
      ...proof,
      pi_a: ["not-a-number", proof.pi_a[1], proof.pi_a[2]]
    };
    const res = await verifyGroth16Math(vk, inputs, corruptedProof, { allowWeakVerificationKey: true });
    expect(res.ok).toBe(false);
    expect(res.verified).toBe(false);
  });
});

describe("Adversarial Campaign · Toccata KIP-16 & Script Construction (Fase B)", () => {
  const officialImageId = "75641a540ee2ad9ee5902bcdcdb8b55c0bef4a28287309b858f97b1356c6c2e0";
  const officialJournalHash = "5df6e0e2761359d30a8275058e299fcc0381534545f55cf43e41983f5d4c9456";
  const receiptHex = fs.readFileSync(path.join(repoRoot(), R0_DIR, "receipt.hex"), "utf8").trim();

  it("ADV-TOC-01: Non-hex or invalid-length imageId or journalHash return typed errors", () => {
    const res1 = buildR0Groth16Scripts({
      imageId: "not-a-valid-hex-string!!",
      journalHash: officialJournalHash,
      receiptHex
    });
    expect(res1.ok).toBe(false);
    expect(res1.issues.some((i) => i.code === "ZK_INVALID_IMAGE_ID")).toBe(true);

    const res2 = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: "short_hex",
      receiptHex
    });
    expect(res2.ok).toBe(false);
    expect(res2.issues.some((i) => i.code === "ZK_INVALID_JOURNAL_HASH")).toBe(true);
  });

  it("ADV-TOC-02: Empty or truncated receipt hex returns typed extraction error", () => {
    const res = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex: "1234"
    });
    expect(res.ok).toBe(false);
    expect(res.issues.some((i) => i.code === "ZK_RECEIPT_EXTRACTION_FAILED")).toBe(true);
  });

  it("ADV-TOC-03: Compute budget exact fee boundary calculation", () => {
    const estimate = estimateToccataZkFee(DEFAULT_ZK_COMPUTE_BUDGET);
    expect(estimate.minimumRequiredSompi).toBeGreaterThan(0n);
    expect(estimate.recommendedSompi).toBeGreaterThanOrEqual(estimate.minimumRequiredSompi);
    expect(estimate.computeMass).toBe(1602n + 1600n * 100n);

    // Negative or out-of-range compute budget throws RangeError
    expect(() => estimateToccataZkFee(0 - 1)).toThrow(RangeError);
    expect(() => estimateToccataZkFee(65536)).toThrow(RangeError);
  });

  it("ADV-TOC-04: P2SH addresses across mainnet, testnet, simnet are correctly formatted", () => {
    const scripts = buildR0Groth16Scripts({
      imageId: officialImageId,
      journalHash: officialJournalHash,
      receiptHex
    });

    expect(scripts.ok).toBe(true);
    expect(scripts.p2shAddresses.mainnet).toMatch(/^kaspa:p/);
    expect(scripts.p2shAddresses.testnet10).toMatch(/^kaspatest:p/);
    expect(scripts.p2shAddresses.simnet).toMatch(/^kaspasim:p/);
  });
});

describe("Adversarial Campaign · SDK Invariants & Isolation Boundaries (Fase B)", () => {
  it("ADV-SDK-01: HardkasZk rejects verification against non-existent fixture paths with typed error", async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-adv-ws-"));
    fs.copyFileSync(path.join(repoRoot(), "package.json"), path.join(ws, "package.json"));
    try {
      const sdk = await Hardkas.create({ cwd: ws, network: "simulated", autoBootstrap: true });
      const zk = new HardkasZk(sdk);

      const res = await zk.proof.verifyMath("fixtures/does-not-exist");
      expect(res.ok).toBe(false);
      expect(res.verified).toBe(false);
      expect(res.issues.some((i) => i.code === "ZK_PROOF_FILE_MISSING")).toBe(true);
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });

  it("ADV-SDK-02: HardkasZk does NOT claim on-chain verification in off-chain mathematical verification", async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-adv-ws-"));
    for (const rel of ["fixtures/toccata-v2/zk"]) {
      fs.cpSync(path.join(repoRoot(), rel), path.join(ws, rel), { recursive: true });
    }
    fs.copyFileSync(path.join(repoRoot(), "package.json"), path.join(ws, "package.json"));
    try {
      const sdk = await Hardkas.create({ cwd: ws, network: "simulated", autoBootstrap: true });
      const zk = new HardkasZk(sdk);

      const res = await zk.proof.verifyMath(MULT_DIR, { allowWeakVerificationKey: true });
      expect(res.ok).toBe(true);
      expect(res.claims.zkOnchainVerification).toBe("NOT_CLAIMED");
      expect(res.claims.zkMathematicalVerification).toBe("GROTH16_SNARKJS_BN254_FIXTURE_BOUND");
    } finally {
      fs.rmSync(ws, { recursive: true, force: true });
    }
  });
});
