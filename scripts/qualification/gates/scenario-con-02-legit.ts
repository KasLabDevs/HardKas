import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * CON-02-LEGIT — Legitimate Single-UTXO Cross-Process Concurrency
 *
 * Authority: rusty-kaspad Mempool + HardKAS TX Planner
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Legitimate cross-process double-spend conflict without any plan mutations:
 * 1. Fund a fresh account (alice_single) with EXACTLY ONE UTXO.
 * 2. Worker A and Worker B independently run standard hk.tx.plan({ from: alice_single, ... }).
 * 3. Both workers naturally select the single available UTXO without manual plan alterations.
 * 4. Both workers sign and submit simultaneously.
 * 5. Node accepts exactly 1 and rejects the second with double spend.
 */
export const scenarioCon02Legit: GateDefinition = {
  id: "CON-02-LEGIT",
  name: "Legitimate Single-UTXO Cross-Process Concurrency",
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
    let rpcUrl = "127.0.0.1:16210";
    try {
      const statusData = JSON.parse(statusRes.stdout.trim());
      if (statusData.node?.rpcUrl) {
        rpcUrl = statusData.node.rpcUrl.replace("ws://", "");
      }
    } catch (e) {}

    // Phase 1: Setup a single-UTXO funded account
    const setupCode = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const alice = await hk.accounts.resolve("alice");

        // Create or resolve a dedicated single-UTXO account
        const singleAcc = await hk.accounts.resolve("single_utxo_holder");

        // Fund singleAcc with a single transaction from alice
        const plan = await hk.tx.plan({
          from: alice,
          to: singleAcc,
          amount: 10000000000n, // 10 KAS
          feeRate: 10000n
        });

        const signed = await hk.tx.sign(plan, { account: alice });
        const sendRes = await hk.tx.send(signed);

        // Wait for accepted block so UTXO becomes spendable
        const txId = sendRes.txId || sendRes.receipt?.txId;
        if (txId) {
          try {
            await hk.tx.waitForAccepted({ txId, timeoutMs: 5000, pollIntervalMs: 500 });
          } catch (e) {}
        }

        // Verify singleAcc spendable UTXOs
        const utxosRes = await hk.query.utxos(singleAcc.address);
        const utxos = utxosRes.data || [];

        __emitEvidence({
          setupSuccessful: true,
          address: singleAcc.address,
          utxoCount: utxos.length,
          utxoId: utxos[0]?.id || utxos[0]?.outpoint?.transactionId
        });
      } catch (e) {
        __emitEvidence({ setupSuccessful: false, error: e.message });
      } finally {
        process.exit(0);
      }
    `;

    const setupRes = await runConsumerScript(ctx, "con-02-setup.js", setupCode);
    evidence.push("CON-02 SETUP OUTPUT:\n" + setupRes.stdout + "\n" + setupRes.stderr);

    const setupData = setupRes.data;

    if (!setupData || setupData.setupSuccessful !== true || setupData.utxoCount === 0) {
      if (setupData?.error?.includes("not standard") || setupData?.error?.includes("fees")) {
        status = "BLOCKED_BY_QF-005" as any;
        assertions.push({
          name: "CON-02-LEGIT.A single-UTXO setup blocked by QF-005 fee floor bug",
          passed: false,
          actual: setupData
        });
        return { status, assertions, evidence };
      }
      status = "ENVIRONMENT_NOT_QUALIFIED";
      assertions.push({
        name: "CON-02-LEGIT.A single-UTXO fixture established (1 spendable UTXO)",
        passed: false,
        actual: setupData
      });
      return { status, assertions, evidence };
    }

    assertions.push({
      name: "CON-02-LEGIT.A single-UTXO fixture established (1 spendable UTXO)",
      passed: setupData.utxoCount === 1,
      actual: setupData
    });

    // Phase 2: Launch Worker A and Worker B with 0 plan mutations
    const workerScript = (workerName: string, recipientName: string) => `
      import { Hardkas } from "@hardkas/sdk";

      function __emitEvidence(data) {
        console.log("\\n---EVIDENCE_START---");
        console.log(JSON.stringify(data, (key, value) => typeof value === 'bigint' ? value.toString() : value, 2));
        console.log("---EVIDENCE_END---\\n");
      }

      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const singleAcc = await hk.accounts.resolve("single_utxo_holder");
        const recipient = await hk.accounts.resolve("${recipientName}");

        // Standard canonical plan execution (no manual alterations!)
        const plan = await hk.tx.plan({
          from: singleAcc,
          to: recipient,
          amount: 2000000000n, // 2 KAS
          feeRate: 10000n
        });

        const signed = await hk.tx.sign(plan, { account: singleAcc });

        // Barrier delay to align submit timing
        await new Promise(r => setTimeout(r, 100));

        let sendResult = null;
        let sendError = null;
        try {
          sendResult = await hk.tx.send(signed);
        } catch (e) {
          sendError = e.message;
        }

        const selectedInput = plan.inputs && plan.inputs[0]?.outpoint;

        __emitEvidence({
          worker: "${workerName}",
          txId: signed.txId,
          selectedInput,
          sendSuccess: !!sendResult && !sendError,
          sendError
        });
      } catch (e) {
        __emitEvidence({ worker: "${workerName}", error: e.message });
      } finally {
        process.exit(0);
      }
    `;

    const fs = await import("fs/promises");
    const path = await import("path");
    await fs.writeFile(path.join(ctx.consumerDir, "worker-a-legit.js"), workerScript("WorkerA", "bob"));
    await fs.writeFile(path.join(ctx.consumerDir, "worker-b-legit.js"), workerScript("WorkerB", "carol"));

    const pA = runCommand("node worker-a-legit.js", ctx.consumerDir);
    const pB = runCommand("node worker-b-legit.js", ctx.consumerDir);

    const [resA, resB] = await Promise.all([pA, pB]);

    evidence.push("WORKER A OUTPUT:\n" + resA.stdout + "\n" + resA.stderr);
    evidence.push("WORKER B OUTPUT:\n" + resB.stdout + "\n" + resB.stderr);

    const parseEv = (stdout: string) => {
      const match = stdout.match(/---EVIDENCE_START---\n([\s\S]*?)\n---EVIDENCE_END---/);
      if (match && match[1]) {
        try { return JSON.parse(match[1]); } catch (e) {}
      }
      return null;
    };

    const dataA = parseEv(resA.stdout);
    const dataB = parseEv(resB.stdout);

    assertions.push({
      name: "CON-02-LEGIT.B Both worker OS processes executed in parallel",
      passed: !!dataA && !!dataB,
      actual: { workerA: dataA, workerB: dataB }
    });

    const inputA = dataA?.selectedInput;
    const inputB = dataB?.selectedInput;
    const sameInputSelected = inputA && inputB && JSON.stringify(inputA) === JSON.stringify(inputB);

    assertions.push({
      name: "CON-02-LEGIT.C Both planners naturally selected the identical input outpoint (overlappingInputs > 0)",
      passed: !!sameInputSelected,
      actual: { inputA, inputB }
    });

    const aPassed = dataA?.sendSuccess === true;
    const bPassed = dataB?.sendSuccess === true;
    const exactlyOneAccepted = (aPassed && !bPassed) || (!aPassed && bPassed);

    assertions.push({
      name: "CON-02-LEGIT.D Node double-spend rejection enforced (exactly 1 accepted, 1 rejected)",
      passed: exactlyOneAccepted,
      actual: { workerASuccess: aPassed, workerBSuccess: bPassed, errorA: dataA?.sendError, errorB: dataB?.sendError }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
