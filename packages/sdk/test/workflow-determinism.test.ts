import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hardkas } from "../src/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { HARDKAS_VERSION } from "@hardkas/artifacts";

describe("Deterministic Workflow Identity", () => {
  let tmpDir: string;
  let sdkAgent: Hardkas;
  let sdkDev: Hardkas;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-det-"));
    fs.writeFileSync(path.join(tmpDir, "hardkas.config.ts"), "export default {};");

    sdkAgent = await Hardkas.open({ cwd: tmpDir, mode: "agent" });
    sdkDev = await Hardkas.open({ cwd: tmpDir, mode: "developer" });
  });

  afterAll(() => {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  const getSpec = (amount: number) => ({
    steps: [
      {
        type: "tx.plan",
        from: "alice",
        to: "bob",
        amount
      }
    ],
    dryRun: true
  });

  it("identical workflow executions produce identical workflowId", async () => {
    const w1 = await sdkDev.workflow.run(getSpec(10));
    const w2 = await sdkDev.workflow.run(getSpec(10));

    expect(w1.workflowId).toBe(w2.workflowId);
    expect(w1.workflowId.startsWith("wf_")).toBe(true);
    expect(w1.workflowId.length).toBeGreaterThan(10);
  });

  it("changed inputs change workflowId", async () => {
    const w1 = await sdkDev.workflow.run(getSpec(10));
    const w2 = await sdkDev.workflow.run(getSpec(20));

    expect(w1.workflowId).not.toBe(w2.workflowId);
  });

  it("changed policy/mode changes workflowId", async () => {
    const wDev = await sdkDev.workflow.run(getSpec(10));
    const wAgent = await sdkAgent.workflow.run(getSpec(10));

    expect(wDev.workflowId).not.toBe(wAgent.workflowId);
  });

  it("no ambient time/randomness participates in canonical workflow identity", async () => {
    const originalDateNow = Date.now;
    const originalMathRandom = Math.random;

    let dateCalled = false;
    let randomCalled = false;

    Date.now = () => {
      dateCalled = true;
      return 1000000000000;
    };

    Math.random = () => {
      randomCalled = true;
      return 0.5;
    };

    try {
      const w1 = await sdkDev.workflow.run(getSpec(10));
      Date.now = () => 2000000000000; // Change time
      Math.random = () => 0.9; // Change random
      const w2 = await sdkDev.workflow.run(getSpec(10));

      expect(w1.workflowId).toBe(w2.workflowId);

      // Even if Date.now or Math.random were called for OTHER things (like timestamps),
      // they did not affect the workflowId.
    } finally {
      Date.now = originalDateNow;
      Math.random = originalMathRandom;
    }
  });

  it("standalone artifacts use sentinel value and are not confused with replayable workflows", async () => {
    // Write an artifact explicitly without a workflow run
    const result = await sdkDev.artifacts.write({
      schema: "artifact",
      networkId: "simnet",
      version: "1.0",
      createdAt: new Date().toISOString()
    } as any);

    // Read it back
    const fileContent = fs.readFileSync(result.absolutePath!, "utf-8");
    const parsed = JSON.parse(fileContent);

    // It should not have a workflowId embedded by default
    expect(parsed.workflowId).toBeUndefined();

    // Core events would emit wf_unknown_standalone but the file itself is pristine
    // Let's verify we don't accidentally write 'wf_unknown_standalone' inside the file
    expect(JSON.stringify(parsed)).not.toContain("wf_unknown_standalone");
  });
});
