import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Hardkas } from "../src/index.js";

function repoRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));
  while (current !== path.dirname(current)) {
    if (fs.existsSync(path.join(current, "pnpm-workspace.yaml"))) return current;
    current = path.dirname(current);
  }
  throw new Error("repo root not found");
}

function readJson(filePath: string): any {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

describe("0.11.4-alpha SDK parity surface", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-sdk-parity-"));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("exposes capabilities with the same bounded claims as the CLI JSON", async () => {
    const sdk = await Hardkas.create({
      cwd: repoRoot(),
      network: "simulated",
      autoBootstrap: true
    });
    const capabilities = await sdk.experimental.capabilitiesApi.get("hardkas-1.0-alpha");

    expect(capabilities.version).toBe("0.11.4-alpha");
    expect(capabilities.capabilities.mainnetGuards).toBe(true);
    expect(capabilities.capabilities.consensusValidation).toBe(false);
    expect(capabilities.capabilities.productionWallet).toBe(false);
    expect(capabilities.trustBoundaries.simulator).toBe("local-simulation-only");
  });

  it("exposes localnet.status without requiring CLI shelling", async () => {
    const sdk = await Hardkas.create({
      cwd: workspaceRoot,
      network: "simulated",
      autoBootstrap: true
    });
    const status = await sdk.localnet.status({ profile: "toccata-v2" });

    expect(status.schema).toBe("hardkas.localnetStatus.v1");
    expect(status.profile).toBe("toccata-v2");
    expect(status.simulationLevels.artifactCoherence).toBe("READY");
    expect(status.simulationLevels.runtimeOutcome).toBe("PARTIAL");
    expect(status.simulationLevels.vmConsensusEquivalence).toBe("NOT_CLAIMED");
  });

  it("exposes corpus.verify with machine-checkable release claims", async () => {
    const root = repoRoot();
    const sdk = await Hardkas.create({
      cwd: root,
      network: "simulated",
      autoBootstrap: true
    });
    const result = await sdk.experimental.corpus.verify("fixtures/toccata-v2/silver");

    expect(result.ok).toBe(true);
    expect(result.schema).toBe("hardkas.toccataCorpus.v1");
    expect(result.claims.artifactCoherence).toBe("READY_MATCH");
    expect(result.claims.runtimeOutcome).toBe("PARTIAL");
    expect(result.claims.vmConsensusEquivalence).toBe("NOT_CLAIMED");
    expect(result.claims.mainnet).toBe("BLOCKED_BY_POLICY");
  });

  it("exposes Silver deploy planning, simulation, and artifact-coherence compare", async () => {
    const root = repoRoot();
    const sdk = await Hardkas.create({
      cwd: workspaceRoot,
      network: "simulated",
      autoBootstrap: true
    });
    const compileArtifact = readJson(
      path.join(
        root,
        "fixtures",
        "toccata-v2",
        "silver",
        "op-true",
        "compile-artifact.json"
      )
    );
    const simulatedSpendReceipt = readJson(
      path.join(
        root,
        "fixtures",
        "toccata-v2",
        "silver",
        "op-true",
        "spend-simulated.json"
      )
    );
    const dockerSpendReceipt = readJson(
      path.join(
        root,
        "fixtures",
        "toccata-v2",
        "silver",
        "op-true",
        "spend-receipt-real.json"
      )
    );

    const deployPlan = await sdk.experimental.silver.deployPlan({
      artifact: compileArtifact,
      from: "alice",
      amount: "1",
      write: false
    });
    const simulated = await sdk.experimental.silver.simulate.deploy(deployPlan.artifact, {
      write: false
    });
    const compare = await sdk.experimental.silver.compare({
      simulated: simulatedSpendReceipt,
      docker: dockerSpendReceipt,
      mode: "artifact-coherence"
    });

    expect(deployPlan.artifact.schema).toBe("hardkas.silver.deployPlan");
    expect(simulated.artifact.status).toBe("SIMULATED_ACCEPTED");
    expect(compare.expectedKnownLimitations).toEqual(["PARTIAL_VM_SIMULATION"]);
    expect(compare.status).toBe("SILVERSCRIPT_SIMULATION_MATCH");
  });

  it("documents unsupported SDK real Silver execution instead of pretending consensus parity", async () => {
    const sdk = await Hardkas.create({
      cwd: workspaceRoot,
      network: "simulated",
      autoBootstrap: true
    });
    await expect(
      sdk.experimental.silver.deploy({ artifact: {}, mode: "real", write: false })
    ).rejects.toThrow("SDK_SILVER_REAL_LIFECYCLE_UNSUPPORTED");
  });
});
