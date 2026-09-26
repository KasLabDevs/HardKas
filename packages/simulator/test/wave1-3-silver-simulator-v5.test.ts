import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  encodeSilverEntryArgs,
  getSilContract,
  parseSilAbiArtifact,
  silContractBytecodeHex,
  silverP2shLock,
  silverUnlockScript
} from "@hardkas/core";
import { calculateContentHash, CURRENT_HASH_VERSION, verifyArtifactIntegritySync, verifyLineage } from "../../artifacts/src/index.js";
import {
  calculateSilverArgsHash,
  parsePushOnlyScript,
  simulateSilverDeploy,
  simulateSilverSpend,
  SilverSimulationError,
  type SilverDeployPlanArtifactLike,
  type SilverSpendPlanArtifactLike
} from "../src/index.js";

// Wave 1.3 · IC-1′ / IC-7.3 for the Silver bookkeeping simulator:
//   its receipts are version-5 artifacts sealed by THE canonicaliser (no local
//   copy with its own exclusions), carry no top-level artifactId, have a
//   hexadecimal lineage, and never trust a claimed contentHash they did not recompute.

const CASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../fixtures/toccata-v2/silver/p2sh-signed-release");
const artifact = parseSilAbiArtifact(JSON.parse(fs.readFileSync(path.join(CASE, "contract.artifact.json"), "utf8")));
const BYTECODE = silContractBytecodeHex(getSilContract(artifact).contract);
const UNLOCK = silverUnlockScript(
  BYTECODE,
  encodeSilverEntryArgs({ artifact, entry: "release", args: [{ kind: "bytes", value: new Uint8Array(65).fill(7) }] })
);
const ENTRY_PUSHES = parsePushOnlyScript(UNLOCK).slice(0, -1).map((value) => ({ type: "hex" as const, value }));

function deployPlan(overrides: Partial<SilverDeployPlanArtifactLike> = {}): SilverDeployPlanArtifactLike {
  const lock = silverP2shLock(BYTECODE);
  return {
    schema: "hardkas.silver.deployPlan",
    hardkasVersion: "0.12.0-rc.23",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet",
    mode: "simulator",
    createdAt: "2026-06-08T00:00:00.000Z",
    compileArtifactHash: "compile-hash-signed-release",
    compiledScriptHash: "compiled-script-hash-signed-release",
    redeemScriptHex: BYTECODE,
    redeemScriptHash: lock.script.slice(4, 68),
    lockingScriptHex: lock.script,
    scriptPublicKeyVersion: 0,
    amountSompi: "10000",
    deployerAddress: "kaspa:sim_alice",
    ...overrides
  };
}

function spendPlan(deployed: ReturnType<typeof simulateSilverDeploy>): SilverSpendPlanArtifactLike {
  return {
    schema: "hardkas.silver.spendPlan",
    hardkasVersion: "0.12.0-rc.23",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    networkId: "simnet",
    mode: "simulator",
    createdAt: "2026-06-08T00:00:00.000Z",
    deployArtifactHash: deployed.receipt.contentHash,
    compileArtifactHash: deployed.receipt.compileArtifactHash,
    redeemScriptHash: deployed.receipt.redeemScriptHash,
    lockingScriptHex: deployed.receipt.lockingScriptHex,
    contractUtxoRef: deployed.receipt.syntheticOutpoint,
    args: ENTRY_PUSHES,
    argsHash: calculateSilverArgsHash(ENTRY_PUSHES),
    signatureScriptHex: UNLOCK,
    expectedOutputs: [{ address: "kaspa:sim_bob", amountSompi: "8000" }]
  };
}

const codes = (r: { issues: Array<{ code: string }> }) => r.issues.map((i) => i.code);

describe("Wave 1.3 · Silver simulator receipts are honest v5 artifacts", () => {
  it("deploy and spend receipts are sealed under the current canonical form, verify strict FULL and carry no artifactId", () => {
    const deployed = simulateSilverDeploy(deployPlan());
    const spent = simulateSilverSpend(spendPlan(deployed), deployed.state);
    for (const [label, receipt] of Object.entries({ deploy: deployed.receipt, spend: spent.receipt }) as Array<[string, any]>) {
      expect(receipt.hashVersion, label).toBe(CURRENT_HASH_VERSION);
      expect(receipt.artifactId, label).toBeUndefined();
      expect(calculateContentHash(receipt, CURRENT_HASH_VERSION), label).toBe(receipt.contentHash);
      expect(receipt.lineage.artifactId, label).toBe(receipt.contentHash);
      for (const field of ["lineageId", "parentArtifactId", "rootArtifactId"]) {
        expect(receipt.lineage[field], `${label}.lineage.${field}`).toMatch(/^[0-9a-f]{64}$/);
      }
      const r = verifyArtifactIntegritySync(structuredClone(receipt), { strict: true });
      expect(r.ok, `${label}: ${codes(r).join(",")}`).toBe(true);
      expect(r.authScope, label).toBe("FULL");
      expect(verifyLineage(receipt, undefined, { strict: true }).ok, label).toBe(true);
    }
    expect(spent.receipt.lineage.lineageId).toBe(deployed.receipt.lineage.lineageId);
  });

  it("the status is authenticated: flipping it after sealing is detected", () => {
    const deployed = simulateSilverDeploy(deployPlan());
    const tampered: any = { ...deployed.receipt, status: "SIMULATED_REJECTED" };
    expect(calculateContentHash(tampered, CURRENT_HASH_VERSION)).not.toBe(deployed.receipt.contentHash);
  });

  it("synthetic transaction ids are domain digests (64 hex, deterministic)", () => {
    const a = simulateSilverDeploy(deployPlan());
    const b = simulateSilverDeploy(deployPlan());
    expect(a.receipt.simulatedDeployTxId).toMatch(/^[0-9a-f]{64}$/);
    expect(a.receipt.simulatedDeployTxId).toBe(b.receipt.simulatedDeployTxId);
    expect(a.receipt.contentHash).toBe(b.receipt.contentHash);
  });

  it("the deploy plan reference is the plan's recomputed identity under its declared version; a false claim is refused", () => {
    const plan = deployPlan();
    const expected = calculateContentHash(plan, CURRENT_HASH_VERSION);
    expect(simulateSilverDeploy(plan).receipt.deployPlanHash).toBe(expected);
    expect(simulateSilverDeploy({ ...plan, contentHash: expected }).receipt.deployPlanHash).toBe(expected);
    let error: any;
    try {
      simulateSilverDeploy({ ...plan, contentHash: "0".repeat(64) });
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(SilverSimulationError);
    expect(error.code).toBe("SILVERSCRIPT_PLAN_HASH_MISMATCH");
  });

  it("a legacy v4 deploy plan is still accepted: its identity is recomputed under version 4", () => {
    const legacy = deployPlan({ hashVersion: 4 });
    expect(simulateSilverDeploy(legacy).receipt.deployPlanHash).toBe(calculateContentHash(legacy, 4));
    expect(() => simulateSilverDeploy(deployPlan({ hashVersion: "x" as any }))).toThrow(/HASH_VERSION_INVALID/);
  });
});
