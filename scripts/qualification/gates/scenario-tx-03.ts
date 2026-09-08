import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * TX-03 - Pending / Mempool-Spend Exclusion
 *
 * Authority: rusty-kaspad RPC + HardKAS Query API
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Exercises mempool filtering for spendable UTXOs:
 * 1. Plans and submits a transaction that consumes a UTXO.
 * 2. Immediately requests spendable UTXOs with `excludePending: true`.
 * 3. Validates that the consumed UTXO is completely excluded from the result.
 */
export const scenarioTx03: GateDefinition = {
  id: "TX-03",
  name: "Pending / Mempool-Spend Exclusion",
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
        const sender = await hk.accounts.resolve("alice");
        const recipient = await hk.accounts.resolve("bob");

        // Get initial UTXOs
        const initialUtxos = await hk.query.getSpendableUtxos({ address: sender.address, excludePending: true });
        
        // Plan, sign, send Tx
        const plan = await hk.tx.plan({ from: sender, to: recipient, amount: 100000000n }); // 1 KAS
        const signed = await hk.tx.sign(plan, { account: sender });
        
        const sendResult = await hk.tx.send(signed);

        // Get UTXOs again immediately
        const postUtxos = await hk.query.getSpendableUtxos({ address: sender.address, excludePending: true });

        const consumedOutpoints = (plan.inputs || plan.plan?.inputs || []).map(i => i.previousOutpoint?.transactionId + ":" + i.previousOutpoint?.index);
        const postOutpoints = postUtxos.data.map(u => u.outpoint?.transactionId + ":" + u.outpoint?.index);
        
        const overlap = consumedOutpoints.filter(id => postOutpoints.includes(id));

        __emitEvidence({
          txId: sendResult.txId,
          consumedOutpoints,
          overlap
        });
      } catch (e) {
        __emitEvidence({ fatalError: String(e.message || e), stack: e.stack });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "tx-03-mempool.js", code);
    evidence.push("TX-03 RAW OUTPUT:\\n" + res.stdout + "\\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "TX-03 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    if (d.fatalError) {
      status = "FAIL";
      assertions.push({
        name: "TX-03 execution success",
        passed: false,
        error: d.fatalError
      });
      return { status, assertions, evidence };
    }

    assertions.push({
      name: "TX-03.A Successfully consumed UTXOs recorded",
      passed: Array.isArray(d.consumedOutpoints) && d.consumedOutpoints.length > 0,
      actual: { consumedOutpointsCount: d.consumedOutpoints?.length }
    });

    assertions.push({
      name: "TX-03.B Consumed UTXOs excluded from subsequent query",
      passed: Array.isArray(d.overlap) && d.overlap.length === 0,
      actual: { overlap: d.overlap }
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
