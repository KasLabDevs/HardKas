import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * REC-02 — Node Restart Before Mining (Mempool Flush Recovery)
 *
 * Authority: rusty-kaspad Mempool + Docker lifecycle + HardKAS TX Module
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates behavior when the node restarts while a transaction sits in mempool:
 * 1. Submit tx to node mempool (feeRate: 10000n to ensure relay acceptance).
 * 2. Verify tx is present in mempool.
 * 3. Restart rusty-kaspad container (docker restart).
 * 4. Verify node mempool is flushed / tx is dropped.
 * 5. Verify HardKAS handles dropped mempool tx cleanly without false receipt or fake confirmation.
 */
export const scenarioRec02: GateDefinition = {
  id: "REC-02",
  name: "Node Restart Before Mining",
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
    let containerName = "hardkas-kaspad-toccata-v2";
    try {
      const statusData = JSON.parse(statusRes.stdout.trim());
      if (statusData.node?.rpcUrl) {
        rpcUrl = statusData.node.rpcUrl.replace("ws://", "");
      }
      if (statusData.node?.containerName) {
        containerName = statusData.node.containerName;
      }
    } catch (e) {}

    // Phase 1: Submit tx to mempool with custom high fee (feeRate: 10000n to bypass QF-005)
    const submitCode = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const alice = await hk.accounts.resolve("alice");
        const bob = await hk.accounts.resolve("bob");

        const plan = await hk.tx.plan({
          from: alice,
          to: bob,
          amount: 5000000000n,
          feeRate: 10000n
        });

        const signed = await hk.tx.sign(plan, { account: alice });
        const sendRes = await hk.tx.send(signed);

        const txId = sendRes.txId || sendRes.receipt?.txId;
        
        let mempoolStatus = "unknown";
        if (txId) {
          try {
            const check = await hk.rpc.checkMempoolPresence(txId);
            mempoolStatus = check.status;
          } catch (e) {
            mempoolStatus = "error: " + e.message;
          }
        }

        __emitEvidence({
          success: true,
          txId,
          mempoolStatus
        });
      } catch (e) {
        __emitEvidence({
          success: false,
          error: e.message,
          code: e.code
        });
      } finally {
        process.exit(0);
      }
    `;

    const res1 = await runConsumerScript(ctx, "rec-02-submit.js", submitCode);
    evidence.push("REC-02 PHASE 1 (SUBMIT TO MEMPOOL):\n" + res1.stdout + "\n" + res1.stderr);

    const d1 = res1.data;

    // Check if QF-005 blocked initial submission despite feeRate override
    if (!d1 || d1.success !== true || !d1.txId) {
      const isFeeError = d1?.error?.includes("not standard") || d1?.error?.includes("fees");
      if (isFeeError) {
        status = "BLOCKED_BY_QF-005" as any;
        assertions.push({
          name: "REC-02.A submission blocked by known QF-005 fee floor bug",
          passed: false,
          actual: d1
        });
        return { status, assertions, evidence };
      }
      status = "FAIL";
      assertions.push({
        name: "REC-02.A tx submitted to mempool",
        passed: false,
        actual: d1
      });
      return { status, assertions, evidence };
    }

    const txId = d1.txId;
    assertions.push({
      name: "REC-02.A tx submitted to mempool",
      passed: true,
      actual: { txId, mempoolStatus: d1.mempoolStatus }
    });

    // Phase 2: Restart node container BEFORE block is mined
    const restartRes = await runCommand(`docker restart ${containerName}`, ctx.repoRoot);
    evidence.push("REC-02 DOCKER RESTART:\n" + restartRes.stdout + "\n" + restartRes.stderr);

    // Wait for node RPC to come back online
    let ready = false;
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 1000));
      const inspect = await runCommand(`docker inspect -f "{{.State.Running}}" ${containerName}`, ctx.repoRoot);
      if (inspect.stdout.trim() === "true") {
        ready = true;
        break;
      }
    }

    assertions.push({
      name: "REC-02.B node restarted before mining completed",
      passed: ready,
      actual: ready
    });

    // Phase 3: Inspect post-restart status of the dropped mempool tx
    const inspectCode = `
      let rpcReady = false;
      let mempoolStatus = "unknown";
      let isAccepted = false;
      let lastErr = null;

      for (let i = 0; i < 15; i++) {
        try {
          const hk = await Hardkas.create({
            network: "simnet",
            rpc: { endpoints: ["${rpcUrl}"] }
          });
          rpcReady = true;

          const check = await hk.rpc.checkMempoolPresence("${txId}");
          mempoolStatus = check.status;

          // Check if accepted in block
          try {
            const accepted = await hk.tx.waitForAccepted({
              txId: "${txId}",
              timeoutMs: 1000,
              pollIntervalMs: 200
            });
            if (accepted) isAccepted = true;
          } catch (e) {
            // Expected to timeout because tx was in mempool and flushed on node restart
          }
          break;
        } catch (e) {
          lastErr = e.message;
          await new Promise(r => setTimeout(r, 1000));
        }
      }

      __emitEvidence({
        rpcReady,
        mempoolStatus,
        isAccepted,
        lastErr
      });
      process.exit(0);
    `;

    const res3 = await runConsumerScript(ctx, "rec-02-inspect.js", inspectCode);
    evidence.push("REC-02 PHASE 3 (POST-RESTART INSPECT):\n" + res3.stdout + "\n" + res3.stderr);

    const d3 = res3.data;

    assertions.push({
      name: "REC-02.C RPC reachable after restart",
      passed: d3?.rpcReady === true,
      actual: d3
    });

    // Node restart flushes mempool, so tx is absent and not accepted
    const droppedCleanly = d3?.mempoolStatus === "absent" && d3?.isAccepted === false;
    assertions.push({
      name: "REC-02.D mempool tx flushed/dropped on node restart without false acceptance",
      passed: !!droppedCleanly,
      actual: { mempoolStatus: d3?.mempoolStatus, isAccepted: d3?.isAccepted }
    });

    assertions.push({
      name: "REC-02.E no false-positive receipt or fake confirmation invented",
      passed: d3?.isAccepted === false,
      actual: d3
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
