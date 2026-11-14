import { describe, it, expect, vi, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { logger } from "@hardkas/observability";
import { SyncDaemon } from "../src/daemon.js";

// A3 (rc2 audit) · the sync daemon logged `err.message` of whatever its backend threw, so an endpoint with credentials
// in it (user:password@, ?api_key=…) went into the application log. Now every logged error text is redacted.

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-sync-a3-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("A3 · SyncDaemon never logs endpoint credentials", () => {
  it("a backend error naming wss://user:pass@host/?api_key=… is logged without the credentials", async () => {
    const logged: string[] = [];
    const spy = vi.spyOn(logger, "error").mockImplementation((message: string, context?: any) => {
      logged.push(`${message} ${JSON.stringify(context ?? {})}`);
    });
    try {
      const backend: any = {
        capabilities: { externalState: true },
        connect: async () => {
          throw new Error("Cannot connect to Kaspa RPC at wss://alice:s3cr3t-pass@node.example/?api_key=K3Y-VALUE");
        }
      };
      const daemon = SyncDaemon.open({ backend, pollIntervalMs: 10, checkpointPath: path.join(dir, "sync.json") });
      await daemon.start();
      await vi.waitFor(() => expect(logged.length).toBeGreaterThan(0), { timeout: 5_000 });
      await daemon.stop();
    } finally {
      spy.mockRestore();
    }
    const all = logged.join("\n");
    expect(all).toMatch(/node\.example/);
    expect(all).not.toMatch(/alice|s3cr3t-pass|K3Y-VALUE/);
  }, 30_000);
});
