import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * EVI-01 - Evidence Lineage & Integrity
 *
 * Authority: HardKAS Transaction Pipeline Lineage
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Exercises End-to-End Evidence Lineage:
 * 1. Executes a full transaction pipeline (plan -> sign -> send).
 * 2. Collects the resulting artifacts.
 * 3. Verifies the lineage graph points to the correct parents and roots.
 */
export const scenarioEvi01: GateDefinition = {
  id: "EVI-01",
  name: "Evidence Lineage and Integrity",
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

    const code = `
      const hk = await Hardkas.create({
        network: "simnet", mode: "agent",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const alice = await hk.accounts.resolve("alice");
        const bob = await hk.accounts.resolve("bob");

        const plan = await hk.tx.plan({ from: alice, to: bob, amount: 10000000000n });
        const signed = await hk.tx.sign(plan, { account: alice });
        const sendResult = await hk.tx.send(signed);

        __emitEvidence({
          planId: plan.id,
          signedId: signed.id,
          signedParent: signed.lineage?.[0]?.parentArtifactId,
          signedRoot: signed.lineage?.[0]?.rootArtifactId,
          receiptId: sendResult.id,
          receiptParent: sendResult.lineage?.[0]?.parentArtifactId,
          receiptRoot: sendResult.lineage?.[0]?.rootArtifactId
        });
      } catch (e) {
        __emitEvidence({ fatalError: String(e.message || e), stack: e.stack });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "evi-01-lineage.js", code);
    evidence.push("EVI-01 RAW OUTPUT:\\n" + res.stdout + "\\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "EVI-01 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    if (d.fatalError) {
      status = "FAIL";
      assertions.push({
        name: "EVI-01 execution success",
        passed: false,
        error: d.fatalError
      });
      return { status, assertions, evidence };
    }

    assertions.push({
      name: "EVI-01.A Signed artifact lineage points to Plan",
      passed: d.signedParent === d.planId && d.signedRoot === d.planId,
      actual: { signedParent: d.signedParent, signedRoot: d.signedRoot, planId: d.planId }
    });

    assertions.push({
      name: "EVI-01.B Receipt artifact lineage points to Signed",
      passed: d.receiptParent === d.signedId && d.receiptRoot === d.planId,
      actual: { receiptParent: d.receiptParent, receiptRoot: d.receiptRoot, signedId: d.signedId, planId: d.planId }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
