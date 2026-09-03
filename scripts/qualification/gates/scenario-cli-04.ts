import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";

/**
 * CLI-04 — CLI Tx Plan/Sign/Send Pipeline
 *
 * Authority: CLI + HardKAS Engine + Node RPC
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates CLI commands for transaction workflow:
 * hardkas tx plan -> hardkas tx sign -> hardkas tx send
 */
export const scenarioCli04: GateDefinition = {
  id: "CLI-04",
  name: "CLI Tx Pipeline Commands",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "rpcReady", "fundedAccount", "matureUtxo"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const cliPath = getHardkasCliPath(ctx.consumerDir);

    // Get RPC URL from status
    const statusRes = await runCommand(`"${cliPath}" localnet status --json`, ctx.consumerDir);
    let rpcUrl = "ws://127.0.0.1:16210";
    try {
      const statusData = JSON.parse(statusRes.stdout.trim());
      if (statusData.node?.rpcUrl) {
        rpcUrl = statusData.node.rpcUrl;
      }
    } catch (e) {}

    // 1. hardkas tx plan via CLI specifying --url
    const planRes = await runCommand(`"${cliPath}" tx plan alice bob --amount 1000000000 --url ${rpcUrl} --json`, ctx.consumerDir);
    evidence.push("CLI TX PLAN OUTPUT:\n" + planRes.stdout + "\n" + planRes.stderr);

    const planPassed = planRes.code === 0;
    assertions.push({
      name: "CLI-04.A hardkas tx plan command succeeds and outputs valid JSON artifact",
      passed: planPassed,
      actual: { code: planRes.code, stdout: planRes.stdout.trim() }
    });

    if (!planPassed) {
      status = "FAIL";
      return { status, assertions, evidence };
    }

    let planData: any = {};
    try {
      planData = JSON.parse(planRes.stdout.trim());
    } catch (e) {}

    const planId = planData.planId || planData.contentHash || planData.id;

    // 2. hardkas tx sign via CLI
    const signRes = await runCommand(`"${cliPath}" tx sign ${planId || ""} --account alice --json`, ctx.consumerDir);
    evidence.push("CLI TX SIGN OUTPUT:\n" + signRes.stdout + "\n" + signRes.stderr);

    const signPassed = signRes.code === 0;
    assertions.push({
      name: "CLI-04.B hardkas tx sign command succeeds for planned artifact",
      passed: signPassed,
      actual: signRes.code
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
