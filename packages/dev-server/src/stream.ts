import { Hono } from "hono";
import { streamSSE } from "hono/streaming";

export const streamRoutes = new Hono();

// Global emitter simulator for the dev server (in-memory)
export const devServerEmitter = {
  listeners: [] as Array<(data: any) => void>,
  emit(event: string, data: any) {
    this.listeners.forEach((l) => l({ event, data }));
  },
  subscribe(l: (data: any) => void) {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((i) => i !== l);
    };
  }
};

/**
 * EVENT-LEDGER-2 (EVENT-EMISSION-1) · the watcher's notice that an artifact file appeared or changed on disk, for the
 * `/artifacts/stream` route. It is a dev-server notification, not a formal HardKAS event: it never travels on the core
 * event bus (it used to, as a fake `artifact.written` envelope without identity, which a process with the ledger
 * attached would now record as one).
 */
export interface ArtifactFileNotice {
  absolutePath: string;
  /** The parsed artifact, with `artifactId` set to its recomputed identity when it has one. */
  artifact: any;
}

export const artifactFileNotices = {
  listeners: [] as Array<(notice: ArtifactFileNotice) => void>,
  emit(notice: ArtifactFileNotice) {
    this.listeners.forEach((l) => l(notice));
  },
  subscribe(l: (notice: ArtifactFileNotice) => void) {
    this.listeners.push(l);
    return () => {
      this.listeners = this.listeners.filter((i) => i !== l);
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
      await new Promise((r) => setTimeout(r, 30000));
      if (!c.req.raw.signal.aborted) {
        await stream.writeSSE({
          event: "ping",
          data: JSON.stringify({ t: Date.now() })
        });
      }
    }
  });
});
