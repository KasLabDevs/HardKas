// L1-CORE-1 B4 · workflow diff: compares two workflow artifacts the CLI itself wrote (`workflow run` of a plan+simulate
// definition and of a plan-only one, in a simulated workspace), addressed by workflowId, by contentHash and as `latest`.
// The command has no --json; its exit codes and the counts it prints are asserted against the two artifacts, and so are
// its refusals (an unknown id, an artifact that is not a workflow).
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { cli, envelope, simulatedWorkspace, removeDir } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

describe("workflow diff <a> <b>", () => {
  let parent: string;
  let ws: string;
  let wfA: any;
  let wfB: any;

  const run = (name: string, def: unknown) => {
    fs.writeFileSync(path.join(ws, `${name}.json`), JSON.stringify(def));
    const r = cli(["workflow", "run", `${name}.json`, "--json"], ws);
    const doc = envelope(r.stdout);
    if (r.status !== 0 || doc?.status !== "completed") throw new Error(`workflow run ${name} failed (exit ${r.status}):\n${r.all.slice(0, 1500)}`);
    return doc;
  };

  beforeAll(() => {
    ({ parent, ws } = simulatedWorkspace("hk-b4-workflow-diff-"));
    wfA = run("wf-a", { steps: [{ type: "tx.plan", args: { from: "alice", to: "bob", amount: "1" } }, { type: "tx.simulate" }] });
    wfB = run("wf-b", { steps: [{ type: "tx.plan", args: { from: "alice", to: "bob", amount: "3" } }] });
  });
  afterAll(() => removeDir(parent));

  const counts = (stdout: string) => ({
    producedA: /=== Produced Artifacts Diff ===[\s\S]*?A: (\d+) artifacts/.exec(stdout)?.[1],
    producedB: /=== Produced Artifacts Diff ===[\s\S]*?B: (\d+) artifacts/.exec(stdout)?.[1],
    stepsA: /=== Steps Diff ===[\s\S]*?A: (\d+) steps executed/.exec(stdout)?.[1],
    stepsB: /=== Steps Diff ===[\s\S]*?B: (\d+) steps executed/.exec(stdout)?.[1]
  });

  it("by workflowId: exit 0, the step and produced-artifact counts of each artifact", () => {
    const r = cli(["workflow", "diff", wfA.workflowId, wfB.workflowId], ws);
    expect(r.status, r.all.slice(0, 800)).toBe(0);
    expect(r.stdout).toContain(`Comparing Workflow A (${wfA.workflowId}) against Workflow B (${wfB.workflowId})`);
    expect(counts(r.stdout)).toEqual({
      producedA: String(wfA.producedArtifacts.length),
      producedB: String(wfB.producedArtifacts.length),
      stepsA: String(wfA.steps.length),
      stepsB: String(wfB.steps.length)
    });
  });

  it("by contentHash and `latest` (the newest workflow artifact, B) give the same comparison, swapped", () => {
    const r = cli(["workflow", "diff", "latest", wfA.contentHash], ws);
    expect(r.status, r.all.slice(0, 800)).toBe(0);
    expect(r.stdout).toContain(`Comparing Workflow A (${wfB.contentHash}) against Workflow B (${wfA.contentHash})`);
    expect(counts(r.stdout)).toEqual({
      producedA: String(wfB.producedArtifacts.length),
      producedB: String(wfA.producedArtifacts.length),
      stepsA: String(wfB.steps.length),
      stepsB: String(wfA.steps.length)
    });
  });

  it("an id the workspace does not hold: WORKFLOW_DIFF_ERROR, exit 1", () => {
    const r = cli(["workflow", "diff", wfA.workflowId, "wf_does_not_exist"], ws);
    expect(r.status, r.all.slice(0, 800)).toBe(1);
    expect(r.all).toMatch(/\[WORKFLOW_DIFF_ERROR\].*wf_does_not_exist/);
  });

  it("an artifact that is not a workflow (the plan a step produced): refused, exit 1", () => {
    const planId = wfB.producedArtifacts[0];
    expect(planId).toMatch(/^[0-9a-f]{64}$/);
    const r = cli(["workflow", "diff", wfA.workflowId, planId], ws);
    expect(r.status, r.all.slice(0, 800)).toBe(1);
    expect(r.all).toMatch(/\[WORKFLOW_DIFF_ERROR\] Both artifacts must be workflows/);
  });
});
