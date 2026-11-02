import { describe, expect, it, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Hardkas } from "../src/index.js";

// Cases that recompile or compile with the pinned silverc live in
// sdk-parity-0-9-1.silverc.test.ts (silverc level); nothing here needs a compiler.

describe("0.13.0-rc.1 SDK parity surface", () => {
  let workspaceRoot: string;

  beforeEach(() => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-sdk-parity-"));
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("exposes capabilities with the same bounded claims as the CLI JSON", async () => {
    // REMED-CLOSE · test isolation: autoBootstrap writes the workspace's .hardkas; capabilities read nothing from it, so
    // this test uses the temporary workspace too, never the repository root
    const sdk = await Hardkas.create({
      cwd: workspaceRoot,
      network: "simulated",
      autoBootstrap: true
    });
    const capabilities = await sdk.capabilities.get("hardkas-1.0-alpha");

    expect(capabilities.version).toBe("0.13.0-rc.1");
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
});
