import { Hono } from "hono";
import { getQueryBackend } from "../db.js";

export const replayRoutes = new Hono();

replayRoutes.get("/", async (c) => {
  const queryBackend = getQueryBackend();

  try {
    const replays = await queryBackend.findArtifacts({ schema: "hardkas.replayReport.v1" });
    const receipts = await queryBackend.findArtifacts({ schema: "hardkas.txReceipt.v1" });
    const igraReceipts = await queryBackend.findArtifacts({ schema: "hardkas.igraTxReceipt.v1" });

    const allReceipts = [...receipts, ...igraReceipts];
    const replayTxIds = new Set(replays.map(r => r.payload.txId));
    
    const pendingReceipts = allReceipts.filter(r => 
      (r.payload.status === "confirmed" || r.payload.status === "accepted") && 
      !replayTxIds.has(r.payload.txId)
    );

    const pendingReplay = pendingReceipts.length > 0;

    return c.json({
      replays,
      pendingReplays: pendingReceipts,
      pendingReplay,
      reason: pendingReplay ? "receipt_artifact_without_replay_report" : undefined
    });
  } catch (e: any) {
    console.error("Failed to fetch replays:", e);
    return c.json({ error: e.message }, 500);
  }
});
