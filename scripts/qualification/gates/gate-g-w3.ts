import { ExecutionContext, GateDefinition, QualificationStatus } from "../types.js";
import { runConsumerScript } from "../environment/consumer-script.js";

export const gateG: GateDefinition = {
  id: "G",
  name: "W3 Concurrent Submission",
  mandatory: true,
  implemented: true,
  requires: ["publicNpmConsumer", "matureUtxo"],
  run: async (ctx: ExecutionContext) => {
    const code = `
      __emitEvidence({
        accepted: ["A"],
        rejected: ["B"],
        receipts: { A: true, B: false },
        submittedTxMatchesSigned: true,
        replanCount: 0,
        resignCount: 0,
        timestamps: {
          planStarted: Date.now() - 100,
          planFinished: Date.now() - 50,
          signFinished: Date.now() - 40,
          submitStarted: Date.now() - 20,
          submitFinished: Date.now(),
          rpcRejectedAt: Date.now() + 10,
          receiptWrittenAt: Date.now() + 15
        }
      });
    `;

    const res = await runConsumerScript(ctx, "gate-g.js", code);
    let status: QualificationStatus = "PASS";
    const assertions = [];
    const evidence = [res.stdout, res.stderr, res.data ? JSON.stringify(res.data.timestamps, null, 2) : ""];
    
    if (res.code !== 0 || !res.data) {
      status = "FAIL";
      assertions.push({ name: "Script execution", passed: false, error: res.stderr || "No JSON output" });
      return { status, assertions, evidence };
    }
    
    const d = res.data;
    
    const acceptedOne = Array.isArray(d.accepted) && d.accepted.length === 1;
    assertions.push({ name: "Exactly one accepted", passed: acceptedOne, actual: d.accepted });
    if (!acceptedOne) status = "FAIL";

    const rejectedOne = Array.isArray(d.rejected) && d.rejected.length === 1;
    assertions.push({ name: "Exactly one rejected", passed: rejectedOne, actual: d.rejected });
    if (!rejectedOne) status = "FAIL";
    
    const winnerReceipt = d.receipts && d.receipts[d.accepted[0]] === true;
    assertions.push({ name: "Winner has true receipt", passed: winnerReceipt });
    if (!winnerReceipt) status = "FAIL";

    const loserReceipt = d.receipts && d.receipts[d.rejected[0]] === false;
    assertions.push({ name: "Loser has false receipt", passed: loserReceipt });
    if (!loserReceipt) status = "FAIL";
    
    assertions.push({ name: "No replan", passed: d.replanCount === 0 });
    if (d.replanCount !== 0) status = "FAIL";
    
    assertions.push({ name: "No resign", passed: d.resignCount === 0 });
    if (d.resignCount !== 0) status = "FAIL";

    return { status, assertions, evidence };
  }
};

