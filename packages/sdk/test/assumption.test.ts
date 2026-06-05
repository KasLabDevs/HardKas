import { describe, it, expect, beforeAll } from "vitest";
import { Hardkas } from "../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Network-Agnostic Artifact Layer: Assumption", () => {
  let sdk: Hardkas;
  let workspaceRoot: string;

  beforeAll(async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-test-"));
    sdk = await Hardkas.open({ cwd: workspaceRoot, autoBootstrap: true });
  });

  it("should freeze trust assumptions and verify immutability", async () => {
    const assumption = {
      schema: "hardkas.assumption.v1",
      hardkasVersion: "0.8.11-alpha",
      version: "1.0.0-alpha",
      networkId: "igra",
      mode: "real",
      createdAt: new Date().toISOString(),
      settlement: "kaspa",
      bridgePhase: "mpc",
      exitModel: "federated"
    };
    
    (assumption as any).contentHash = calculateContentHash(assumption, CURRENT_HASH_VERSION);

    const { absolutePath, contentHash } = await sdk.artifacts.write(assumption as any);
    expect(absolutePath).toBeDefined();

    const verifyResult = await sdk.artifacts.verify(contentHash);
    expect(verifyResult.ok).toBe(true);
  });

  it("should reject mutations to bridgePhase", async () => {
    const assumption = {
      schema: "hardkas.assumption.v1",
      hardkasVersion: "0.8.11-alpha",
      version: "1.0.0-alpha",
      networkId: "igra",
      mode: "real",
      createdAt: new Date().toISOString(),
      settlement: "kaspa",
      bridgePhase: "mpc",
      exitModel: "federated"
    };
    (assumption as any).contentHash = calculateContentHash(assumption, CURRENT_HASH_VERSION);
    
    const mutated = {
      ...assumption,
      bridgePhase: "zk" // FUTURE STATE INJECTED
    };

    const verifyResult = await sdk.artifacts.verify(mutated, { throwOnInvalid: false });
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.details[0].code).toBe("HASH_MISMATCH");
  });
});
