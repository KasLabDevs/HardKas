import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  Hardkas,
  HardkasZk,
  inspectZkProof,
  verifyZkProofLocal,
  verifyZkCorpus,
  MAX_ZK_FILE_SIZE
} from "../src/index.js";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

function copyZkCorpus(): string {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-zk-corpus-sec-"));
  fs.cpSync(path.join(repoRoot(), "fixtures", "toccata-v2", "zk"), target, {
    recursive: true
  });
  return target;
}

describe("HardKAS Phase 1 ZK Security & Artifact Hardening", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-zk-phase1-"));
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("rejects fixture files exceeding MAX_ZK_FILE_SIZE (DoS protection)", async () => {
    const corpus = copyZkCorpus();
    const oversizeProofPath = path.join(corpus, "groth16", "oversize.json");
    
    // Create an oversized file > 10MB
    const bigBuffer = Buffer.alloc(MAX_ZK_FILE_SIZE + 1024, 32); // spaces
    fs.writeFileSync(oversizeProofPath, bigBuffer);

    // Point manifest to the oversized file
    const manifestPath = path.join(corpus, "groth16", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    manifest.proof = "oversize.json";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await inspectZkProof(path.join(corpus, "groth16"), tempDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "ZK_FILE_TOO_LARGE")).toBe(true);

    const verifyResult = await verifyZkProofLocal(path.join(corpus, "groth16"), tempDir);
    expect(verifyResult.ok).toBe(false);
    expect(verifyResult.issues.some((i) => i.code === "ZK_FILE_TOO_LARGE")).toBe(true);
    fs.rmSync(corpus, { recursive: true, force: true });
  });

  it("detects and rejects path traversal in fixture manifests", async () => {
    const corpus = copyZkCorpus();
    const manifestPath = path.join(corpus, "groth16", "manifest.json");
    const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
    
    // Attempt to break out of fixture directory
    manifest.proof = "../../outside.json";
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    const result = await inspectZkProof(path.join(corpus, "groth16"), tempDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "ZK_PATH_TRAVERSAL_DETECTED")).toBe(true);

    const verifyResult = await verifyZkProofLocal(path.join(corpus, "groth16"), tempDir);
    expect(verifyResult.ok).toBe(false);
    expect(verifyResult.issues.some((i) => i.code === "ZK_PATH_TRAVERSAL_DETECTED")).toBe(true);
    fs.rmSync(corpus, { recursive: true, force: true });
  });

  it("detects and rejects path traversal in corpus manifests", async () => {
    const corpus = copyZkCorpus();
    const corpusManifestPath = path.join(corpus, "manifest.json");
    const corpusManifest = JSON.parse(fs.readFileSync(corpusManifestPath, "utf8"));

    // Attempt path traversal via corpus fixture path
    corpusManifest.fixtures.push({
      id: "malicious-traversal",
      path: "../../../evil/manifest.json",
      expectedStatus: "ZK_FIXTURE_COHERENCE_PASS"
    });
    fs.writeFileSync(corpusManifestPath, JSON.stringify(corpusManifest, null, 2));

    const result = await verifyZkCorpus(corpus, tempDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "ZK_PATH_TRAVERSAL_DETECTED")).toBe(true);
    fs.rmSync(corpus, { recursive: true, force: true });
  });

  it("strictly validates Groth16 proof schema with Zod", async () => {
    const corpus = copyZkCorpus();
    const proofPath = path.join(corpus, "groth16", "proof.json");
    const proof = JSON.parse(fs.readFileSync(proofPath, "utf8"));

    // Invalidate schema: remove pi_a or set invalid type
    proof.pi_a = "invalid-not-array";
    fs.writeFileSync(proofPath, JSON.stringify(proof, null, 2));

    const verifyResult = await verifyZkProofLocal(path.join(corpus, "groth16"), tempDir);
    expect(verifyResult.ok).toBe(false);
    expect(verifyResult.status).toBe("ZK_FIXTURE_COHERENCE_FAIL");
    expect(verifyResult.issues.some((i) => i.code === "ZK_ARTIFACT_SCHEMA_INVALID")).toBe(true);
    fs.rmSync(corpus, { recursive: true, force: true });
  });

  it("strictly validates Groth16 verification key schema with Zod", async () => {
    const corpus = copyZkCorpus();
    const keyPath = path.join(corpus, "groth16", "verification-key.json");
    const vk = JSON.parse(fs.readFileSync(keyPath, "utf8"));

    // Invalidate schema: wrong protocol
    vk.protocol = "plonk";
    fs.writeFileSync(keyPath, JSON.stringify(vk, null, 2));

    const verifyResult = await verifyZkProofLocal(path.join(corpus, "groth16"), tempDir);
    expect(verifyResult.ok).toBe(false);
    expect(verifyResult.issues.some((i) => i.code === "ZK_ARTIFACT_SCHEMA_INVALID")).toBe(true);
    fs.rmSync(corpus, { recursive: true, force: true });
  });

  it("strictly validates Groth16 public inputs schema with Zod", async () => {
    const corpus = copyZkCorpus();
    const inputsPath = path.join(corpus, "groth16", "public-inputs.json");
    const inputs = JSON.parse(fs.readFileSync(inputsPath, "utf8"));

    // Invalidate schema: missing publicSignals array
    delete inputs.publicSignals;
    fs.writeFileSync(inputsPath, JSON.stringify(inputs, null, 2));

    const verifyResult = await verifyZkProofLocal(path.join(corpus, "groth16"), tempDir);
    expect(verifyResult.ok).toBe(false);
    expect(verifyResult.issues.some((i) => i.code === "ZK_ARTIFACT_SCHEMA_INVALID")).toBe(true);
    fs.rmSync(corpus, { recursive: true, force: true });
  });

  it("strictly validates ZK corpus manifest schema with Zod", async () => {
    const corpus = copyZkCorpus();
    const corpusManifestPath = path.join(corpus, "manifest.json");
    const corpusManifest = JSON.parse(fs.readFileSync(corpusManifestPath, "utf8"));

    // Invalidate schema: fixtures entry missing required expectedStatus
    delete corpusManifest.fixtures[0].expectedStatus;
    fs.writeFileSync(corpusManifestPath, JSON.stringify(corpusManifest, null, 2));

    const result = await verifyZkCorpus(corpus, tempDir);
    expect(result.ok).toBe(false);
    expect(result.issues.some((i) => i.code === "ZK_ARTIFACT_SCHEMA_INVALID")).toBe(true);
    fs.rmSync(corpus, { recursive: true, force: true });
  });

  it("honest claims: verifyZkProofLocal reports fixture coherence, never cryptographic validity", async () => {
    const corpus = copyZkCorpus();
    const result = await verifyZkProofLocal(path.join(corpus, "groth16"), tempDir);

    expect(result.ok).toBe(true);
    expect(result.status).toBe("ZK_FIXTURE_COHERENCE_PASS");
    expect(result.summary.verifierAdapter).toBe("hardkas-groth16-fixture-coherence-v1");
    // Verify claims reflect experimental fixture coherence only
    expect(result.claims.zkLocalVerification).toBe("EXPERIMENTAL_FIXTURE_ONLY");
    expect(result.claims.zkOnchainVerification).toBe("NOT_CLAIMED");
    expect(result.claims.vmConsensusEquivalence).toBe("NOT_CLAIMED");
    fs.rmSync(corpus, { recursive: true, force: true });
  });

  it("honest claims: RISC0 verification explicitly reports not implemented", async () => {
    const corpus = copyZkCorpus();
    const result = await verifyZkProofLocal(path.join(corpus, "risc0"), tempDir);

    expect(result.ok).toBe(false);
    expect(result.status).toBe("RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED");
    expect(result.issues.some((i) => i.code === "RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED")).toBe(true);
    fs.rmSync(corpus, { recursive: true, force: true });
  });
});
