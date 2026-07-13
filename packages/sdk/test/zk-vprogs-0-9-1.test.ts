import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hardkas, verifyZkCorpus, verifyZkProofLocal } from "../src/index.js";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

function copyZkCorpus(): string {
  const target = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-zk-corpus-"));
  fs.cpSync(path.join(repoRoot(), "fixtures", "toccata-v2", "zk"), target, {
    recursive: true
  });
  return target;
}

function mutateJson(filePath: string, mutate: (value: any) => void) {
  const value = JSON.parse(fs.readFileSync(filePath, "utf8"));
  mutate(value);
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

describe("0.11.3-alpha ZK corpus and vProgs inspect SDK parity", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-sdk-zk-"));
    delete process.env.HARDKAS_EXPERIMENTAL_VPROGS;
  });

  afterEach(() => {
    delete process.env.HARDKAS_EXPERIMENTAL_VPROGS;
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("exposes ZK capabilities with bounded experimental claims", async () => {
    const sdk = await Hardkas.create({
      cwd: workspaceRoot,
      network: "simulated",
      autoBootstrap: true
    });
    const capabilities = await sdk.experimental.zk.capabilities();

    expect(capabilities.schema).toBe("hardkas.zkCapabilities.v1");
    expect(capabilities.claims.zkOnchainVerification).toBe("NOT_CLAIMED");
    expect(capabilities.claims.vmConsensusEquivalence).toBe("NOT_CLAIMED");
    expect(capabilities.claims.mainnet).toBe("BLOCKED_BY_POLICY");
  });

  it("verifies the experimental Groth16/RISC0 corpus with partial local verification", async () => {
    const sdk = await Hardkas.create({
      cwd: repoRoot(),
      network: "simulated",
      autoBootstrap: true
    });
    const result = await sdk.experimental.zk.corpus.verify("fixtures/toccata-v2/zk");

    expect(result.ok).toBe(true);
    expect(result.status).toBe("ZK_CORPUS_VERIFICATION_PASS");
    expect(result.claims.zkLocalVerification).toBe("READY_GROTH16_FIXTURE_COHERENCE");
    expect(result.claims.zkOnchainVerification).toBe("NOT_CLAIMED");
    expect(result.summary.proofSystems).toEqual(["groth16", "risc0"]);
  });

  it("fails Groth16 proof tampering", async () => {
    const corpus = copyZkCorpus();
    mutateJson(path.join(corpus, "groth16", "proof.json"), (proof) => {
      proof.pi_a[0] = "999";
    });

    const result = await verifyZkCorpus(corpus, path.dirname(corpus));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("ZK_CORPUS_HASH_MISMATCH");
  });

  it("fails Groth16 public input tampering", async () => {
    const corpus = copyZkCorpus();
    mutateJson(path.join(corpus, "groth16", "public-inputs.json"), (inputs) => {
      inputs.publicSignals = ["5"];
    });

    const result = await verifyZkCorpus(corpus, path.dirname(corpus));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "ZK_GROTH16_PUBLIC_INPUTS_HASH_MISMATCH"
    );
  });

  it("fails Groth16 verification key tampering", async () => {
    const corpus = copyZkCorpus();
    mutateJson(path.join(corpus, "groth16", "verification-key.json"), (key) => {
      key.verificationKeyId = "tampered";
    });

    const result = await verifyZkCorpus(corpus, path.dirname(corpus));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain(
      "ZK_GROTH16_VERIFICATION_KEY_HASH_MISMATCH"
    );
  });

  it("fails ZK manifest tampering and mainnet corpus claims", async () => {
    const corpus = copyZkCorpus();
    mutateJson(path.join(corpus, "manifest.json"), (manifest) => {
      manifest.network = "mainnet";
      manifest.claims.mainnet = "READY";
    });

    const result = await verifyZkCorpus(corpus, path.dirname(corpus));
    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.code)).toContain("ZK_NETWORK_UNSUPPORTED");
    expect(result.issues.map((issue) => issue.code)).toContain(
      "ZK_MAINNET_GUARD_INVALID"
    );
  });

  it("inspects RISC0 and returns explicit unsupported local verification", async () => {
    const sdk = await Hardkas.create({
      cwd: repoRoot(),
      network: "simulated",
      autoBootstrap: true
    });
    const inspect = await sdk.experimental.zk.proof.inspect("fixtures/toccata-v2/zk/risc0");
    const verify = await sdk.experimental.zk.proof.verifyLocal("fixtures/toccata-v2/zk/risc0");

    expect(inspect.ok).toBe(true);
    expect(inspect.proofSystem).toBe("risc0");
    expect(verify.ok).toBe(false);
    expect(verify.status).toBe("RISC0_LOCAL_VERIFICATION_NOT_IMPLEMENTED");
    expect(verify.issues.map((issue) => issue.code)).toContain(
      "RISC0_VERIFIER_UNAVAILABLE"
    );
  });

  it("exposes vProgs inspect-only surface with bounded claims", async () => {
    const sdk = await Hardkas.create({
      cwd: repoRoot(),
      network: "simulated",
      autoBootstrap: true
    });
    const enabled = await sdk.experimental.vprogs.status();
    const inspected = await sdk.experimental.vprogs.inspect(
      "fixtures/toccata-v2/vprogs/inspect-only-artifact.json"
    );

    expect(enabled.ok).toBe(true);
    expect(enabled.status).toBe("VPROGS_INSPECT_SURFACE_READY");
    expect(enabled.claims.vProgsRuntime).toBe("NOT_CLAIMED");
    expect(enabled.claims.vProgsStableApi).toBe("NOT_CLAIMED");
    expect(inspected.ok).toBe(false);
    expect(inspected.issues[0].code).toBe("MISSING_DEPENDENCY");
  });

  it("fails to inspect an invalid vProgs schema like package.json", async () => {
    const sdk = await Hardkas.create({
      cwd: repoRoot(),
      network: "simulated",
      autoBootstrap: true
    });

    const inspected = await sdk.experimental.vprogs.inspect("package.json");
    expect(inspected.ok).toBe(false);
    expect(inspected.status).toBe("VPROGS_ARTIFACT_INVALID");
    expect(inspected.issues[0].code).toBe("MISSING_DEPENDENCY");
  });
});
