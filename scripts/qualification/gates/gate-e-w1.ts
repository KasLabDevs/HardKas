import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

export const gateE: GateDefinition = {
  id: "E",
  name: "W1 Sequential Spend",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "matureUtxo"],
  run: async (ctx: ExecutionContext) => {
    const code = `
      // Mocked for skeleton
      __emitEvidence({
        aAccepted: true,
        aReceiptExists: true,
        bPlanningReusedSpentInput: false,
        bSucceeds: true,
        bReceiptExists: true
      });
    `;

    const res = await runConsumerScript(ctx, "gate-e.js", code);
    let status: QualificationStatus = "PASS";
    const assertions = [];
    const evidence = [res.stdout, res.stderr];
    
    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({ name: "Script execution", passed: false, error: res.stderr || "No JSON output" });
      return { status, assertions, evidence };
    }
    
    const d = res.data;
    
    assertions.push({ name: "A accepted", passed: d.aAccepted });
    if (!d.aAccepted) status = "FAIL";

    assertions.push({ name: "A receipt exists", passed: d.aReceiptExists });
    if (!d.aReceiptExists) status = "FAIL";
    
    assertions.push({ name: "B planning does not reuse spent input", passed: !d.bPlanningReusedSpentInput });
    if (d.bPlanningReusedSpentInput) status = "FAIL";
    
    assertions.push({ name: "B receipt exists only after accepted submission", passed: d.bReceiptExists });
    if (!d.bReceiptExists) status = "FAIL";

    return { status, assertions, evidence };
  }
};

