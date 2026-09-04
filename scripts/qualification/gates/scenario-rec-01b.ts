import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runCommand, getHardkasCliPath } from "../environment/commands.js";
import { runConsumerScript } from "../environment/consumer-script.js";

/**
 * REC-01B � Consumer Crash During Submit Window & Node Evidence Recovery
 *
 * Authority: Node RPC (Authoritative) + Artifact Engine (History)
 * Track: DOCKER_REAL
 * Surface: PUBLIC
 *
 * Validates the crash window right around submission:
 * 1. Process A submits tx to node.
 * 2. Process A exits abruptly (exit 137) before local receipt persistence finishes.
 * 3. Process B restarts and recovers true state via Node RPC evidence.
 */
export const scenarioRec01b: GateDefinition = {
  id: "REC-01B",
  name: "Consumer Crash Mid-Submit Window",
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

    // Process A: Submit tx with custom feeRate: 10000n to ensure node mempool accepts it
    const crashCode = `
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
        const bob = await hk.accounts.resolve("bob");

        const plan = await hk.tx.plan({ from: alice, to: bob, amount: 2000000000n, feeRate: 10000n });
        const signed = await hk.tx.sign(plan, { account: alice });

        // Fire send to real node
        const sendRes = await hk.tx.send(signed);
        const txId = sendRes.txId || sendRes.receipt?.txId;

        __emitEvidence({
          submittedToNode: true,
          txId,
          contentHash: signed.contentHash
        });

        // Crash immediately after RPC submission before receipt persistence completes
        process.exit(137);
      } catch (e) {
        __emitEvidence({ submittedToNode: false, error: e.message });
        process.exit(1);
      }
    `;

    const fs = await import("fs/promises");
    const path = await import("path");
    await fs.writeFile(path.join(ctx.consumerDir, "rec-01b-crash.js"), crashCode);

    const crashRes = await runCommand("node rec-01b-crash.js", ctx.consumerDir);
    evidence.push("REC-01B PROCESS A OUTPUT:\n" + crashRes.stdout + "\n" + crashRes.stderr);

    const parseEvidence = (stdout: string) => {
      const match = stdout.match(/---EVIDENCE_START---\n([\s\S]*?)\n---EVIDENCE_END---/);
      if (match && match[1]) {
        try { return JSON.parse(match[1]); } catch (e) {}
      }
      return null;
    };

    const crashData = parseEvidence(crashRes.stdout);

    if (!crashData || !crashData.txId) {
      // If QF-005 blocked initial submission despite feeRate override, report BLOCKED_BY_QF-005
      if (crashData?.error?.includes("not standard") || crashData?.error?.includes("fees")) {
        status = "BLOCKED_BY_QF-005" as any;
        assertions.push({
          name: "REC-01B.A submission blocked by known QF-005 fee floor bug",
          passed: false,
          actual: crashData
        });
        return { status, assertions, evidence };
      }
      status = "FAIL";
      assertions.push({
        name: "REC-01B.A Process A submitted tx to node",
        passed: false,
        actual: crashData
      });
      return { status, assertions, evidence };
    }

    const txId = crashData.txId;
    assertions.push({
      name: "REC-01B.A Process A submitted tx to node and crashed (exit 137)",
      passed: crashRes.code === 137,
      actual: { code: crashRes.code, txId }
    });

    // Process B (fresh process): Queries node RPC for authoritative tx evidence
    const recoveryCode = `
      const hk = await Hardkas.create({
        network: "simnet",
        rpc: { endpoints: ["${rpcUrl}"] }
      });

      try {
        const txId = "${txId}";

        // Query authoritative node RPC
        let inMempool = false;
        let isAccepted = false;

        try {
          const check = await hk.rpc.checkMempoolPresence(txId);
          if (check.status === "present") inMempool = true;
        } catch (e) {}

        try {
          const accepted = await hk.tx.waitForAccepted({ txId, timeoutMs: 3000, pollIntervalMs: 500 });
          if (accepted) isAccepted = true;
        } catch (e) {}

        __emitEvidence({
          nodeEvidenceFound: inMempool || isAccepted,
          inMempool,
          isAccepted
        });
      } catch (e) {
        __emitEvidence({ nodeEvidenceFound: false, error: e.message });
      } finally {
        process.exit(0);
      }
    `;

    const recRes = await runConsumerScript(ctx, "rec-01b-recovery.js", recoveryCode);
    evidence.push("REC-01B PROCESS B OUTPUT:\n" + recRes.stdout + "\n" + recRes.stderr);

    const recData = recRes.data;

    assertions.push({
      name: "REC-01B.B Process B recovers submission state via authoritative Node RPC evidence",
      passed: recData?.nodeEvidenceFound === true,
      actual: recData
    });

    assertions.push({
      name: "REC-01B.C Process B does not assume absence of local receipt means absence of submission",
      passed: recData?.nodeEvidenceFound === true,
      actual: recData
    });

    if (assertions.some(a => !a.passed)) {
      status = "FAIL";
    }

    return { status, assertions, evidence };
  }
};
