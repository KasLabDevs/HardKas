import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * TX-02 � Multi-Input / Change / Fees (Docker Real)
 *
 * Authority: rusty-kaspad RPC + HardKAS TX Builder
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Exercises multi-input selection, change output generation, fee calculation,
 * signing, and real submission to a running rusty-kaspad node.
 */
export const scenarioTx02: GateDefinition = {
  id: "TX-02",
  name: "Multi-Input / Change / Fees",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "rpcReady", "fundedAccount", "matureUtxo"],
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

    // Script: Plan a spend requiring multiple inputs (1,200 KAS = 120,000,000,000 sompi)
    const code = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const alice = await hk.accounts.resolve("alice");
        const bob = await hk.accounts.resolve("bob");

        // Spend 1,200 KAS (120,000,000,000 sompi) � exceeds single coinbase UTXO (~500 KAS)
        const amountSompi = 120000000000n;

        // 1. Plan
        const plan = await hk.tx.plan({
          from: alice,
          to: bob,
          amount: amountSompi
        });

        // Extract plan metrics
        const inputCount = plan.inputs ? plan.inputs.length : (plan.plan?.inputs?.length || 0);
        const outputs = plan.outputs || plan.plan?.outputs || [];
        const changeOutput = plan.change || plan.plan?.change || outputs.find(o => o.address === alice.address);
        const feeSompi = plan.estimatedFeeSompi || plan.plan?.feeSompi?.toString() || "0";
        const changeSompi = changeOutput ? (changeOutput.amountSompi || "0").toString() : "0";

        // 2. Sign
        const signed = await hk.tx.sign(plan, { account: alice });

        // 3. Send to real node
        const sendResult = await hk.tx.send(signed);

        __emitEvidence({
          success: true,
          planId: plan.planId,
          inputCount,
          outputCount: outputs.length,
          hasChangeOutput: !!changeOutput,
          changeSompi,
          feeSompi,
          signedId: signed.signedId,
          txId: sendResult.txId || sendResult.receipt?.txId,
          submitted: sendResult.submitted !== false
        });
      } catch (e) {
        __emitEvidence({
          success: false,
          error: String(e.message || e), code: String(e.code || "ERR"),
          code: e.code,
          stack: e.stack
        });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "tx-02-multi-input.js", code);
    evidence.push("TX-02 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "TX-02 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // TX-02.A: Multi-input selection (>= 2 inputs)
    assertions.push({
      name: "TX-02.A plan uses >= 2 inputs to cover amount",
      passed: d.success && d.inputCount >= 2,
      actual: d.inputCount
    });

    // TX-02.B: Change output generated
    assertions.push({
      name: "TX-02.B change output generated for remaining balance",
      passed: d.success && d.hasChangeOutput === true && BigInt(d.changeSompi || 0) > 0n,
      actual: { hasChangeOutput: d.hasChangeOutput, changeSompi: d.changeSompi }
    });

    // TX-02.C: Non-zero fee calculated
    assertions.push({
      name: "TX-02.C non-zero fee calculated",
      passed: d.success && BigInt(d.feeSompi || 0) > 0n,
      actual: d.feeSompi
    });

    // TX-02.D: Signing succeeds
    assertions.push({
      name: "TX-02.D hk.tx.sign succeeds on multi-input plan",
      passed: d.success && !!d.signedId,
      actual: d.signedId
    });

    // TX-02.E: Submission succeeds against rusty-kaspad
    assertions.push({
      name: "TX-02.E hk.tx.send submits multi-input tx to real node",
      passed: d.success && d.submitted === true,
      actual: d.submitted
    });

    // TX-02.F: Real txid returned by node
    assertions.push({
      name: "TX-02.F node returns valid txid on multi-input acceptance",
      passed: d.success && typeof d.txId === "string" && d.txId.length === 64,
      actual: d.txId
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
