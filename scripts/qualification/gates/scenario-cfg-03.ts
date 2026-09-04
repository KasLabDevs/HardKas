import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * CFG-03 � Config & Precedence Resolution (Method Overrides > Config)
 *
 * Authority: HardKAS Config Engine
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates precedence resolution:
 * 1. Method arguments (e.g. feeRate: 15000n) take precedence over default config.
 * 2. Explicit network option in Hardkas.create takes precedence over defaultNetwork.
 */
export const scenarioCfg03: GateDefinition = {
  id: "CFG-03",
  name: "Config Precedence Resolution",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const cliPath = getHardkasCliPath(ctx.consumerDir);
    const statusRes = await runCommand(`"${cliPath}" localnet status --json`, ctx.consumerDir);
    let rpcUrl = "127.0.0.1:18210";
    try {
      const statusData = JSON.parse(statusRes.stdout.trim());
      if (statusData.node?.rpcUrl) {
        rpcUrl = statusData.node.rpcUrl.replace("ws://", "");
      }
    } catch (e) {}

    const code = `
      try {
        const hk = await Hardkas.create({
          mode: "developer",
          network: "simnet",
          rpc: { endpoints: ["${rpcUrl}"] }
        });

        const alice = await hk.accounts.resolve("alice");
        const bob = await hk.accounts.resolve("bob");

        // Plan transaction passing explicit feeRate override
        const plan = await hk.tx.plan({
          from: alice,
          to: bob,
          amount: 1000000n,
          feeRate: 15000n
        });

        __emitEvidence({
          networkMatches: hk.network === "simnet",
          explicitFeeRate: plan.feeRate === "15000" || plan.feeRate === 15000 || plan.feeRateSompi === "15000",
          rawFeeRate: plan.feeRate || plan.feeRateSompi
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

    const res = await runConsumerScript(ctx, "cfg-03-precedence.js", code);
    evidence.push("CFG-03 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "CFG-03 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    assertions.push({
      name: "CFG-03.A Explicit network option in Hardkas.create takes precedence",
      passed: d.networkMatches === true,
      actual: d.networkMatches
    });

    assertions.push({
      name: "CFG-03.B Explicit feeRate method override takes precedence in generated plan",
      passed: d.explicitFeeRate === true,
      actual: { explicitFeeRate: d.explicitFeeRate, rawFeeRate: d.rawFeeRate }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
