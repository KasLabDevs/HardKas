import { Hono } from "hono";
import { getQueryBackend } from "../db.js";

export const activityRoutes = new Hono();

activityRoutes.get("/", async (c) => {
  const queryBackend = getQueryBackend();

  try {
    const events = await queryBackend.getEvents();
    
    const list = events.map(e => ({
      eventId: e.eventId,
      kind: e.kind,
      domain: e.domain,
      workflowId: e.workflowId,
      txId: e.txId,
      artifactId: e.artifactId,
      networkId: e.networkId,
      timestamp: e.timestamp,
      payload: e.payload
    })).sort((a, b) => new Date(b.timestamp || 0).getTime() - new Date(a.timestamp || 0).getTime())
       .slice(0, 50);

    return c.json({ activity: list });
  } catch (e: any) {
    console.error("Failed to list activity events:", e);
    return c.json({ error: e.message }, 500);
  }
});
