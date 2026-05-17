import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

export const streamRoutes = new Hono();

// Global emitter simulator for the dev server (in-memory)
export const devServerEmitter = {
  listeners: [] as Array<(data: any) => void>,
  emit(event: string, data: any) {
    this.listeners.forEach(l => l({ event, data }));
  },
  subscribe(l: (data: any) => void) {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter(i => i !== l);
    };
  }
};

streamRoutes.get("/", async (c) => {
  return streamSSE(c, async (stream) => {
    const unsubscribe = devServerEmitter.subscribe(async (msg) => {
      await stream.writeSSE({
        event: msg.event,
        data: JSON.stringify(msg.data)
      });
    });

    // Initial heartbeat
    await stream.writeSSE({
      event: "heartbeat",
      data: JSON.stringify({ timestamp: Date.now() })
    });

    // Handle connection close
    c.req.raw.signal.addEventListener("abort", () => {
      unsubscribe();
    });

    // Keep alive loop
    while (!c.req.raw.signal.aborted) {
      await new Promise(r => setTimeout(r, 30000));
      if (!c.req.raw.signal.aborted) {
        await stream.writeSSE({
          event: "ping",
          data: JSON.stringify({ t: Date.now() })
        });
      }
    }
  });
});
