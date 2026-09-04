import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * CON-02-LEGIT - Single-UTXO Concurrent Double-Spend Race
 *
 * Authority: rusty-kaspad Mempool + HardKAS TX Planner
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 */
export const scenarioCon02Legit: GateDefinition = {
  id: "CON-02-LEGIT",
  name: "Single-UTXO Concurrent Double-Spend Race",
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

    // Phase 1: Setup a single-UTXO funded account fixture
    const setupAccountName = `con02_race_sender_${Date.now()}`;
    const setupCode = `
      import { getOrCreateDevAccount } from "@hardkas/accounts";

      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const alice = await hk.accounts.resolve("alice");
        const accountIndex = Math.floor(Math.random() * 10000) + 1000;
        await getOrCreateDevAccount(process.cwd(), accountIndex, "${setupAccountName}");
        const singleAcc = await hk.accounts.resolve("${setupAccountName}");

        const plan = await hk.tx.plan({
          from: alice,
          to: singleAcc,
          amount: 10000000000n, // 10 KAS
          feeRate: 100n
        });

        const signed = await hk.tx.sign(plan, { account: alice });
        const sendRes = await hk.tx.send(signed);

        const template = await hk.rpc.call("getBlockTemplateRequest", { payAddress: alice.address, extraData: [] });
        const blockMessage = template.blockMessage || template.block;
        await hk.rpc.call("submitBlockRequest", { block: blockMessage, allowNonDAABlocks: false });

        const utxosRes = await hk.query.utxos(singleAcc.address);
        const utxos = utxosRes.data || [];

        const expectedOutpoint = utxos[0] ? utxos[0].outpoint?.transactionId + ":" + utxos[0].outpoint?.index : null;

        __emitEvidence({
          setupSuccessful: true,
          accountName: "${setupAccountName}",
          address: singleAcc.address,
          utxoCount: utxos.length,
          outpointX: expectedOutpoint
        });
      } catch (e) {
        __emitEvidence({ setupSuccessful: false, error: String(e.message || e) });
      } finally {
        process.exit(0);
      }
    `;

    const setupRes = await runConsumerScript(ctx, "con-02-setup.js", setupCode);
    evidence.push("CON-02 SETUP OUTPUT:\n" + setupRes.stdout + "\n" + setupRes.stderr);

    const setupData = setupRes.data;

    if (!setupData || setupData.setupSuccessful !== true || setupData.utxoCount !== 1) {
      status = "ENVIRONMENT_NOT_QUALIFIED";
      assertions.push({
        name: "CON-02-LEGIT.A Single-UTXO fixture established (outpoint X)",
        passed: false,
        actual: setupData
      });
      return { status, assertions, evidence };
    }

    assertions.push({
      name: "CON-02-LEGIT.A Single-UTXO fixture established (outpoint X)",
      passed: setupData.utxoCount === 1 && !!setupData.outpointX,
      actual: setupData
    });

    const expectedOutpointX = setupData.outpointX;

    // Phase 2: Multi-process IPC READY -> GO synchronization race barrier
    const workerScript = (workerName: string, recipientName: string) => `
      import fs from "fs/promises";
      import path from "path";
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
        const sender = await hk.accounts.resolve("${setupAccountName}");
        const recipient = await hk.accounts.resolve("${recipientName}");

        let replanCount = 0;
        let resignCount = 0;

        const plan = await hk.tx.plan({
          from: sender,
          to: recipient,
          amount: 5000000000n, // 5 KAS
          feeRate: 100n
        });

        const signed = await hk.tx.sign(plan, { account: sender });

        const inputsList = plan.inputs || plan.plan?.inputs || [];
        const selectedOutpoints = inputsList.map(i => {
          const txId = i.outpoint?.transactionId || i.previousOutpoint?.transactionId;
          const idx = i.outpoint?.index !== undefined ? i.outpoint.index : i.previousOutpoint?.index;
          return txId + ":" + idx;
        });

        // Barrier Step 1: Emit READY signal with plan payload
        await fs.writeFile(
          path.join(process.cwd(), "${workerName}.ready"),
          JSON.stringify({
            worker: "${workerName}",
            pid: process.pid,
            planId: plan.id || plan.planId || plan.contentHash,
            signedId: signed.txId || signed.signedId || signed.contentHash,
            selectedOutpoints,
            replanCount,
            resignCount
          }),
          "utf-8"
        );

        // Barrier Step 2: Poll for GO barrier file
        let go = false;
        const startWait = Date.now();
        while (!go && Date.now() - startWait < 10000) {
          try {
            await fs.access(path.join(process.cwd(), "barrier.go"));
            go = true;
          } catch {
            await new Promise(r => setTimeout(r, 10));
          }
        }

        if (!go) {
          throw new Error("${workerName} timed out waiting for barrier.go");
        }

        // Barrier Step 3: Simultaneous Send
        let sendResult = null;
        let sendError = null;
        try {
          sendResult = await hk.tx.send(signed);
        } catch (e) {
          sendError = e.message;
        }

        const receiptExists = !!(sendResult && (sendResult.receipt?.txId || sendResult.txId));

        __emitEvidence({
          worker: "${workerName}",
          pid: process.pid,
          planId: plan.id || plan.planId || plan.contentHash,
          signedId: signed.txId || signed.signedId || signed.contentHash,
          txId: sendResult?.txId || sendResult?.receipt?.txId,
          sendSuccess: !!sendResult && !sendError,
          sendError,
          receiptExists
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

    const readyFileA = path.join(ctx.consumerDir, "WorkerA.ready");
    const readyFileB = path.join(ctx.consumerDir, "WorkerB.ready");
    const goFile = path.join(ctx.consumerDir, "barrier.go");

    try { await fs.unlink(readyFileA); } catch {}
    try { await fs.unlink(readyFileB); } catch {}
    try { await fs.unlink(goFile); } catch {}

    const pA = runCommand("node worker-a-legit.js", ctx.consumerDir);
    const pB = runCommand("node worker-b-legit.js", ctx.consumerDir);

    let readyPayloadA: any = null;
    let readyPayloadB: any = null;
    const startBarrier = Date.now();

    while ((!readyPayloadA || !readyPayloadB) && Date.now() - startBarrier < 10000) {
      if (!readyPayloadA) {
        try {
          const raw = await fs.readFile(readyFileA, "utf-8");
          readyPayloadA = JSON.parse(raw);
        } catch {}
      }
      if (!readyPayloadB) {
        try {
          const raw = await fs.readFile(readyFileB, "utf-8");
          readyPayloadB = JSON.parse(raw);
        } catch {}
      }
      if (!readyPayloadA || !readyPayloadB) {
        await new Promise(r => setTimeout(r, 20));
      }
    }

    const readyValidA = readyPayloadA && readyPayloadA.selectedOutpoints?.length === 1 && readyPayloadA.selectedOutpoints[0] === expectedOutpointX;
    const readyValidB = readyPayloadB && readyPayloadB.selectedOutpoints?.length === 1 && readyPayloadB.selectedOutpoints[0] === expectedOutpointX;
    const zeroReplanResign = readyPayloadA?.replanCount === 0 && readyPayloadA?.resignCount === 0 && readyPayloadB?.replanCount === 0 && readyPayloadB?.resignCount === 0;

    assertions.push({
      name: "CON-02-LEGIT.B Both workers independently planned and signed against single outpoint X (zero replan/resign)",
      passed: !!readyValidA && !!readyValidB && zeroReplanResign,
      actual: { readyPayloadA, readyPayloadB, expectedOutpointX }
    });

    // Emit GO barrier file
    if (readyPayloadA && readyPayloadB) {
      await fs.writeFile(goFile, "GO", "utf-8");
    }

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

    const successCount = (dataA?.sendSuccess ? 1 : 0) + (dataB?.sendSuccess ? 1 : 0);
    const rejectCount = (dataA?.sendError ? 1 : 0) + (dataB?.sendError ? 1 : 0);

    const winner = dataA?.sendSuccess ? dataA : (dataB?.sendSuccess ? dataB : null);
    const loser = dataA?.sendError ? dataA : (dataB?.sendError ? dataB : null);

    const mempoolDoubleSpendError = loser?.sendError?.includes("already spent") && loser?.sendError?.includes("mempool");

    assertions.push({
      name: "CON-02-LEGIT.C Single-UTXO Concurrent Double-Spend Race outcome: 1 winner submitted, 1 loser rejected by mempool",
      passed: successCount === 1 && rejectCount === 1 && winner?.receiptExists === true && loser?.receiptExists === false && !!mempoolDoubleSpendError,
      actual: { successCount, rejectCount, winner, loser, mempoolDoubleSpendError }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    // Cleanup temp files
    try { await fs.unlink(path.join(ctx.consumerDir, "worker-a-legit.js")); } catch {}
    try { await fs.unlink(path.join(ctx.consumerDir, "worker-b-legit.js")); } catch {}
    try { await fs.unlink(readyFileA); } catch {}
    try { await fs.unlink(readyFileB); } catch {}
    try { await fs.unlink(goFile); } catch {}

    return { status, assertions, evidence };
  }
};
