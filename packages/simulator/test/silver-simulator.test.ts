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
import {
  SilverDeploySimulationArtifactSchema,
  SilverSpendSimulationArtifactSchema
} from "../../artifacts/src/schemas.js";
import {
  calculateSilverArgsHash,
  parsePushOnlyScript,
  simulateSilverDeploy,
  simulateSilverSpend,
  SilverSimulationError,
  type SilverDeployPlanArtifactLike,
  type SilverSpendPlanArtifactLike
} from "../src/index.js";

// A real SilverScript v1 contract (from the golden corpus); the unlock is the SDK's.
const CASE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../fixtures/toccata-v2/silver/p2sh-signed-release");
const artifact = parseSilAbiArtifact(JSON.parse(fs.readFileSync(path.join(CASE, "contract.artifact.json"), "utf8")));
const BYTECODE = silContractBytecodeHex(getSilContract(artifact).contract);
const UNLOCK = silverUnlockScript(
  BYTECODE,
  encodeSilverEntryArgs({ artifact, entry: "release", args: [{ kind: "bytes", value: new Uint8Array(65).fill(7) }] })
);
const ENTRY_PUSHES = parsePushOnlyScript(UNLOCK).slice(0, -1).map((value) => ({ type: "hex" as const, value }));

function baseDeployPlan(
  overrides: Partial<SilverDeployPlanArtifactLike> = {}
): SilverDeployPlanArtifactLike {
  const lock = silverP2shLock(BYTECODE);
  return {
    schema: "hardkas.silver.deployPlan",
    hardkasVersion: "0.12.0-rc.21",
    version: "1.0.0-alpha",
    hashVersion: 4,
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

function baseSpendPlan(
  deployResult: ReturnType<typeof simulateSilverDeploy>,
  overrides: Partial<SilverSpendPlanArtifactLike> = {}
): SilverSpendPlanArtifactLike {
  const args = ENTRY_PUSHES;
  return {
    schema: "hardkas.silver.spendPlan",
    hardkasVersion: "0.12.0-rc.21",
    version: "1.0.0-alpha",
    hashVersion: 4,
    networkId: "simnet",
    mode: "simulator",
    createdAt: "2026-06-08T00:00:00.000Z",
    deployArtifactHash: deployResult.receipt.contentHash,
    compileArtifactHash: deployResult.receipt.compileArtifactHash,
    redeemScriptHash: deployResult.receipt.redeemScriptHash,
    lockingScriptHex: deployResult.receipt.lockingScriptHex,
    contractUtxoRef: deployResult.receipt.syntheticOutpoint,
    args,
    argsHash: calculateSilverArgsHash(args),
    signatureScriptHex: UNLOCK,
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

describe("Silver P2SH bookkeeping simulator (experimental, never evidence)", () => {
  it("deploy simulation PASS", () => {
    const a = simulateSilverDeploy(baseDeployPlan());
    const b = simulateSilverDeploy(baseDeployPlan());

    expect(a.receipt.schema).toBe("hardkas.silver.deploySimulation");
    expect(a.receipt.status).toBe("SIMULATED_ACCEPTED");
    expect(a.receipt.simulatedDeployTxId).toMatch(/^[0-9a-f]{64}$/);
    expect(a.receipt.contentHash).toBe(b.receipt.contentHash);
    expect(SilverDeploySimulationArtifactSchema.safeParse(a.receipt).success).toBe(true);
  });

  it("spend simulation PASS", () => {
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
