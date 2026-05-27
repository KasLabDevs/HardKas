import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { coreEvents } from "@hardkas/core";

export const streamRoutes = new Hono();

streamRoutes.get("/artifacts/stream", async (c) => {
  return streamSSE(c, async (stream) => {
    let active = true;

    // Send an initial connected event
    await stream.writeSSE({
      event: "connected",
      data: JSON.stringify({ message: "Observational stream connected. Artifacts filesystem is canonical." }),
    });

    const listener = async (eventEnv: any) => {
      if (!active) return;
      if (eventEnv.kind === "artifact.written") {
        await stream.writeSSE({
          event: "artifact",
          data: JSON.stringify({
            envelope: {
              ok: true,
              data: eventEnv.payload,
              warnings: ["Missed stream events must be recovered by fetching from /api/artifacts"],
              meta: { network: "local" }
            }
          }),
        });
      }
    };

    // Use on which returns an unsubscribe function
    const unsubscribe = coreEvents.on(listener);

    // Keep alive and handle disconnect
    while (active) {
      await new Promise(r => setTimeout(r, 15000));
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
