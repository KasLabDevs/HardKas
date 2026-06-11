import { Hono } from "hono";
import { getQueryBackend } from "../db.js";

export const eventsRoutes = new Hono();

eventsRoutes.get("/", async (c) => {
  const queryBackend = getQueryBackend();
  const kind = c.req.query("kind");
  const txId = c.req.query("txId");

  try {
    const filters: { kind?: string; txId?: string } = {};
    if (kind) filters.kind = kind;
    if (txId) filters.txId = txId;

    const events = await queryBackend.getEvents(filters);

    // Sort descending by timestamp
    const sorted = events.sort((a, b) => {
      const timeA = a.timestamp ? new Date(a.timestamp).getTime() : 0;
      const timeB = b.timestamp ? new Date(b.timestamp).getTime() : 0;
      return timeB - timeA;
    });

    let observabilityDrift = false;
    if (sorted.length === 0 && !kind && !txId) {
      const allArtifacts = await queryBackend.findArtifacts();
      if (allArtifacts.length > 0) {
        observabilityDrift = true;
      }
    }

    return c.json({
      events: sorted,
      observabilityDrift,
      reason: observabilityDrift ? "artifacts_exist_without_events" : undefined
    });
  } catch (e: unknown) {
    console.error("Failed to fetch events:", e);
    return c.json({ error: ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) }, 500);
  }
});
