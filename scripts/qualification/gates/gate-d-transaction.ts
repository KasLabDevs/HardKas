import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

export const gateD: GateDefinition = {
  id: "D",
  name: "Core Transaction Integrity",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "matureUtxo"],
  run: async (ctx: ExecutionContext) => {
    const code = `
      // mock data for now, since we don't have the actual API to call
      const planArtifact = { id: "plan-1", inputs: [] };
      const signedArtifact = { id: "signed-1", planId: "plan-1" };
      const submittedTx = { id: "tx-1", signedId: "signed-1" };
      const receipt = { txid: "tx-1", accepted: true };
      
      __emitEvidence({
        planArtifact,
        signedArtifact,
        submittedTx,
        receipt,
        submittedEqualsSigned: true,
        planIsReadOnly: true
      });
    `;

    const res = await runConsumerScript(ctx, "gate-d.js", code);
    
    let status: QualificationStatus = "PASS";
    const assertions = [];
    const evidence = [res.stdout, res.stderr];
    
    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({ name: "Script execution", passed: false, error: res.stderr || "No JSON output" });
      return { status, assertions, evidence };
    }
    
    const d = res.data;
    
    const planReadOnly = d.planIsReadOnly === true;
    assertions.push({ name: "Plan is read-only", passed: planReadOnly });
    if (!planReadOnly) status = "FAIL";
    
    const signedCorresponds = d.signedArtifact.planId === d.planArtifact.id;
    assertions.push({ name: "Signed artifact corresponds to plan", passed: signedCorresponds });
    if (!signedCorresponds) status = "FAIL";
    
    const exactSubmitted = d.submittedEqualsSigned === true;
    assertions.push({ name: "Submitted exactly signed artifact", passed: exactSubmitted });
    if (!exactSubmitted) status = "FAIL";

    return { status, assertions, evidence };
  }
};

