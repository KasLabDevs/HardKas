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
    const { calculateContentHash, CURRENT_HASH_VERSION, HARDKAS_VERSION } =
      await import("@hardkas/artifacts");
    const policy = {
      schema: "hardkas.policy.v1",
      hardkasVersion: HARDKAS_VERSION,
      // the producer writes the hash version before hashing; the artifact writer refuses an artifact without it
      hashVersion: CURRENT_HASH_VERSION,
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulator",
      createdAt: new Date().toISOString(),
      decision: "ALLOW",
      rules: []
    };

    (policy as any).contentHash = calculateContentHash(policy, CURRENT_HASH_VERSION);

    // Save policy with a logical alias
    const { absolutePath, contentHash } = await sdk.artifacts.write(policy as any, {
      fileName: "company-default.json"
    });

    // IC-5'.6: references are authenticated artifactIds. A label ("company-default") is refused (NAMESPACE_REQUIRED),
    // there is no raw fallback ...
    await expect(
      sdk.tx.plan({ from: accFrom, to: accTo, amount: 50_000_000n, policy: "company-default" })
    ).rejects.toMatchObject({ code: "NAMESPACE_REQUIRED" });

    // ... and the path of the stored policy resolves to its immutable contentHash
    const plan = await sdk.tx.plan({
      from: accFrom,
      to: accTo,
      amount: 50_000_000n,
      policy: absolutePath
    });
    expect((plan as any).policyRef).toBe(contentHash);
    expect((plan as any).policyRefs).toEqual([contentHash]);
  });
});
