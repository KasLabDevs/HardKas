import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { runWorkflowRun } from "../src/runners/workflow-runner.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("Workflow Simulated Run", () => {
  let tmpDir: string;
  let workflowPath: string;

  beforeAll(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-workflow-test-"));
    workflowPath = path.join(tmpDir, "test-workflow.json");

    // Init minimal project with funded localnet state
    fs.writeFileSync(
      path.join(tmpDir, "hardkas.config.ts"),
      "export default { defaultNetwork: 'simulated' };"
    );

    // We mock the localnet state file here since we don't have the CLI runner directly available
    // But testing that runWorkflowRun doesn't hang is the main goal
    const wf = {
      name: "Simulated Test",
      steps: [{ type: "network.switch", args: { network: "simulated" } }]
    };
    fs.writeFileSync(workflowPath, JSON.stringify(wf));
  });

  afterAll(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should run successfully in offline mode with timeout without hanging", async () => {
    const options = {
      workspaceRoot: tmpDir,
      network: "simulated",
      offline: true,
      timeout: "5000",
      json: true
    };

    // We expect this NOT to hang. Since it's a simple workflow without tx.plan it finishes quickly.
    // We could add a tx.plan but we don't have an easy way to mock UTXOs in this pure unit test.
    // The key is that the option parsing works and network setting works.
    await expect(runWorkflowRun(workflowPath, options)).resolves.not.toThrow();
  });
});
