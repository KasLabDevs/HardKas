import { Hono } from "hono";
import { getQueryBackend } from "../db.js";

export const replayRoutes = new Hono();

replayRoutes.get("/", async (c) => {
  const queryBackend = getQueryBackend();

  try {
    const replays = await queryBackend.findArtifacts({ schema: "hardkas.replayReport.v1" });
    const formatted = replays.map(r => ({
      artifactId: r.artifactId,
      txId: r.payload.txId || r.txId,
      planOk: r.payload.planOk,
      receiptOk: r.payload.receiptOk,
      invariantsOk: r.payload.invariantsOk,
      ok: r.payload.planOk && r.payload.receiptOk && r.payload.invariantsOk,
      status: (r.payload.planOk && r.payload.receiptOk && r.payload.invariantsOk) ? "PASS" : "FAIL",
      checks: r.payload.checks,
      errors: r.payload.errors || [],
      divergencesCount: (r.payload.divergences || []).length,
      mismatches: r.payload.divergences || [],
      deterministic: r.payload.invariantsOk,
      createdAt: r.createdAt
    })).sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

    return c.json({ replays: formatted });
  } catch (e: any) {
    console.error("Failed to list replay reports:", e);
    return c.json({ error: e.message }, 500);
  }
});

replayRoutes.get("/:txId", async (c) => {
  const txId = c.req.param("txId");
  const queryBackend = getQueryBackend();

  try {
    const replays = await queryBackend.findArtifacts({ schema: "hardkas.replayReport.v1" });
    const report = replays.find(r => r.payload.txId === txId || r.txId === txId || r.artifactId === txId);
    
    if (!report) {
      return c.json({ error: `Replay report for transaction '${txId}' not found` }, 404);
    }
    
    return c.json({ replay: report });
  } catch (e: any) {
    console.error(`Failed to get replay report for '${txId}':`, e);
    return c.json({ error: e.message }, 500);
  }
});
