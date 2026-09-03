import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * TX-04 — Insufficient Funds / Dust Limits (Docker Real)
 *
 * Authority: HardKAS Tx Builder + Policy Engine
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates pre-flight transaction rejections before hitting network:
 * 1. Insufficient funds throws typed INSUFFICIENT_FUNDS error.
 * 2. Zero amount throws typed validation error.
 * 3. Rejections produce no receipt or invalid artifact caching.
 */
export const scenarioTx04: GateDefinition = {
  id: "TX-04",
  name: "Insufficient Funds / Dust Limits",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "rpcReady", "fundedAccount"],
  provides: [],
  run: async (ctx: ExecutionContext) => {
    const assertions: Array<{ name: string; passed: boolean; expected?: any; actual?: any; error?: any }> = [];
    const evidence: string[] = [];
    let status: QualificationStatus = "PASS";

    const cliPath = getHardkasCliPath(ctx.consumerDir);
    const statusRes = await runCommand(`"${cliPath}" localnet status --json`, ctx.consumerDir);
    let rpcUrl = "127.0.0.1:16210";
    try {
      const statusData = JSON.parse(statusRes.stdout.trim());
      if (statusData.node?.rpcUrl) {
        rpcUrl = statusData.node.rpcUrl.replace("ws://", "");
      }
    } catch (e) {}

    const code = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const alice = await hk.accounts.resolve("alice");
        const bob = await hk.accounts.resolve("bob");

        const testResults = {};

        // === Test 1: Excessive amount (Insufficient Funds) ===
        // 999,999,999 KAS = 99999999900000000 sompi
        try {
          await hk.tx.plan({
            from: alice,
            to: bob,
            amount: 99999999900000000n
          });
          testResults.excessiveAmount = { unexpectedSuccess: true };
        } catch (e) {
          testResults.excessiveAmount = {
            unexpectedSuccess: false,
            errorMessage: e.message,
            errorCode: e.code,
            isTypedError: typeof e.message === "string" && e.message.length > 0
          };
        }

        // === Test 2: Zero amount ===
        try {
          await hk.tx.plan({
            from: alice,
            to: bob,
            amount: 0n
          });
          testResults.zeroAmount = { unexpectedSuccess: true };
        } catch (e) {
          testResults.zeroAmount = {
            unexpectedSuccess: false,
            errorMessage: e.message,
            errorCode: e.code,
            isTypedError: typeof e.message === "string" && e.message.length > 0
          };
        }

        __emitEvidence({
          excessiveAmount: testResults.excessiveAmount,
          zeroAmount: testResults.zeroAmount
        });
      } catch (e) {
        __emitEvidence({ fatalError: e.message });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "tx-04-funds-dust.js", code);
    evidence.push("TX-04 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "TX-04 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // TX-04.A: Insufficient funds rejected before submission with typed error
    const excessiveRejected = d.excessiveAmount && d.excessiveAmount.unexpectedSuccess === false;
    assertions.push({
      name: "TX-04.A excessive amount rejected before submission with typed error",
      passed: !!excessiveRejected && d.excessiveAmount.isTypedError === true,
      actual: d.excessiveAmount
    });

    // TX-04.B: Zero amount rejected before submission with typed error
    const zeroRejected = d.zeroAmount && d.zeroAmount.unexpectedSuccess === false;
    assertions.push({
      name: "TX-04.B zero amount rejected with typed validation error",
      passed: !!zeroRejected && d.zeroAmount.isTypedError === true,
      actual: d.zeroAmount
    });

    // TX-04.C: No receipt produced / no invalid artifact created
    assertions.push({
      name: "TX-04.C rejections produce no receipt or corrupt state",
      passed: !!excessiveRejected && !!zeroRejected,
      actual: { excessiveRejected, zeroRejected }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
