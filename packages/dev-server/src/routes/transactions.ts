import { Hono } from "hono";
import { getQueryBackend } from "../db.js";
import { formatSompiToKas } from "@hardkas/core";

export const transactionsRoutes = new Hono();

interface UnifiedTransaction {
  id: string;
  txId?: string;
  planId?: string;
  signedId?: string;
  receiptId?: string;
  artifactId: string;
  artifactPath: string;
  artifactKind: string;
  integrityStatus: string;
  status: string;
  from: string;
  to: string;
  amountSompi: string;
  amount: string;
  feeSompi?: string;
  timestamp: string;
  mode: string;
  networkId: string;
  layer: "L1" | "L2";
  replayStatus?: string;
  sourceTimestamp?: string;
  lastReplayTimestamp?: string;
  stalenessReasons?: string[];
}

transactionsRoutes.get("/", async (c) => {
  const queryBackend = getQueryBackend();

  try {
    const allArtifacts = await queryBackend.findArtifacts();

    // Group artifacts by their relationship
    const plans = allArtifacts.filter(
      (a) => a.schema.includes("txPlan") || a.schema.includes("TxPlan")
    );
    const signed = allArtifacts.filter(
      (a) => a.schema.includes("signedTx") || a.schema.includes("SignedTx")
    );
    const receipts = allArtifacts.filter(
      (a) => a.schema.includes("txReceipt") || a.schema.includes("TxReceipt")
    );

    const unifiedMap = new Map<string, UnifiedTransaction>();

    // 1. Add all receipts (most complete state)
    for (const r of receipts) {
      const txId = r.txId || r.payload.txId;
      if (!txId) continue;

      const layer = r.schema.includes("igra") ? "L2" : "L1";
      unifiedMap.set(txId, {
        id: txId,
        txId,
        signedId: r.payload.sourceSignedId,
        receiptId: r.artifactId,
        artifactId: r.artifactId,
        artifactPath: r.path,
        artifactKind: r.schema,
        integrityStatus: r.kind === "CORRUPTED" ? "CORRUPTED" : "OK",
        status: r.payload.status || "confirmed",
        from: r.payload.from?.address || r.payload.from || "unknown",
        to: r.payload.to?.address || r.payload.to || "unknown",
        amountSompi: r.payload.amountSompi || "0",
        amount:
          r.payload.amount ||
          (r.payload.amountSompi ? formatSompiToKas(r.payload.amountSompi) : "0"),
        feeSompi: r.payload.feeSompi,
        timestamp: r.payload.submittedAt || r.createdAt || new Date().toISOString(),
        mode: r.mode,
        networkId: r.networkId,
        layer
      });
    }

    // 2. Add signed transactions not represented in receipts
    for (const s of signed) {
      const txId = s.payload.txId;
      const signedId = s.artifactId;

      // If we already have the transaction under txId, update the signedId
      if (txId && unifiedMap.has(txId)) {
        const existing = unifiedMap.get(txId)!;
        existing.signedId = signedId;
        if (!existing.planId) existing.planId = s.payload.sourcePlanId;
        continue;
      }

      const layer = s.schema.includes("igra") ? "L2" : "L1";
      const id = txId || signedId;

      unifiedMap.set(id, {
        id,
        txId,
        signedId,
        planId: s.payload.sourcePlanId,
        artifactId: s.artifactId,
        artifactPath: s.path,
        artifactKind: s.schema,
        integrityStatus: s.kind === "CORRUPTED" ? "CORRUPTED" : "OK",
        status: "signed",
        from: s.payload.from?.address || s.payload.from || "unknown",
        to: s.payload.to?.address || s.payload.to || "unknown",
        amountSompi: s.payload.amountSompi || "0",
        amount:
          s.payload.amount ||
          (s.payload.amountSompi ? formatSompiToKas(s.payload.amountSompi) : "0"),
        timestamp: s.createdAt || new Date().toISOString(),
        mode: s.mode,
        networkId: s.networkId,
        layer
      });
    }

    // 3. Add plans not represented in signed or receipts
    for (const p of plans) {
      const planId = p.payload.planId || p.artifactId;

      // Check if any existing unified tx has this planId as source
      let alreadyUnified = false;
      for (const utx of unifiedMap.values()) {
        if (utx.planId === planId) {
          alreadyUnified = true;
          break;
        }
      }
      if (alreadyUnified) continue;

      const layer = p.schema.includes("igra") ? "L2" : "L1";

      unifiedMap.set(planId, {
        id: planId,
        planId,
        artifactId: p.artifactId,
        artifactPath: p.path,
        artifactKind: p.schema,
        integrityStatus: p.kind === "CORRUPTED" ? "CORRUPTED" : "OK",
        status: p.payload.status || "built",
        from: p.payload.from?.address || p.payload.from || "unknown",
        to: p.payload.to?.address || p.payload.to || "unknown",
        amountSompi: p.payload.amountSompi || "0",
        amount:
          p.payload.amount ||
          (p.payload.amountSompi ? formatSompiToKas(p.payload.amountSompi) : "0"),
        timestamp: p.createdAt || new Date().toISOString(),
        mode: p.mode,
        networkId: p.networkId,
        layer
      });
    }

    // Resolve replay status for all unified transactions
    const replays = allArtifacts.filter(
      (a) =>
        a.schema.includes("replayReport") ||
        a.schema.includes("ReplayReport") ||
        a.schema === "hardkas.replayReport.v1"
    );
    for (const utx of unifiedMap.values()) {
      utx.stalenessReasons = [];
      const txId = utx.txId || utx.planId || utx.signedId;
      if (txId) {
        const replay = replays.find(
          (r) => r.payload.txId === txId || r.txId === txId || r.artifactId === txId
        );

        utx.sourceTimestamp = utx.timestamp;

        if (replay) {
          utx.lastReplayTimestamp =
            replay.createdAt || (replay as any).timestamp || replay.payload?.createdAt;

          const planOk = replay.payload.planOk !== false;
          const receiptOk = replay.payload.receiptOk !== false;
          const invariantsOk = replay.payload.invariantsOk !== false;
          utx.replayStatus = planOk && receiptOk && invariantsOk ? "PASS" : "FAIL";

          const srcTime = new Date(utx.sourceTimestamp).getTime();
          const repTime = new Date(utx.lastReplayTimestamp!).getTime();

          if (srcTime > repTime) {
            utx.stalenessReasons.push("source_timestamp > last_replay_timestamp");
          }
        } else if (utx.status === "confirmed") {
          utx.stalenessReasons.push("missing_replay");
        }
      }
    }

    // Sort by timestamp descending
    const list = Array.from(unifiedMap.values()).sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    return c.json({ transactions: list });
  } catch (e: any) {
    console.error("Failed to list transactions:", e);
    return c.json({ error: e.message }, 500);
  }
});

transactionsRoutes.get("/:id", async (c) => {
  const id = c.req.param("id");
  const queryBackend = getQueryBackend();

  try {
    // We search for plan, signed, or receipt matching this ID
    const allArtifacts = await queryBackend.findArtifacts();

    let plan: any = null;
    let signed: any = null;
    let receipt: any = null;
    let trace: any = null;

    // Search by artifact ID or internal fields
    for (const a of allArtifacts) {
      const payload = a.payload;

      // Is it a receipt matching the ID?
      if (a.schema.includes("txReceipt") || a.schema.includes("TxReceipt")) {
        if (
          a.artifactId === id ||
          a.txId === id ||
          payload.txId === id ||
          payload.sourceSignedId === id
        ) {
          receipt = a;
        }
      }
      // Is it a signed tx matching the ID?
      else if (a.schema.includes("signedTx") || a.schema.includes("SignedTx")) {
        if (
          a.artifactId === id ||
          payload.signedId === id ||
          payload.txId === id ||
          payload.sourcePlanId === id
        ) {
          signed = a;
        }
      }
      // Is it a plan matching the ID?
      else if (a.schema.includes("txPlan") || a.schema.includes("TxPlan")) {
        if (a.artifactId === id || payload.planId === id) {
          plan = a;
        }
      }
      // Is it a trace matching the ID?
      else if (a.schema.includes("txTrace") || a.schema.includes("TxTrace")) {
        if (a.artifactId === id || a.txId === id || payload.txId === id) {
          trace = a;
        }
      }
    }

    // Correlate using lineage/references if not all found
    if (receipt && !signed) {
      const sourceSignedId = receipt.payload.sourceSignedId;
      signed = allArtifacts.find((a) => a.artifactId === sourceSignedId);
    }
    if (signed && !plan) {
      const sourcePlanId = signed.payload.sourcePlanId;
      plan = allArtifacts.find((a) => a.artifactId === sourcePlanId);
    }
    if (receipt && !trace) {
      const txId = receipt.txId || receipt.payload.txId;
      trace = allArtifacts.find(
        (a) =>
          (a.schema.includes("txTrace") || a.schema.includes("TxTrace")) &&
          a.txId === txId
      );
    }

    // Lineage graph edges
    const parentId = plan?.artifactId;
    const signedId = signed?.artifactId;
    const receiptId = receipt?.artifactId;
    const traceId = trace?.artifactId;

    const edges: any[] = [];
    if (parentId && signedId) {
      edges.push({ from: parentId, to: signedId, label: "signed" });
    }
    if (signedId && receiptId) {
      edges.push({ from: signedId, to: receiptId, label: "submitted" });
    }
    if (receiptId && traceId) {
      edges.push({ from: receiptId, to: traceId, label: "traced" });
    }

    // Replay result for this transaction
    let replay: any = null;
    let replayStatus: string | undefined = undefined;
    const txId = receipt?.txId || receipt?.payload?.txId || signed?.payload?.txId;
    if (txId) {
      const replays = await queryBackend.findArtifacts({
        schema: "hardkas.replayReport.v1"
      });
      replay = replays.find(
        (r) => r.payload.txId === txId || r.txId === txId || r.artifactId === txId
      );
      if (replay) {
        const planOk = replay.payload.planOk !== false;
        const receiptOk = replay.payload.receiptOk !== false;
        const invariantsOk = replay.payload.invariantsOk !== false;
        replayStatus = planOk && receiptOk && invariantsOk ? "PASS" : "FAIL";
      }
    }

    if (!plan && !signed && !receipt) {
      return c.json({ error: `Transaction with ID '${id}' not found` }, 404);
    }

    const target = receipt || signed || plan;
    const p = target?.payload || {};

    const integrity = {
      verified: !!target?.contentHash,
      reason: target?.contentHash ? undefined : "Missing content hash"
    };

    return c.json({
      // Normalized DTO fields
      id,
      txId: p.txId || id,
      type: receipt ? "receipt" : signed ? "signed" : "plan",
      networkId: p.networkId || "simulated",
      network: p.networkName || p.networkId || "simulated",
      mode: p.mode || "simulated",
      timestamp:
        p.createdAt || p.submittedAt || target?.createdAt || new Date().toISOString(),
      amountSompi: p.amountSompi || "0",
      amount: p.amount || p.amountSompi || "0",
      feeSompi: p.feeSompi || "0",
      fee: p.feeSompi || "0",
      from: p.from?.address || p.from || "-",
      to: p.to?.address || p.to || "-",
      status: p.status || (receipt ? "confirmed" : signed ? "signed" : "planned"),
      contentHash: target?.contentHash || "-",
      integrity,
      rawArtifact: target,
      replayStatus,

      // Lineage & Graph fields (preserved)
      plan: plan
        ? {
            artifactId: plan.artifactId,
            contentHash: plan.contentHash,
            payload: plan.payload,
            createdAt: plan.createdAt
          }
        : null,
      signed: signed
        ? {
            artifactId: signed.artifactId,
            contentHash: signed.contentHash,
            payload: signed.payload,
            createdAt: signed.createdAt
          }
        : null,
      receipt: receipt
        ? {
            artifactId: receipt.artifactId,
            contentHash: receipt.contentHash,
            payload: receipt.payload,
            createdAt: receipt.createdAt
          }
        : null,
      trace: trace
        ? {
            artifactId: trace.artifactId,
            contentHash: trace.contentHash,
            payload: trace.payload,
            createdAt: trace.createdAt
          }
        : null,
      replay: replay
        ? {
            artifactId: replay.artifactId,
            contentHash: replay.contentHash,
            payload: replay.payload,
            createdAt: replay.createdAt
          }
        : null,
      lineage: {
        nodes: [
          plan && { id: plan.artifactId, label: "Plan", schema: plan.schema },
          signed && { id: signed.artifactId, label: "Signed", schema: signed.schema },
          receipt && { id: receipt.artifactId, label: "Receipt", schema: receipt.schema },
          trace && { id: trace.artifactId, label: "Trace", schema: trace.schema },
          replay && { id: replay.artifactId, label: "Replay", schema: replay.schema }
        ].filter(Boolean),
        edges
      }
    });
  } catch (e: any) {
    console.error(`Failed to get transaction detail for '${id}':`, e);
    return c.json({ error: e.message }, 500);
  }
});
