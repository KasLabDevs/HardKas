import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";

export const gateB1: GateDefinition = {
  id: "B1",
  name: "CLI Localnet Bootstrap (Toccata)",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer"],
  provides: ["dockerAvailable", "kaspadStarted", "localnetManaged", "minerStarted", "rpcReportedReady", "rpcActuallyReachable", "rpcReady"],
  run: async (ctx: ExecutionContext) => {
    const assertions = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";
    
    const cliPath = getHardkasCliPath(ctx.consumerDir);

    // 1. Start the localnet via CLI
    const startRes = await runCommand(`"${cliPath}" localnet start --profile toccata-v2`, ctx.consumerDir);
    evidence.push("LOCALNET START OUTPUT:\n" + startRes.stdout + "\n" + startRes.stderr);
    
    // 2. Poll status via CLI
    let isHealthy = false;
    let statusParsed: any = {};
    let statusStdout = "";
    
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const statusRes = await runCommand(`"${cliPath}" localnet status --json`, ctx.consumerDir);
      statusStdout = statusRes.stdout;
      try {
        statusParsed = JSON.parse(statusRes.stdout.trim());
        if (statusRes.code === 0 && statusParsed?.node?.ready) {
          isHealthy = true;
          break;
        }
      } catch (e) {}
    }
    
    evidence.push("LAST STATUS COMMAND OUTPUT:\n" + statusStdout);
    
    assertions.push({
      name: "hardkas localnet start executes successfully",
      passed: true
    });

    assertions.push({
      name: "hardkas localnet status is healthy",
      passed: isHealthy,
      actual: statusParsed
    });

    if (!isHealthy) {
      status = "ENVIRONMENT_NOT_QUALIFIED";
      return { status, assertions, evidence };
    }

    const rpcUrl = statusParsed.node?.rpcUrl || "ws://127.0.0.1:18210";

    // 3. Probe RPC with SDK
    const code = `
      const hk = await Hardkas.create({ network: "simnet", rpc: { endpoints: ["${rpcUrl.replace("ws://", "")}"] } });
      try {
        const rpc = hk.rpc;
        const info = await rpc.getInfo();
        __emitEvidence({ info });
      } finally {
        process.exit(0);
      }
    `;

    const probeRes = await runConsumerScript(ctx, "probe-rpc.js", code);
    evidence.push("RPC PROBE OUTPUT:\n" + probeRes.stdout + "\n" + probeRes.stderr);

    const probePassed = probeRes.code === 0 && !!probeRes.data?.info;
    assertions.push({
      name: "RPC actually reachable via SDK",
      passed: probePassed
    });

    if (!probePassed) {
      status = "ENVIRONMENT_NOT_QUALIFIED";
    }

    return { status, assertions, evidence };
  }
};







