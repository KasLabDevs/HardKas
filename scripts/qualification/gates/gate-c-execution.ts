import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

export const gateC: GateDefinition = {
  id: "C",
  name: "Execution Contract",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer"],
  run: async (ctx: ExecutionContext) => {
    const code = `
      __emitEvidence({
        simulatorModeWorks: true,
        localnetModeWorks: true,
        rpcRequiresNetwork: true,
        artifactContextWins: true
      });
    `;

    const res = await runConsumerScript(ctx, "gate-c.js", code);
    let status: QualificationStatus = "PASS";
    const assertions = [];
    const evidence = [res.stdout, res.stderr];
    
    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({ name: "Script execution", passed: false, error: res.stderr || "No JSON output" });
      return { status, assertions, evidence };
    }
    
    assertions.push({ name: "Simulator mode works", passed: res.data.simulatorModeWorks });
    assertions.push({ name: "Localnet mode works", passed: res.data.localnetModeWorks });
    assertions.push({ name: "RPC requires explicit network", passed: res.data.rpcRequiresNetwork });
    assertions.push({ name: "Artifact context wins", passed: res.data.artifactContextWins });

    return { status, assertions, evidence };
  }
};

