import { describe, expect, it } from "vitest";
import { createKaspaP2shBlake2bLock, createPushOnlySignatureScript } from "@hardkas/core";
import {
  SilverDeploySimulationArtifactSchema,
  SilverSpendSimulationArtifactSchema
} from "../../artifacts/src/schemas.js";
import {
  calculateSilverArgsHash,
  simulateSilverDeploy,
  simulateSilverSpend,
  SilverSimulationError,
  type SilverDeployPlanArtifactLike,
  type SilverSpendPlanArtifactLike
} from "../src/index.js";

const OP_TRUE = "51";

function baseDeployPlan(
  overrides: Partial<SilverDeployPlanArtifactLike> = {}
): SilverDeployPlanArtifactLike {
  const lock = createKaspaP2shBlake2bLock(OP_TRUE);
  return {
    schema: "hardkas.silver.deployPlan",
    hardkasVersion: "0.9.2-alpha",
    version: "1.0.0-alpha",
    hashVersion: 4,
    networkId: "simnet",
    mode: "simulated",
    createdAt: "2026-06-08T00:00:00.000Z",
    compileArtifactHash: "compile-hash-op-true",
    compiledScriptHash: "compiled-script-hash-op-true",
    redeemScriptHex: OP_TRUE,
    redeemScriptHash: lock.redeemScriptHash,
    lockingScriptHex: lock.lockingScriptHex,
    scriptPublicKeyVersion: 0,
    amountSompi: "10000",
    deployerAddress: "kaspa:sim_alice",
    ...overrides
  };
}

function baseSpendPlan(
  deployResult: ReturnType<typeof simulateSilverDeploy>,
  overrides: Partial<SilverSpendPlanArtifactLike> = {}
): SilverSpendPlanArtifactLike {
  const args: [] = [];
  return {
    schema: "hardkas.silver.spendPlan",
    hardkasVersion: "0.9.2-alpha",
    version: "1.0.0-alpha",
    hashVersion: 4,
    networkId: "simnet",
    mode: "simulated",
    createdAt: "2026-06-08T00:00:00.000Z",
    deployArtifactHash: deployResult.receipt.contentHash,
    compileArtifactHash: deployResult.receipt.compileArtifactHash,
    redeemScriptHash: deployResult.receipt.redeemScriptHash,
    lockingScriptHex: deployResult.receipt.lockingScriptHex,
    contractUtxoRef: deployResult.receipt.syntheticOutpoint,
    args,
    argsHash: calculateSilverArgsHash(args),
    signatureScriptHex: createPushOnlySignatureScript([], OP_TRUE),
    expectedOutputs: [
      {
        address: "kaspa:sim_bob",
        amountSompi: "8000"
      }
    ],
    ...overrides
  };
}

function expectSilverError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(SilverSimulationError);
    expect((error as SilverSimulationError).code).toBe(code);
    return;
  }
  throw new Error(`Expected ${code}`);
}

describe("Silver/Toccata minimal simulator", () => {
  it("OP_TRUE deploy simulation PASS", () => {
    const a = simulateSilverDeploy(baseDeployPlan());
    const b = simulateSilverDeploy(baseDeployPlan());

    expect(a.receipt.schema).toBe("hardkas.silver.deploySimulation");
    expect(a.receipt.status).toBe("SIMULATED_ACCEPTED");
    expect(a.receipt.simulatedDeployTxId).toMatch(/^[0-9a-f]{64}$/);
    expect(a.receipt.contentHash).toBe(b.receipt.contentHash);
    expect(SilverDeploySimulationArtifactSchema.safeParse(a.receipt).success).toBe(true);
  });

  it("OP_TRUE spend simulation PASS", () => {
    const deployed = simulateSilverDeploy(baseDeployPlan());
    const spendPlan = baseSpendPlan(deployed);
    const spent = simulateSilverSpend(spendPlan, deployed.state);

    expect(spent.receipt.schema).toBe("hardkas.silver.spendSimulation");
    expect(spent.receipt.status).toBe("SIMULATED_ACCEPTED");
    expect(spent.receipt.simulatedSpendTxId).toMatch(/^[0-9a-f]{64}$/);
    expect(spent.state.spentOutpoints).toHaveLength(1);
    expect(SilverSpendSimulationArtifactSchema.safeParse(spent.receipt).success).toBe(
      true
    );
  });

  it("wrong redeem hash FAIL", () => {
    expectSilverError(
      () => simulateSilverDeploy(baseDeployPlan({ redeemScriptHash: "00".repeat(32) })),
      "SILVERSCRIPT_REDEEM_HASH_MISMATCH"
    );
  });

  it("non push-only signatureScript FAIL", () => {
    const deployed = simulateSilverDeploy(baseDeployPlan());
    const spendPlan = baseSpendPlan(deployed, { signatureScriptHex: "51" });

    expectSilverError(
      () => simulateSilverSpend(spendPlan, deployed.state),
      "SILVERSCRIPT_SIGNATURE_SCRIPT_NOT_PUSH_ONLY"
    );
  });

  it("spend same UTXO twice FAIL", () => {
    const deployed = simulateSilverDeploy(baseDeployPlan());
    const spendPlan = baseSpendPlan(deployed);
    const spent = simulateSilverSpend(spendPlan, deployed.state);

    expectSilverError(
      () => simulateSilverSpend(spendPlan, spent.state),
      "SILVERSCRIPT_UTXO_ALREADY_SPENT"
    );
  });

  it("mutate args FAIL", () => {
    const deployed = simulateSilverDeploy(baseDeployPlan());
    const spendPlan = baseSpendPlan(deployed, {
      args: [{ type: "hex", value: "aa" }]
    });

    expectSilverError(
      () => simulateSilverSpend(spendPlan, deployed.state),
      "SILVERSCRIPT_ARGS_HASH_MISMATCH"
    );
  });

  it("wrong network FAIL", () => {
    expectSilverError(
      () => simulateSilverDeploy(baseDeployPlan({ networkId: "testnet-10" })),
      "SILVERSCRIPT_NETWORK_UNSUPPORTED"
    );
  });
});
