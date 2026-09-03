import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * WRK-01 — Transactional Workflows & WorkflowId Binding
 *
 * Authority: HardKAS Workflow Engine & Tx Planner
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates transactional workflow ID binding:
 * 1. Pass explicit workflowId to hk.tx.plan.
 * 2. Assert generated plan artifact contains exact workflowId (no fallback).
 */
export const scenarioWrk01: GateDefinition = {
  id: "WRK-01",
  name: "Transactional Workflow ID Binding",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const code = `
      try {
        const hk = await Hardkas.create({ mode: "developer" });

        const alice = await hk.accounts.resolve("alice");
        const bob = await hk.accounts.resolve("bob");

        const requestedWorkflowId = "wf-custom-qualification-id-123";
        const plan = await hk.tx.plan({
          from: alice,
          to: bob,
          amount: 1000000n,
          workflowId: requestedWorkflowId
        });

        __emitEvidence({
          planCreated: !!plan,
          workflowId: plan.workflowId,
          requestedWorkflowId
        });
      } catch (e) {
        __emitEvidence({
          success: false,
          error: e.message,
          stack: e.stack
        });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "wrk-01-workflow.js", code);
    evidence.push("WRK-01 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "WRK-01 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // Strict assertion: plan.workflowId MUST match requestedWorkflowId exactly
    const workflowBound = d.planCreated === true && d.workflowId === "wf-custom-qualification-id-123";
    assertions.push({
      name: "WRK-01.A Deterministic workflow ID preserved in generated plan artifact",
      passed: workflowBound,
      actual: { planCreated: d.planCreated, workflowId: d.workflowId, expected: "wf-custom-qualification-id-123" }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
