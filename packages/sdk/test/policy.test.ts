import { describe, it, expect, beforeAll } from "vitest";
import { Hardkas } from "../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Network-Agnostic Artifact Layer: Policy", () => {
  let sdk: Hardkas;
  let workspaceRoot: string;

  beforeAll(async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-test-"));
    sdk = await Hardkas.open({ cwd: workspaceRoot, autoBootstrap: true });
  });

  it("should create, hash and verify a policy artifact", async () => {
    const policy = {
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.9.1-alpha",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      createdAt: new Date().toISOString(),
      decision: "ALLOW",
      rules: [
        {
          id: "max_amount",
          result: "PASS",
          inputHash: "some-hash"
        }
      ]
    };

    (policy as any).contentHash = calculateContentHash(policy, CURRENT_HASH_VERSION);

    // Write artifact via manager
    const { absolutePath, contentHash } = await sdk.artifacts.write(policy as any);
    expect(absolutePath).toBeDefined();
    expect(contentHash).toBe((policy as any).contentHash);

    // Verify
    const verifyResult = await sdk.artifacts.verify(contentHash);
    expect(verifyResult.ok).toBe(true);
  });

  it("should fail verification if decision is mutated (HASH_MISMATCH)", async () => {
    const policy = {
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.9.1-alpha",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      createdAt: new Date().toISOString(),
      decision: "ALLOW",
      rules: []
    };
    (policy as any).contentHash = calculateContentHash(policy, CURRENT_HASH_VERSION);

    const mutatedPolicy = {
      ...policy,
      decision: "DENY" // MUTATION
    };

    const verifyResult = await sdk.artifacts.verify(mutatedPolicy, {
      throwOnInvalid: false
    });
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.details[0].code).toBe("HASH_MISMATCH");
  });

  it("should fail verification if a rule is removed", async () => {
    const policy = {
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.9.1-alpha",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      createdAt: new Date().toISOString(),
      decision: "ALLOW",
      rules: [{ id: "max_amount", result: "PASS" }]
    };
    (policy as any).contentHash = calculateContentHash(policy, CURRENT_HASH_VERSION);

    const mutatedPolicy = {
      ...policy,
      rules: [] // MUTATION: removed rule
    };

    const verifyResult = await sdk.artifacts.verify(mutatedPolicy, {
      throwOnInvalid: false
    });
    expect(verifyResult.valid).toBe(false);
    expect(verifyResult.details[0].code).toBe("HASH_MISMATCH");
  });
});
