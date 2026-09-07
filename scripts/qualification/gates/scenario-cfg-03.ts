import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

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

        // Use a tiny amount so exactly 1 input and 1 change output are used in both cases
        // (Since Alice has large UTXOs from mining)
        const amount = 1000n;

        // 1. Baseline plan with default config feeRate
        const baselinePlan = await hk.tx.plan({
          from: alice,
          to: bob,
          amount
        });

        // 2. Plan passing explicit feeRate override
        const explicitFeeRate = 15000n;
        const plan = await hk.tx.plan({
          from: alice,
          to: bob,
          amount,
          feeRate: explicitFeeRate
        });

        const baselineFee = BigInt(baselinePlan.estimatedFeeSompi || "0");
        const overrideFee = BigInt(plan.estimatedFeeSompi || "0");
        
        const baselineInputs = baselinePlan.inputs?.length || 0;
        const overrideInputs = plan.inputs?.length || 0;

        __emitEvidence({
          networkMatches: hk.network === "simnet",
          sameTxShape: baselineInputs > 0 && baselineInputs === overrideInputs,
          overrideFeeIsLarger: overrideFee > baselineFee,
          rawFee: { baseline: baselineFee.toString(), override: overrideFee.toString() },
          rawInputs: { baseline: baselineInputs, override: overrideInputs }
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

    const res = await runConsumerScript(ctx, "cfg-03-precedence.ts", code);
    evidence.push("CFG-03 RAW OUTPUT:\\n" + res.stdout + "\\n" + res.stderr);

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
      name: "CFG-03.B Explicit feeRate method override produces larger fee matching expected policy (same tx shape)",
      passed: d.sameTxShape === true && d.overrideFeeIsLarger === true,
      actual: { sameTxShape: d.sameTxShape, overrideFeeIsLarger: d.overrideFeeIsLarger, rawFee: d.rawFee, rawInputs: d.rawInputs }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
