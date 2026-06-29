import { describe, it, expect, beforeAll } from "vitest";
import { Hardkas } from "../src/index.js";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("Network-Agnostic Artifact Layer: Integration", () => {
  let sdk: Hardkas;
  let workspaceRoot: string;

  beforeAll(async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-test-"));
    sdk = await Hardkas.open({ cwd: workspaceRoot, autoBootstrap: true });
  });

  it("should inject network-agnostic references as immutable contentHashes in TxPlan", async () => {
    const accFrom = await sdk.accounts.resolve("alice");
    const accTo = await sdk.accounts.resolve("bob");

    // Create a mock policy
    const policy = {
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.11.0-alpha",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      createdAt: new Date().toISOString(),
      decision: "ALLOW",
      rules: []
    };

    const { calculateContentHash, CURRENT_HASH_VERSION } =
      await import("@hardkas/artifacts");
    (policy as any).contentHash = calculateContentHash(policy, CURRENT_HASH_VERSION);

    // Save policy with a logical alias
    const { absolutePath, contentHash } = await sdk.artifacts.write(policy as any, {
      fileName: "company-default.json"
    });

    // Create a plan referencing the logical alias
    const plan = await sdk.tx.plan({
      from: accFrom,
      to: accTo,
      amount: 10,
      policy: "company-default" // Logical alias
    });

    // Verify it was resolved to the immutable contentHash
    expect((plan as any).policyRef).toBe(contentHash);
  });
});
