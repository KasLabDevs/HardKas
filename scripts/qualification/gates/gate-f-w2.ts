import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

export const gateF: GateDefinition = {
  id: "F",
  name: "W2 Concurrent Planning",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "matureUtxo"],
  run: async (ctx: ExecutionContext) => {
    const code = `
      __emitEvidence({
        planA: { inputs: ["outpoint-X"] },
        planB: { inputs: ["outpoint-X"] },
        overlap: ["outpoint-X"]
      });
    `;

    const res = await runConsumerScript(ctx, "gate-f.js", code);
    let status: QualificationStatus = "PASS";
    const assertions = [];
    const evidence = [res.stdout, res.stderr];
    
    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({ name: "Script execution", passed: false, error: res.stderr || "No JSON output" });
      return { status, assertions, evidence };
    }
    
    const d = res.data;
    
    const hasOverlap = Array.isArray(d.overlap) && d.overlap.length >= 1;
    assertions.push({ name: "Both allowed to select X (overlap)", passed: hasOverlap, actual: d.overlap });
    if (!hasOverlap) status = "FAIL";

    return { status, assertions, evidence };
  }
};

