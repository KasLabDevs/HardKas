import { test, expect, beforeAll, afterAll } from "vitest";
import { Hardkas } from "../src/index.js";
import { ARTIFACT_SCHEMAS } from "@hardkas/artifacts";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

let tmpDir: string;

beforeAll(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-hotfix-"));
});

afterAll(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test("tx.simulate should not crash with .map undefined on in-memory signed artifacts when only receipt is on disk", async () => {
  const hk = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    cwd: tmpDir
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
  // The plan was already executed by the first simulate (the simulator's ledger is durable), so executing it again is
  // refused: what the hotfix guards is HOW it answers. It must be the simulator's own refusal of an already-spent input,
  // never a TypeError from reading the receipt as if it were a plan.
  const again = await hk.tx.simulate(signed).then(
    (r) => ({ ok: true as const, r }),
    (e: unknown) => ({ ok: false as const, e })
  );
  if (again.ok) {
    expect(again.r.receipt.status).not.toBe("failed");
  } else {
    expect(again.e).not.toBeInstanceOf(TypeError);
    expect(String((again.e as Error).message)).toMatch(/invalid simulated input/);
    expect(String((again.e as Error).message)).not.toMatch(/\.map|undefined is not/);
  }
}, 20000);

test("artifacts.read should fail if expectedSchema is mismatched", async () => {
  const hk = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    cwd: tmpDir
  });

  const plan = await hk.tx.plan({
    from: "alice",
    to: "bob",
    amount: 10,
    network: "simulated"
  });

  const simResult = await hk.tx.simulate(plan);

  // Try to read the plan by ID. Since it's not saved, it shouldn't return the receipt.
  await expect(
    hk.artifacts.read(plan.planId, { expectedSchema: ARTIFACT_SCHEMAS.TX_PLAN })
  ).rejects.toThrow();

  // Read the receipt by its txId (a txId is looked up as { tx }, never as a bare string: that is a path or an artifactId)
  const receipt = await hk.artifacts.read({ tx: simResult.receipt.txId });
  expect(receipt.schema).toBe(ARTIFACT_SCHEMAS.TX_RECEIPT);
}, 20000);
