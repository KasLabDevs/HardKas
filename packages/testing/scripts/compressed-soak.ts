import { Hardkas } from "@hardkas/sdk";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { verifyLineage, calculateContentHash } from "@hardkas/artifacts";

async function runSoak() {
  console.log("Starting FASE 6C: Compressed Soak Test (30 minutes)...");
  const sdk = await Hardkas.create();

  const startTime = Date.now();
  const DURATION_MS = 30 * 60 * 1000;
  const CHECKPOINT_INTERVAL = 60 * 1000;
  let lastCheckpoint = startTime;

  const metrics = {
    cycles: 0,
    policyRefsVerified: 0,
    networkRefsVerified: 0,
    assumptionRefsVerified: 0,
    lineageWithContextPassed: 0,
    hashDrift: 0,
    brokenRefs: 0,
    memoryStart: process.memoryUsage().heapUsed,
    memoryPeak: 0
  };

  const alice = await sdk.accounts.resolve("alice");
  const bob = await sdk.accounts.resolve("bob");

  let criticalFailure = null;

  try {
    while (Date.now() - startTime < DURATION_MS) {
      if (criticalFailure) break;

      const cycleId = crypto.randomBytes(8).toString("hex");

      // 1. Context Artifacts
      const policy = {
        schema: "hardkas.policy.v1",
        hardkasVersion: "0.11.3-alpha",
        version: "1.0.0-alpha",
        decision: "ALLOW",
        rules: [{ id: "cycle", result: true, inputHash: cycleId }],
        createdAt: new Date().toISOString()
      };

      const netProfile = {
        schema: "hardkas.networkProfile.v1",
        hardkasVersion: "0.11.3-alpha",
        version: "1.0.0-alpha",
        networkId: "simnet",
        layer: "L1",
        capabilities: { supports_rbf: false, gas_model: "utxo" },
        createdAt: new Date().toISOString()
      };

      const assumption = {
        schema: "hardkas.assumption.v1",
        hardkasVersion: "0.11.3-alpha",
        version: "1.0.0-alpha",
        conditions: [{ key: "cycle", value: cycleId }],
        createdAt: new Date().toISOString()
      };

      const pHash = calculateContentHash(policy, 2);
      const nHash = calculateContentHash(netProfile, 2);
      const aHash = calculateContentHash(assumption, 2);

      (policy as any).contentHash = pHash;
      (netProfile as any).contentHash = nHash;
      (assumption as any).contentHash = aHash;

      // Save them (if SDK exposes save artifact, or just pass them raw)
      // We will pass the raw objects to plan as we added support for it
      sdk.artifacts.cacheArtifact(policy);
      sdk.artifacts.cacheArtifact(netProfile);
      sdk.artifacts.cacheArtifact(assumption);

      // 2. Tx Plan
      const plan = await sdk.tx.plan({
        from: alice,
        to: bob,
        amount: 100000000n, // 1 KAS
        policy: pHash,
        networkProfile: nHash,
        assumption: aHash
      });

      // Verification of Refs
      const anyPlan = plan as any;
      if (
        anyPlan.policyRef !== pHash ||
        anyPlan.networkProfileRef !== nHash ||
        anyPlan.assumptionRef !== aHash
      ) {
        console.error("DEBUG:", {
          pHash,
          nHash,
          aHash,
          policyRef: anyPlan.policyRef,
          networkProfileRef: anyPlan.networkProfileRef,
          assumptionRef: anyPlan.assumptionRef
        });
        metrics.brokenRefs++;
        criticalFailure = "Broken Refs in TxPlan";
        break;
      } else {
        metrics.policyRefsVerified++;
        metrics.networkRefsVerified++;
        metrics.assumptionRefsVerified++;
      }

      // Hash Drift Check
      const hash1 = calculateContentHash(anyPlan, 2);
      const hash2 = calculateContentHash(JSON.parse(JSON.stringify(anyPlan)), 2);
      if (hash1 !== hash2 || hash1 !== anyPlan.contentHash) {
        metrics.hashDrift++;
        criticalFailure = "Hash Drift Detected";
        break;
      }

      // 3. Sign
      const signed = await sdk.tx.sign(plan, alice);

      // 4. Simulate/Send
      const result = await sdk.tx.send(signed);
      const receipt = result.receipt;

      // 5. Lineage Check
      const r1 = verifyLineage(signed, plan, { strict: true });
      const r2 = verifyLineage(receipt, signed, { strict: true });
      if (!r1.ok || !r2.ok) {
        console.error(
          "DEBUG plan contentHash:",
          plan.contentHash,
          "signed parent:",
          signed.lineage?.parentArtifactId
        );
        console.error("DEBUG receipt:", JSON.stringify(receipt, null, 2));
        console.error("DEBUG Lineage r1:", JSON.stringify(r1, null, 2));
        console.error("DEBUG Lineage r2:", JSON.stringify(r2, null, 2));
        criticalFailure = "Broken Lineage Flow";
        break;
      }
      metrics.lineageWithContextPassed++;
      metrics.cycles++;

      // Checkpoint
      const now = Date.now();
      if (now - lastCheckpoint >= CHECKPOINT_INTERVAL) {
        const elapsedMin = Math.floor((now - startTime) / 60000);
        const heap = process.memoryUsage().heapUsed;
        if (heap > metrics.memoryPeak) metrics.memoryPeak = heap;
        console.log(
          `[Checkpoint ${elapsedMin}m] Cycles: ${metrics.cycles} | Heap: ${(heap / 1024 / 1024).toFixed(2)} MB`
        );
        lastCheckpoint = now;

        // Memory leak sanity check (if heap grows beyond 1GB we stop)
        if (heap > 1024 * 1024 * 1024) {
          criticalFailure = "OOM / Memory Leak detected (Heap > 1GB)";
          break;
        }
      }
    }
  } catch (e: unknown) {
    criticalFailure = `Exception: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`;
    console.error(e);
  }

  const reportsDir = path.join(process.cwd(), "reports");
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });
  fs.writeFileSync(
    path.join(reportsDir, "soak-6c-084.json"),
    JSON.stringify(metrics, null, 2)
  );

  console.log("\n=== SOAK TEST RESULTS ===");
  console.log(JSON.stringify(metrics, null, 2));

  if (criticalFailure) {
    console.error(`\n❌ FAILED: ${criticalFailure}`);
    process.exit(1);
  } else {
    console.log("\n✅ PASS: 0 CRITICAL, 0 HIGH");
    process.exit(0);
  }
}

runSoak().catch((e) => {
  console.error("Fatal Crash:", e);
  process.exit(1);
});
