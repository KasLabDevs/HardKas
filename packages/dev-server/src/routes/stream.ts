import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { coreEvents } from "@hardkas/core";

export const streamRoutes = new Hono();

streamRoutes.get("/artifacts/stream", async (c) => {
  const typeFilter = c.req.query("type");
  const lineageFilter = c.req.query("lineage");
  const replayFilter = c.req.query("replay");

  return streamSSE(c, async (stream) => {
    let active = true;

    // Send an initial connected event
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({
        message: "Observational stream connected. Artifacts filesystem is canonical."
      })
    });

    const listener = async (eventEnv: any) => {
      if (!active) return;
      if (eventEnv.kind === "artifact.written") {
        const payload = eventEnv.payload;
        if (!payload) return;

        if (typeFilter && payload.schema !== typeFilter && payload.kind !== typeFilter)
          return;
        if (lineageFilter === "true" && !payload.lineage) return;

        const parentArtifactIds =
          payload.parents ||
          (payload.lineage?.parentArtifactId ? [payload.lineage.parentArtifactId] : []);
        const stableEnvelope = {
          type: payload.schema || payload.kind || "artifact",
          artifactId: payload.artifactId || payload.txId || payload.id,
          parentArtifactIds,
          timestamp: payload.createdAt || new Date().toISOString(),
          status: "created",
          meta: {
            network: "local",
            warnings: [
              "Missed stream events must be recovered by fetching from /api/artifacts"
            ]
          },
          data: payload
        };

        await stream.writeSSE({
          event: "artifact",
          data: JSON.stringify(stableEnvelope)
        });
      }
    };

    // Use on which returns an unsubscribe function
    const unsubscribe = coreEvents.on(listener);

    // Keep alive and handle disconnect
    while (active) {
      await new Promise((r) => setTimeout(r, 15000));
      try {
        await stream.writeSSE({ event: "ping", data: "ping" });
      } catch (e) {
        active = false;
        unsubscribe();
        break;
      }
    }
  });
});
