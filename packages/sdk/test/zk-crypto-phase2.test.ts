import { describe, expect, it } from "vitest";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  Hardkas,
  HardkasZk,
  verifyGroth16Math,
  verifyZkProofMath,
  verifyZkProofLocal,
  BN254_SCALAR_FIELD_ORDER,
  BN254_BASE_FIELD_PRIME
} from "../src/index.js";
import type {
  ZkGroth16ProofType,
  ZkGroth16VerificationKeyType,
  ZkGroth16PublicInputsType
} from "@hardkas/artifacts";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

function getMultiplierFixturePath(): string {
  return path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "groth16-multiplier");
}

function copyMultiplierFixture(): string {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-zk-mult-"));
  fs.cpSync(getMultiplierFixturePath(), target, { recursive: true });
  return target;
}

// The multiplier fixture is a TOY: its verification key has a known trapdoor, so every pairing
// run below passes allowWeakVerificationKey explicitly. What these tests prove is that the pairing
// is computed and that tampering is rejected; they prove nothing about the fixture's setup.
const TOY = { allowWeakVerificationKey: true };

describe("HardKAS Phase 2 ZK — Groth16 pairing check (snarkjs / BN254)", () => {
  const fixtureDir = getMultiplierFixturePath();
  const proof: ZkGroth16ProofType = JSON.parse(fs.readFileSync(path.join(fixtureDir, "proof.json"), "utf8"));
  const vk: ZkGroth16VerificationKeyType = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, "verification-key.json"), "utf8")
  );
  const publicInputs: ZkGroth16PublicInputsType = JSON.parse(
    fs.readFileSync(path.join(fixtureDir, "public-inputs.json"), "utf8")
  );

  it("rejects the toy multiplier key by default: its trusted setup has a known trapdoor (H-01)", async () => {
    const result = await verifyGroth16Math(vk, publicInputs, proof);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(result.summary.verificationKeyStrength).toBe("WEAK_TRAPDOOR_SUSPECTED");
    expect(result.issues.some((i) => i.code === "ZK_VERIFICATION_KEY_WEAK_TRAPDOOR")).toBe(true);
  });

  it("computes the pairing for the toy proof (3 * 11 = 33) when the weak key is explicitly allowed", async () => {
    const result = await verifyGroth16Math(vk, publicInputs, proof, TOY);
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.status).toBe("ZK_GROTH16_MATH_VERIFIED");
    expect(result.summary.mathCheck).toBe("PASS");
    expect(result.summary.publicSignals).toEqual(["33"]);
    expect(result.summary.verificationKeyStrength).toBe("WEAK_TRAPDOOR_SUSPECTED");
    expect(result.summary.verificationKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.summary.publicInputsHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.summary.proofHash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.issues).toHaveLength(0);
  });

  it("rejects a proof when the public input is altered (3 * 11 != 34)", async () => {
    const result = await verifyGroth16Math(vk, { ...publicInputs, publicSignals: ["34"] }, proof, TOY);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(result.summary.mathCheck).toBe("FAIL");
    expect(result.issues.some((i) => i.code === "ZK_GROTH16_PAIRING_FAILED")).toBe(true);
  });

  it("rejects a proof when curve points are tampered (off the curve: refused before snarkjs)", async () => {
    const tamperedProof: ZkGroth16ProofType = JSON.parse(JSON.stringify(proof));
    tamperedProof.pi_a[0] = "99999999999999999999";
    const result = await verifyGroth16Math(vk, publicInputs, tamperedProof, TOY);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(result.issues.some((i) => i.code === "ZK_POINT_NOT_ON_CURVE")).toBe(true);
  });

  it("rejects verification against a different verification key", async () => {
    const wrongVk: ZkGroth16VerificationKeyType = JSON.parse(JSON.stringify(vk));
    // 2·G1: a valid curve point, so the refusal comes from the pairing itself
    wrongVk.vk_alpha_1 = [
      "1368015179489954701390400359078579693043519447331113978918064868415326638035",
      "9918110051302171585080402603319702774565515993150576347155970296011118125764",
      "1"
    ];
    const result = await verifyGroth16Math(wrongVk, publicInputs, proof, TOY);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(result.issues.some((i) => i.code === "ZK_GROTH16_PAIRING_FAILED")).toBe(true);
  });

  it("rejects public signals outside the BN254 scalar field", async () => {
    const outOfRangeScalar = (BN254_SCALAR_FIELD_ORDER + 5n).toString();
    const result = await verifyGroth16Math(vk, { ...publicInputs, publicSignals: [outOfRangeScalar] }, proof, TOY);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(result.issues.some((i) => i.code === "ZK_SCALAR_OUT_OF_RANGE")).toBe(true);
  });

  it("rejects point coordinates outside the BN254 base field", async () => {
    const badProof: ZkGroth16ProofType = JSON.parse(JSON.stringify(proof));
    badProof.pi_a[0] = (BN254_BASE_FIELD_PRIME + 1n).toString();
    const result = await verifyGroth16Math(vk, publicInputs, badProof, TOY);
    expect(result.ok).toBe(false);
    expect(result.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(result.issues.some((i) => i.code === "ZK_POINT_COORDINATE_OUT_OF_RANGE")).toBe(true);
  });

  it("distinguishes hash coherence from mathematical validity", async () => {
    // 1. The legacy smoke fixture is coherent but its key is incomplete: no pairing is possible.
    const legacyPath = path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "groth16");
    const coherenceResult1 = await verifyZkProofLocal(legacyPath, repoRoot());
    expect(coherenceResult1.ok).toBe(true);
    expect(coherenceResult1.status).toBe("ZK_FIXTURE_COHERENCE_PASS");
    const mathResult1 = await verifyZkProofMath(legacyPath, repoRoot());
    expect(mathResult1.ok).toBe(false);
    expect(mathResult1.status).toBe("ZK_GROTH16_MATH_REJECTED");
    expect(mathResult1.issues.some((i) => i.code === "ZK_VERIFICATION_KEY_INCOMPLETE")).toBe(true);

    // 2. A coherent fixture whose public signal is 34: hashes match, pairing fails.
    const tempCorpus = copyMultiplierFixture();
    const inputsPath = path.join(tempCorpus, "public-inputs.json");
    const badInputs = JSON.parse(fs.readFileSync(inputsPath, "utf8"));
    badInputs.publicSignals = ["34"];
    fs.writeFileSync(inputsPath, JSON.stringify(badInputs, null, 2));

    const manifestPath = path.join(tempCorpus, "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    const { legacyDomainDigest } = await import("@hardkas/artifacts");
    manifest.contentHashes.publicInputs = legacyDomainDigest(badInputs);

    const proofPath = path.join(tempCorpus, "proof.json");
    const proofObj = JSON.parse(fs.readFileSync(proofPath, "utf8"));
    proofObj.publicInputsHash = manifest.contentHashes.publicInputs;
    fs.writeFileSync(proofPath, JSON.stringify(proofObj, null, 2));
    manifest.contentHashes.proof = legacyDomainDigest(proofObj);

    const metadataPath = path.join(tempCorpus, "verifier-metadata.json");
    const metaObj = JSON.parse(fs.readFileSync(metadataPath, "utf8"));
    metaObj.publicInputsHash = manifest.contentHashes.publicInputs;
    metaObj.proofHash = manifest.contentHashes.proof;
    metaObj.coherenceDigest = legacyDomainDigest({
      proofSystem: "groth16",
      proofHash: metaObj.proofHash,
      publicInputsHash: metaObj.publicInputsHash,
      verificationKeyHash: metaObj.verificationKeyHash,
      statementHash: metaObj.statementHash,
      verifierAdapter: manifest.verifierAdapter
    });
    fs.writeFileSync(metadataPath, JSON.stringify(metaObj, null, 2));
    manifest.contentHashes.verifierMetadata = legacyDomainDigest(metaObj);

    const reportPath = path.join(tempCorpus, "verify-report.json");
    const reportObj = JSON.parse(fs.readFileSync(reportPath, "utf8"));
    reportObj.coherenceDigest = metaObj.coherenceDigest;
    fs.writeFileSync(reportPath, JSON.stringify(reportObj, null, 2));
    manifest.contentHashes.verifyReport = legacyDomainDigest(reportObj);
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    try {
      const coherenceResult2 = await verifyZkProofLocal(tempCorpus, os.tmpdir());
      expect(coherenceResult2.ok).toBe(true);
      expect(coherenceResult2.status).toBe("ZK_FIXTURE_COHERENCE_PASS");

      const mathResult2 = await verifyZkProofMath(tempCorpus, os.tmpdir(), TOY);
      expect(mathResult2.ok).toBe(false);
      expect(mathResult2.status).toBe("ZK_GROTH16_MATH_REJECTED");
      expect(mathResult2.summary.binding).toBe("FIXTURE_COHERENCE_SELF_ATTESTED");
      expect(mathResult2.issues.some((i) => i.code === "ZK_GROTH16_PAIRING_FAILED")).toBe(true);
    } finally {
      fs.rmSync(tempCorpus, { recursive: true, force: true });
    }
  });

  it("verifies the toy fixture through the HardkasZk class: its key is pinned in code, the coherence is self-attested", async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-sdk-zk-ws-"));
    for (const rel of ["fixtures/toccata-v2/zk"]) {
      fs.cpSync(path.join(repoRoot(), rel), path.join(ws, rel), { recursive: true });
    }
    fs.copyFileSync(path.join(repoRoot(), "package.json"), path.join(ws, "package.json"));
    const sdk = await Hardkas.create({ cwd: ws, network: "simulated", autoBootstrap: true });
    const zk = new HardkasZk(sdk);
    const result = await zk.proof.verifyMath("fixtures/toccata-v2/zk/groth16-multiplier", TOY);
    expect(result.ok).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.status).toBe("ZK_GROTH16_MATH_VERIFIED");
    expect(result.engine).toBe("snarkjs-bn254");
    expect(result.summary.binding).toBe("FIXTURE_COHERENCE_SELF_ATTESTED");
    expect(result.summary.verificationKeyAnchor).toBe("PINNED_REGISTRY");
    expect(result.claims.zkMathematicalVerification).toBe("GROTH16_SNARKJS_BN254_PINNED_VK");
    expect(result.claims.zkOnchainVerification).toBe("NOT_CLAIMED");
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("reports RISC Zero receipts as unsupported for mathematical verification", async () => {
    const risc0Path = path.join(repoRoot(), "fixtures", "toccata-v2", "zk", "risc0");
    const result = await verifyZkProofMath(risc0Path, repoRoot());
    expect(result.ok).toBe(false);
    expect(result.status).toBe("ZK_GROTH16_VERIFIER_ERROR");
    expect(result.issues.some((i) => i.code === "ZK_VERIFIER_UNSUPPORTED")).toBe(true);
  });
});
