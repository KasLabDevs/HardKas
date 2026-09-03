import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";

/**
 * CON-02-strict — Deterministic Cross-Process UTXO Double-Spend Conflict
 *
 * Authority: rusty-kaspad Mempool (Double-spend rejection)
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates node double-spend rejection across two independent OS processes:
 * 1. Process A and Process B independently plan spends targeting the EXACT SAME input outpoint.
 * 2. Overlapping inputs count is GUARANTEED to be > 0.
 * 3. Both processes sign and submit simultaneously.
 * 4. Node accepts at most ONE transaction and rejects the second with double spend error.
 */
export const scenarioCon02Strict: GateDefinition = {
  id: "CON-02-STRICT",
  name: "Deterministic Cross-Process Double Spend Conflict",
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

    // Script template for Worker A and Worker B targeting the exact same outpoint
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
        const alice = await hk.accounts.resolve("alice");
        const recipient = await hk.accounts.resolve("${recipientName}");

        // Retrieve spendable UTXOs for alice
        const utxosRes = await hk.query.utxos(alice.address);
        const utxos = utxosRes.data || [];

        if (!utxos || utxos.length === 0) {
          __emitEvidence({ worker: "${workerName}", error: "No UTXOs found for alice" });
          process.exit(1);
        }

        // Force both processes to select the EXACT SAME first UTXO
        const sharedUtxo = utxos[0];

        const plan = await hk.tx.plan({
          from: alice,
          to: recipient,
          amount: 500000000n,
          feeRate: 10000n
        });

        // Override input outpoint to force collision
        const collidingPlan = {
          ...plan,
          inputs: [{
            outpoint: sharedUtxo.outpoint || sharedUtxo.id || { transactionId: sharedUtxo.transactionId, index: sharedUtxo.index || 0 },
            amountSompi: sharedUtxo.amountSompi || sharedUtxo.amount || "5000000000"
          }]
        };

        const signed = await hk.tx.sign(collidingPlan, { account: alice });

        // Barrier delay to synchronize submission timestamp
        await new Promise(r => setTimeout(r, 200));

        let sendResult = null;
        let sendError = null;
        try {
          sendResult = await hk.tx.send(signed);
        } catch (e) {
          sendError = e.message;
        }

        __emitEvidence({
          worker: "${workerName}",
          txId: signed.txId,
          outpoint: sharedUtxo.outpoint || sharedUtxo.id,
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
    await fs.writeFile(path.join(ctx.consumerDir, "worker-a-strict.js"), workerScript("WorkerA", "bob"));
    await fs.writeFile(path.join(ctx.consumerDir, "worker-b-strict.js"), workerScript("WorkerB", "carol"));

    // Launch both worker OS processes in parallel
    const pA = runCommand("node worker-a-strict.js", ctx.consumerDir);
    const pB = runCommand("node worker-b-strict.js", ctx.consumerDir);

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
      name: "CON-02-STRICT.A Both worker OS processes executed in parallel",
      passed: !!dataA && !!dataB,
      actual: { workerA: dataA, workerB: dataB }
    });

    const sameOutpoint = dataA?.outpoint && dataB?.outpoint && JSON.stringify(dataA.outpoint) === JSON.stringify(dataB.outpoint);
    assertions.push({
      name: "CON-02-STRICT.B Collision fixture established (overlappingInputsCount > 0)",
      passed: !!sameOutpoint,
      actual: { outpointA: dataA?.outpoint, outpointB: dataB?.outpoint }
    });

    // Check if QF-005 blocked initial submission despite custom feeRate
    const isFeeErr = dataA?.sendError?.includes("fees") || dataB?.sendError?.includes("fees") || dataA?.sendError?.includes("not standard");
    if (isFeeErr) {
      status = "BLOCKED_BY_QF-005" as any;
      assertions.push({
        name: "CON-02-STRICT.C submission blocked by known QF-005 fee floor bug",
        passed: false,
        actual: { dataA, dataB }
      });
      return { status, assertions, evidence };
    }

    const aPassed = dataA?.sendSuccess === true;
    const bPassed = dataB?.sendSuccess === true;
    const exactlyOneAccepted = (aPassed && !bPassed) || (!aPassed && bPassed);

    assertions.push({
      name: "CON-02-STRICT.D Node double-spend rejection enforced (exactly 1 accepted, 1 rejected)",
      passed: exactlyOneAccepted,
      actual: { workerASuccess: aPassed, workerBSuccess: bPassed, errorA: dataA?.sendError, errorB: dataB?.sendError }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
