import { describe, it, expect, beforeAll } from "vitest";
import { Hardkas } from "../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Network-Agnostic Artifact Layer: NetworkProfile", () => {
  let sdk: Hardkas;
  let workspaceRoot: string;

  beforeAll(async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-test-"));
    sdk = await Hardkas.open({ cwd: workspaceRoot, autoBootstrap: true });
  });

  it("should create and verify a network profile", async () => {
    const profile = {
      schema: "hardkas.networkProfile.v1",
      hardkasVersion: "0.9.0-alpha",
      version: "1.0.0-alpha",
      networkId: "mainnet",
      mode: "real",
      createdAt: new Date().toISOString(),
      networkProfileId: "kaspa-mainnet-v1",
      layer: "L1",
      capabilities: {
        utxo: true,
        evm: false
      }
    };
    
    (profile as any).contentHash = calculateContentHash(profile, CURRENT_HASH_VERSION);

    const { absolutePath, contentHash } = await sdk.artifacts.write(profile as any);
    expect(absolutePath).toBeDefined();

    const verifyResult = await sdk.artifacts.verify(contentHash);
    expect(verifyResult.ok).toBe(true);
  });

  it("should fail validation if capabilities mismatch schemas", async () => {
    const profile = {
      schema: "hardkas.networkProfile.v1",
      hardkasVersion: "0.9.0-alpha",
      version: "1.0.0-alpha",
      networkId: "igra",
      mode: "real",
      createdAt: new Date().toISOString(),
      // Missing networkProfileId
      layer: "L2",
      capabilities: {
        evm: true,
        settlement: "kaspa"
      }
    };
    
    const verifyResult = await sdk.artifacts.verify(profile, { throwOnInvalid: false });
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.details.some((i: any) => i.message.includes("Required"))).toBe(true);
  });
});
