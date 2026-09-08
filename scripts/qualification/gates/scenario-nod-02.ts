import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * NOD-02 - Coinbase Maturity / Execution Isolation
 *
 * Authority: rusty-kaspad RPC + HardKAS TX Planner
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Exercises coinbase maturity logic:
 * 1. Uses localnet fund to mine blocks, leaving the last 100 coinbase UTXOs immature.
 * 2. Attempts to plan a transaction that would require spending the immature UTXOs.
 * 3. Validates that the planner correctly excludes them (throws INSUFFICIENT_FUNDS).
 */
export const scenarioNod02: GateDefinition = {
  id: "NOD-02",
  name: "Coinbase Maturity / Execution Isolation",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "rpcReady"],
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
        const miner = await hk.accounts.resolve("alice");
        const bob = await hk.accounts.resolve("bob");

        const utxos = await hk.rpc.getUtxosByAddress(miner.address);
        const dagInfo = await hk.rpc.getBlockDagInfo();
        const virtualDaaScore = BigInt(dagInfo.virtualDaaScore);

        let matureSum = 0n;
        let immatureSum = 0n;
        let immatureCount = 0;

        for (const u of utxos) {
          if (u.isCoinbase && u.blockDaaScore !== undefined && (virtualDaaScore - BigInt(u.blockDaaScore) < 100n)) {
            immatureSum += BigInt(u.amountSompi || 0);
            immatureCount++;
          } else {
            matureSum += BigInt(u.amountSompi || 0);
          }
        }

        // Try to spend MORE than matureSum, but LESS than total sum.
        // It should throw INSUFFICIENT_FUNDS because immature UTXOs are excluded.
        let spendFailed = false;
        let errorMessage = "";
        
        try {
          // Attempt to spend matureSum + 1 KAS.
          await hk.tx.plan({ from: miner, to: bob, amount: matureSum + 100000000n });
        } catch (e) {
          spendFailed = true;
          errorMessage = e.message;
        }

        __emitEvidence({
          totalUtxos: utxos.length,
          immatureCount,
          matureSum: matureSum.toString(),
          immatureSum: immatureSum.toString(),
          spendFailed,
          errorMessage
        });
      } catch (e) {
        __emitEvidence({ fatalError: String(e.message || e), stack: e.stack });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "nod-02-maturity.js", code);
    evidence.push("NOD-02 RAW OUTPUT:\\n" + res.stdout + "\\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "NOD-02 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    if (d.fatalError) {
      status = "FAIL";
      assertions.push({
        name: "NOD-02 execution success",
        passed: false,
        error: d.fatalError
      });
      return { status, assertions, evidence };
    }

    assertions.push({
      name: "NOD-02.A Miner accumulated immature coinbase UTXOs",
      passed: d.immatureCount > 0,
      actual: { immatureCount: d.immatureCount, immatureSum: d.immatureSum }
    });

    assertions.push({
      name: "NOD-02.B Planner rejects inclusion of immature UTXOs (INSUFFICIENT_FUNDS)",
      passed: d.spendFailed === true && d.errorMessage?.toLowerCase().includes("insufficient funds"),
      actual: { spendFailed: d.spendFailed, errorMessage: d.errorMessage }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
