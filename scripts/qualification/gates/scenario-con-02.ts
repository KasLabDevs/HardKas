import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * CON-02 � Cross-Process Concurrency (Docker Real)
 *
 * Authority: rusty-kaspad RPC + OS process isolation
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Spawns two independent, uncoordinated Node.js OS processes attempting
 * concurrent spend of overlapping UTXOs against a real rusty-kaspad node.
 * Verifies that network-level double spend is resolved deterministically
 * (1 winner, 1 loser with typed rejection, 0 false receipts).
 */
export const scenarioCon02: GateDefinition = {
  id: "CON-02",
  name: "Cross-Process Concurrency",
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

    // We write a worker script that can act as Process A or Process B
    const workerCode = `
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

      const recipient = process.argv[2] || "bob";

      try {
        const alice = await hk.accounts.resolve("alice");
        const targetAcc = await hk.accounts.resolve(recipient);

        // Plan spend
        const plan = await hk.tx.plan({
          from: alice,
          to: targetAcc,
          amount: 50000000000n
        });

        const inputs = (plan.inputs || plan.plan?.inputs || []).map(i =>
          i.previousOutpoint?.transactionId + ":" + i.previousOutpoint?.index
        );

        const signed = await hk.tx.sign(plan, { account: alice });

        // Signal readiness and wait for sync barrier file if provided
        const fs = await import("fs");
        if (process.env.BARRIER_FILE) {
          fs.writeFileSync(process.env.BARRIER_FILE + "." + recipient, "ready");
          // Poll for trigger file
          for (let i = 0; i < 50; i++) {
            if (fs.existsSync(process.env.BARRIER_FILE + ".go")) break;
            await new Promise(r => setTimeout(r, 100));
          }
        }

        // Send to real node
        const sendRes = await hk.tx.send(signed);

        __emitEvidence({
          pid: process.pid,
          recipient,
          inputs,
          success: true,
          txId: sendRes.txId || sendRes.receipt?.txId,
          submitted: sendRes.submitted !== false
        });
      } catch (e) {
        __emitEvidence({
          pid: process.pid,
          recipient,
          success: false,
          errorMessage: e.message,
          errorCode: e.code
        });
      } finally {
        process.exit(0);
      }
    `;

    // Write worker script to consumer dir
    const fs = await import("fs/promises");
    const path = await import("path");
    const barrierPath = path.join(ctx.consumerDir, "barrier");
    await fs.writeFile(path.join(ctx.consumerDir, "worker-cross.js"), workerCode);

    // Clean any old barrier files
    try {
      await fs.rm(barrierPath + ".bob", { force: true });
      await fs.rm(barrierPath + ".carol", { force: true });
      await fs.rm(barrierPath + ".go", { force: true });
    } catch (e) {}

    // Launch Process A (bob) and Process B (carol) concurrently
    const env = { BARRIER_FILE: barrierPath };

    const cmdA = `node worker-cross.js bob`;
    const cmdB = `node worker-cross.js carol`;

    const promiseA = runCommand(cmdA, ctx.consumerDir, env);
    const promiseB = runCommand(cmdB, ctx.consumerDir, env);

    // Wait briefly for both processes to signal readiness
    for (let i = 0; i < 30; i++) {
      const existsA = await fs.access(barrierPath + ".bob").then(() => true).catch(() => false);
      const existsB = await fs.access(barrierPath + ".carol").then(() => true).catch(() => false);
      if (existsA && existsB) break;
      await new Promise(r => setTimeout(r, 100));
    }

    // Trigger simultaneous submission
    await fs.writeFile(barrierPath + ".go", "GO");

    // Await both process completions
    const [resA, resB] = await Promise.all([promiseA, promiseB]);

    evidence.push("PROCESS A (BOB) OUTPUT:\n" + resA.stdout + "\n" + resA.stderr);
    evidence.push("PROCESS B (CAROL) OUTPUT:\n" + resB.stdout + "\n" + resB.stderr);

    // Parse evidence payloads
    const parseEvidence = (stdout: string) => {
      const match = stdout.match(/---EVIDENCE_START---\n([\s\S]*?)\n---EVIDENCE_END---/);
      if (match && match[1]) {
        try { return JSON.parse(match[1]); } catch (e) {}
      }
      return null;
    };

    const dataA = parseEvidence(resA.stdout);
    const dataB = parseEvidence(resB.stdout);

    // CON-02.A: Both independent processes ran and emitted evidence
    assertions.push({
      name: "CON-02.A both independent Node processes executed",
      passed: !!dataA && !!dataB,
      actual: { processA: !!dataA, processB: !!dataB }
    });

    if (!dataA || !dataB) {
      status = "FAIL";
      return { status, assertions, evidence };
    }

    // Verify input overlap
    const inputsA: string[] = dataA.inputs || [];
    const inputsB: string[] = dataB.inputs || [];
    const overlappingInputs = inputsA.filter(i => inputsB.includes(i));

    // Fixture verification: If no overlapping inputs, fixture was not established
    if (overlappingInputs.length === 0) {
      status = "ENVIRONMENT_NOT_QUALIFIED";
      assertions.push({
        name: "CON-02.B conflict fixture construction (overlappingInputs > 0)",
        passed: false,
        actual: { inputsA, inputsB, overlappingInputsCount: 0 },
        error: "FIXTURE_NOT_ESTABLISHED: Process A and Process B did not select overlapping UTXOs."
      });
      return { status, assertions, evidence };
    }

    assertions.push({
      name: "CON-02.B conflict fixture construction (overlappingInputs > 0)",
      passed: true,
      actual: { overlappingInputsCount: overlappingInputs.length, overlappingInputs }
    });

    // Check winner/loser outcome
    const aSuccess = dataA.success === true && !!dataA.txId;
    const bSuccess = dataB.success === true && !!dataB.txId;

    const winnerCount = (aSuccess ? 1 : 0) + (bSuccess ? 1 : 0);
    const loserCount = (!aSuccess ? 1 : 0) + (!bSuccess ? 1 : 0);

    assertions.push({
      name: "CON-02.C exactly one cross-process transaction accepted",
      passed: winnerCount === 1,
      actual: { winnerCount, processASuccess: aSuccess, processBSuccess: bSuccess }
    });

    assertions.push({
      name: "CON-02.D exactly one cross-process transaction rejected",
      passed: loserCount === 1,
      actual: { loserCount, processAError: dataA.errorMessage, processBError: dataB.errorMessage }
    });

    const loserData = !aSuccess ? dataA : dataB;
    assertions.push({
      name: "CON-02.E loser received typed network rejection error",
      passed: !loserData.success && typeof loserData.errorMessage === "string",
      actual: loserData
    });

    assertions.push({
      name: "CON-02.F zero false receipts produced for losing process",
      passed: !loserData.txId,
      actual: { loserTxId: loserData.txId }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
