import { test, expect } from "vitest";
import { Hardkas } from "../src/index.js";
import { ARTIFACT_SCHEMAS } from "@hardkas/artifacts";

test("tx.simulate should not crash with .map undefined on in-memory signed artifacts when only receipt is on disk", async () => {
  const hk = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    cwd: process.cwd()
  });

  // Create a plan without saving it to disk
  const plan = await hk.tx.plan({
    from: "alice",
    to: "bob",
    amount: 10,
    network: "simulated"
  });

  // Simulate the plan -> this creates a receipt on disk (with planId in the filename)
  const simResult = await hk.tx.simulate(plan);
  expect(simResult.receipt.schema).toBe(ARTIFACT_SCHEMAS.TX_RECEIPT);

  // Sign the plan
  const signed = await hk.tx.sign(plan, "alice");

  // Re-simulate the signed artifact. 
  // Before hotfix 0.7.13, artifacts.read greedily matched the receipt, passed it to applySimulatedPlan, and crashed on .map.
  // Now, it should handle it gracefully using normalizeSimulatedPlanInput.
  const simResult2 = await hk.tx.simulate(signed);
  expect(simResult2.receipt.status).not.toBe("failed");
  
  // We can also test idempotency by sending
  const res = await hk.tx.send(signed);
  expect(res.status).not.toBe("failed");
});

test("artifacts.read should fail if expectedSchema is mismatched", async () => {
  const hk = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    cwd: process.cwd()
  });

  const plan = await hk.tx.plan({
    from: "alice",
    to: "bob",
    amount: 10,
    network: "simulated"
  });
  
  const simResult = await hk.tx.simulate(plan);
  
  // Try to read the plan by ID. Since it's not saved, it shouldn't return the receipt.
  await expect(hk.artifacts.read(plan.planId, { expectedSchema: ARTIFACT_SCHEMAS.TX_PLAN })).rejects.toThrow();
  
  // Read the receipt directly
  const receipt = await hk.artifacts.read(simResult.receipt.txId);
  expect(receipt.schema).toBe(ARTIFACT_SCHEMAS.TX_RECEIPT);
});
