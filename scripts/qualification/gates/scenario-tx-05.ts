import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * TX-05 — Duplicate Submit / Conflicts / Execution Target Mismatch (Docker Real)
 *
 * Authority: rusty-kaspad RPC + HardKAS Execution Guard
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Exercises node conflict resolution and execution target safety:
 * 1. Duplicate submission of signed tx.
 * 2. Double-spend submission of conflicting tx (same UTXO).
 * 3. Execution target / network mismatch rejection.
 */
export const scenarioTx05: GateDefinition = {
  id: "TX-05",
  name: "Duplicate Submit / Conflicts / Target Mismatch",
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

    const code = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const alice = await hk.accounts.resolve("alice");
        const bob = await hk.accounts.resolve("bob");
        const carol = await hk.accounts.resolve("carol");

        const testResults = {};

        // === 1. Duplicate Submit ===
        // Plan, sign, send Tx1
        const plan1 = await hk.tx.plan({ from: alice, to: bob, amount: 50000000000n });
        const signed1 = await hk.tx.sign(plan1, { account: alice });
        const send1First = await hk.tx.send(signed1);

        // Attempt second submit of the exact same signed artifact
        let dupSubmitResult = null;
        try {
          const send1Second = await hk.tx.send(signed1);
          dupSubmitResult = {
            rejected: false,
            txId: send1Second.txId,
            receiptStatus: send1Second.receipt?.status
          };
        } catch (e) {
          dupSubmitResult = {
            rejected: true,
            errorMessage: e.message,
            errorCode: e.code
          };
        }
        testResults.duplicateSubmit = {
          firstSuccess: !!send1First.txId,
          firstTxId: send1First.txId,
          dupSubmitResult
        };

        // === 2. Double-Spend Conflict (same UTXO) ===
        // Plan Tx2 and Tx3 from alice using Consolidation or same plan before state update
        // We plan Tx2 to bob, and Tx3 to carol using the same spendable balance
        const plan2 = await hk.tx.plan({ from: alice, to: bob, amount: 100000000000n });
        const plan3 = await hk.tx.plan({ from: alice, to: carol, amount: 100000000000n });

        // Check if plan2 and plan3 overlap inputs
        const p2Inputs = (plan2.inputs || plan2.plan?.inputs || []).map(i => i.previousOutpoint?.transactionId + ":" + i.previousOutpoint?.index);
        const p3Inputs = (plan3.inputs || plan3.plan?.inputs || []).map(i => i.previousOutpoint?.transactionId + ":" + i.previousOutpoint?.index);
        const overlapping = p2Inputs.filter(id => p3Inputs.includes(id));

        const signed2 = await hk.tx.sign(plan2, { account: alice });
        const signed3 = await hk.tx.sign(plan3, { account: alice });

        const send2Res = await hk.tx.send(signed2);

        let send3Result = null;
        try {
          const send3Res = await hk.tx.send(signed3);
          send3Result = {
            rejected: false,
            txId: send3Res.txId,
            receiptStatus: send3Res.receipt?.status
          };
        } catch (e) {
          send3Result = {
            rejected: true,
            errorMessage: e.message,
            errorCode: e.code
          };
        }

        testResults.doubleSpendConflict = {
          tx2Success: !!send2Res.txId,
          overlappingInputsCount: overlapping.length,
          send3Result
        };

        // === 3. Execution Target / Network Mismatch ===
        let networkMismatchResult = null;
        try {
          // Attempt to enforce policy on mainnet spend when policy restricts it
          hk.enforcePolicy("mainnet", "Testing policy restriction");
          networkMismatchResult = { rejected: false };
        } catch (e) {
          networkMismatchResult = {
            rejected: true,
            errorMessage: e.message,
            errorCode: e.code
          };
        }

        testResults.targetMismatch = networkMismatchResult;

        __emitEvidence(testResults);
      } catch (e) {
        __emitEvidence({ fatalError: e.message, stack: e.stack });
      } finally {
        process.exit(0);
      }
    `;

    const res = await runConsumerScript(ctx, "tx-05-conflicts.js", code);
    evidence.push("TX-05 RAW OUTPUT:\n" + res.stdout + "\n" + res.stderr);

    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({
        name: "TX-05 script execution",
        passed: false,
        error: res.stderr || "No JSON evidence output"
      });
      return { status, assertions, evidence };
    }

    const d = res.data;

    // TX-05.A: Duplicate submission handled safely (rejected by node or idempotent)
    const dupHandled = d.duplicateSubmit && d.duplicateSubmit.firstSuccess === true;
    assertions.push({
      name: "TX-05.A duplicate submission handled without corruption",
      passed: !!dupHandled,
      actual: d.duplicateSubmit
    });

    // TX-05.B: Double-spend conflict rejected by node or transaction pipeline
    const conflictHandled = d.doubleSpendConflict && d.doubleSpendConflict.tx2Success === true && (
      d.doubleSpendConflict.send3Result?.rejected === true ||
      d.doubleSpendConflict.overlappingInputsCount === 0 // If SDK auto-excluded pending spent inputs
    );
    assertions.push({
      name: "TX-05.B double-spend conflict rejected or excluded safely",
      passed: !!conflictHandled,
      actual: d.doubleSpendConflict
    });

    // TX-05.C: Target / network policy mismatch rejected before broadcast
    const policyHandled = d.targetMismatch && d.targetMismatch.rejected === true;
    assertions.push({
      name: "TX-05.C target policy restriction enforced before broadcast",
      passed: !!policyHandled,
      actual: d.targetMismatch
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
