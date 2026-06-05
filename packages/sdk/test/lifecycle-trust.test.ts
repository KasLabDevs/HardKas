import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hardkas } from "../src/index.js";
import { calculateContentHash, CURRENT_HASH_VERSION, ARTIFACT_SCHEMAS } from "@hardkas/artifacts";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

describe("0.8.12-alpha Lifecycle Integrity & Trust Boundary Tests", () => {
  let sdk: Hardkas;
  let workspaceRoot: string;

  beforeEach(async () => {
    workspaceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-lifecycle-"));
    sdk = await Hardkas.create({
      cwd: workspaceRoot,
      autoBootstrap: true,
      network: "simulated"
    });
  });

  afterEach(() => {
    fs.rmSync(workspaceRoot, { recursive: true, force: true });
  });

  it("1. Fake policyRefs rehashed must fail verification under strict mode", async () => {
    // Write a valid policy
    const policy = {
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.8.12-alpha",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      createdAt: new Date().toISOString(),
      decision: "ALLOW",
      rules: []
    };
    (policy as any).contentHash = calculateContentHash(policy, CURRENT_HASH_VERSION);
    await sdk.artifacts.write(policy as any);

    // Create a plan referencing this policy
    const plan = await sdk.tx.plan({
      from: "alice",
      to: "bob",
      amount: "10",
      policy: policy.contentHash
    });

    // Write the plan
    await sdk.artifacts.write(plan);

    // Tamper by writing a DIFFERENT policy to the same filename but with mutated content (decision: DENY)
    const badPolicy = {
      ...policy,
      decision: "DENY"
    };
    // Keep the original filename but change contents so it has different hash/decision
    const policyPath = path.join(sdk.workspace.artifactsDir, `policy.v1-${policy.contentHash}.json`);
    fs.writeFileSync(policyPath, JSON.stringify(badPolicy, null, 2), "utf-8");

    // Clear artifacts manager memory cache to force disk load
    (sdk.artifacts as any).cache.clear();

    // Verification must fail because of REFERENCE_HASH_MISMATCH
    const result = await sdk.artifacts.verify(plan, { throwOnInvalid: false, strict: true, enforceMetadata: false });
    console.log("TEST 1 DIAGNOSTIC RESULT:", JSON.stringify(result, null, 2));
    expect(result.valid).toBe(false);
    expect(result.details.some((i: any) => i.code === "REFERENCE_HASH_MISMATCH")).toBe(true);
  });

  it("2. Policy DENY must fail plan creation and verification", async () => {
    // Write a DENY policy
    const policy = {
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.8.12-alpha",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      createdAt: new Date().toISOString(),
      decision: "DENY",
      rules: []
    };
    (policy as any).contentHash = calculateContentHash(policy, CURRENT_HASH_VERSION);
    await sdk.artifacts.write(policy as any);

    // Creating plan referencing a DENY policy must throw POLICY_VIOLATION
    await expect(
      sdk.tx.plan({
        from: "alice",
        to: "bob",
        amount: "10",
        policy: policy.contentHash
      })
    ).rejects.toThrow("POLICY_VIOLATION");
  });

  it("3. Deleted/missing policyRefs must fail strict verification", async () => {
    // Reference a policy that was never written
    const fakePolicyId = "a".repeat(64);
    const plan = await sdk.tx.plan({
      from: "alice",
      to: "bob",
      amount: "10"
    });
    // Injects raw reference
    (plan as any).policyRefs = [fakePolicyId];
    // Re-calculate plan hash
    (plan as any).contentHash = calculateContentHash(plan, CURRENT_HASH_VERSION);

    const result = await sdk.artifacts.verify(plan, { throwOnInvalid: false, strict: true });
    expect(result.valid).toBe(false);
    expect(result.details.some((i: any) => i.code === "REFERENCE_MISSING")).toBe(true);
  });

  it("4. Missing policyRefs fails if strict verify runs", async () => {
    const fakePolicyId = "b".repeat(64);
    const plan = await sdk.tx.plan({
      from: "alice",
      to: "bob",
      amount: "10"
    });
    (plan as any).policyRefs = [fakePolicyId];
    (plan as any).contentHash = calculateContentHash(plan, CURRENT_HASH_VERSION);

    // Running artifacts.verify with strict: true must throw REFERENCE_MISSING
    await expect(
      sdk.artifacts.verify(plan, { throwOnInvalid: true, strict: true })
    ).rejects.toThrow("REFERENCE_MISSING");
  });

  it("5. Tampered policy content must fail hash match", async () => {
    const policy = {
      schema: "hardkas.policy.v1",
      hardkasVersion: "0.8.12-alpha",
      version: "1.0.0-alpha",
      networkId: "simnet",
      mode: "simulated",
      createdAt: new Date().toISOString(),
      decision: "ALLOW",
      rules: []
    };
    (policy as any).contentHash = calculateContentHash(policy, CURRENT_HASH_VERSION);
    await sdk.artifacts.write(policy as any);

    // Tamper policy file directly
    const policyFile = path.join(sdk.workspace.artifactsDir, `policy.v1-${policy.contentHash}.json`);
    const content = JSON.parse(fs.readFileSync(policyFile, "utf-8"));
    content.decision = "DENY";
    fs.writeFileSync(policyFile, JSON.stringify(content, null, 2), "utf-8");

    // Verifying policy itself must fail
    const result = await sdk.artifacts.verify(policy.contentHash, { throwOnInvalid: false });
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("content_hash_mismatch");
  });

  it("6. Corrupted lineage parentArtifactId must fail verification", async () => {
    const plan = await sdk.tx.plan({
      from: "alice",
      to: "bob",
      amount: "10"
    });
    await sdk.artifacts.write(plan);

    const signed = await sdk.tx.sign(plan, "alice");
    
    // Corrupt parent ID
    (signed as any).lineage.parentArtifactId = "c".repeat(64);
    (signed as any).contentHash = calculateContentHash(signed, CURRENT_HASH_VERSION);
    (signed as any).lineage.artifactId = (signed as any).contentHash;
    (signed as any).contentHash = calculateContentHash(signed, CURRENT_HASH_VERSION);

    // Parent mismatch or parent missing
    const result = await sdk.artifacts.verify(signed, { throwOnInvalid: false, strict: true });
    expect(result.valid).toBe(false);
    // Since parent is ccccc... which is missing, it will raise PARENT_MISSING (warning) or PARENT_ID_MISMATCH (error)
    // Wait, since we are doing verify on the signed transaction, let's see if lineage transitions fail
    // The verifyLineage expects parent to exist. If it is missing from workspace, and parentObj is null:
    // It raised PARENT_MISSING warning. But wait, verifyLineage also checks:
    // lineage.parentArtifactId !== parentLineage.artifactId. Since parent is missing, parentObj is null.
    // Wait, let's check: if we verify it, it has PARENT_MISSING.
    // What if we pass the REAL parent, but there's a hash mismatch? Let's check with replay verify.
    const replay = await sdk.replay.verify(signed, { throwOnInvalid: false } as any);
    expect(replay.passed).toBe(false);
  });

  it("7. Corrupted lineage sequence must fail verification", async () => {
    const plan = await sdk.tx.plan({
      from: "alice",
      to: "bob",
      amount: "10"
    });
    await sdk.artifacts.write(plan);

    const signed = await sdk.tx.sign(plan, "alice");
    await sdk.artifacts.write(signed);

    const { receipt } = await sdk.tx.simulate(signed);
    
    // Corrupt sequence to be lower than or equal to parent (parent signed sequence is 2)
    const corruptedReceipt = {
      ...receipt,
      lineage: {
        ...receipt.lineage,
        sequence: 1 // Rollback! parent signed sequence is 2
      }
    };
    (corruptedReceipt as any).contentHash = calculateContentHash(corruptedReceipt, CURRENT_HASH_VERSION);
    (corruptedReceipt as any).lineage.artifactId = (corruptedReceipt as any).contentHash;
    (corruptedReceipt as any).contentHash = calculateContentHash(corruptedReceipt, CURRENT_HASH_VERSION);

    const result = await sdk.artifacts.verify(corruptedReceipt, { throwOnInvalid: false, strict: true });
    expect(result.valid).toBe(false);
    expect(result.details.some((i: any) => i.code === "NON_MONOTONIC_SEQUENCE")).toBe(true);
  });

  it("8. Simulate signed without plan context must fail with parent_plan_unresolved error", async () => {
    const plan = await sdk.tx.plan({
      from: "alice",
      to: "bob",
      amount: "10"
    });
    // Do NOT write the plan to disk or memory cache
    const signed = await sdk.tx.sign(plan, "alice");

    // Clear memory cache to ensure it's not resolved from cache
    (sdk.artifacts as any).cache.clear();

    // Clear disk of plan files
    if (fs.existsSync(sdk.workspace.artifactsDir)) {
      const files = fs.readdirSync(sdk.workspace.artifactsDir);
      for (const f of files) {
        if (f.includes("plan-")) {
          fs.unlinkSync(path.join(sdk.workspace.artifactsDir, f));
        }
      }
    }

    // Simulate must fail with parent_plan_unresolved
    await expect(
      sdk.tx.simulate(signed)
    ).rejects.toThrow("parent_plan_unresolved");
  });

  it("9. Replay rejecting lineage transitions", async () => {
    const plan = await sdk.tx.plan({
      from: "alice",
      to: "bob",
      amount: "10"
    });
    await sdk.artifacts.write(plan);

    // Create a trace artifact directly referencing the plan (invalid transition plan -> trace)
    const trace = {
      schema: ARTIFACT_SCHEMAS.TX_TRACE,
      schemaVersion: "hardkas.artifact.v1",
      hardkasVersion: "0.8.12-alpha",
      version: "1.0.0-alpha",
      hashVersion: CURRENT_HASH_VERSION,
      createdAt: new Date().toISOString(),
      txId: "some-tx-id",
      networkId: "simnet",
      mode: "simulated",
      steps: [],
      lineage: {
        artifactId: "",
        lineageId: plan.lineage.lineageId,
        parentArtifactId: plan.contentHash,
        rootArtifactId: plan.lineage.rootArtifactId,
        sequence: 2
      }
    };
    (trace as any).contentHash = calculateContentHash(trace, CURRENT_HASH_VERSION);
    (trace as any).lineage.artifactId = (trace as any).contentHash;
    (trace as any).contentHash = calculateContentHash(trace, CURRENT_HASH_VERSION);
    await sdk.artifacts.write(trace as any);

    const { verifyLineage } = await import("@hardkas/artifacts");
    const linResult = verifyLineage(trace, plan, { strict: true });
    expect(linResult.ok).toBe(false);
    expect(linResult.issues.some((i: any) => i.code === "INVALID_TRANSITION")).toBe(true);
  });
});
