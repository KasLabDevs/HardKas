import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import chokidar from "chokidar";
import { startHardkasWatcher, stopHardkasWatcher } from "../src/watcher.js";
import fs from "node:fs";
import path from "node:path";

vi.mock("chokidar", () => {
  const watchMock = {
    on: vi.fn().mockReturnThis(),
    close: vi.fn().mockResolvedValue(undefined)
  };
  return {
    default: {
      watch: vi.fn().mockReturnValue(watchMock)
    }
  };
});

describe("Watcher Fallback & Polling Contract", () => {
  const originalEnv = process.env.HARDKAS_WATCH_POLLING;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    process.env.HARDKAS_WATCH_POLLING = originalEnv;
    await stopHardkasWatcher();
  });

  it("should start chokidar with native fs events by default", () => {
    delete process.env.HARDKAS_WATCH_POLLING;

    startHardkasWatcher();

    expect(chokidar.watch).toHaveBeenCalled();
    const opts = (chokidar.watch as any).mock.calls[0][1];
    expect(opts.usePolling).toBe(process.platform === "linux");
  });

  it("should respect HARDKAS_WATCH_POLLING=1 and enable polling", () => {
    process.env.HARDKAS_WATCH_POLLING = "1";

    startHardkasWatcher();

    expect(chokidar.watch).toHaveBeenCalled();
    const opts = (chokidar.watch as any).mock.calls[0][1];
    expect(opts.usePolling).toBe(true);
    expect(opts.interval).toBe(1000);
  });

  it("should fall back gracefully to polling when watch setup throws ENOSPC / ENOTSUP", () => {
    delete process.env.HARDKAS_WATCH_POLLING;
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "win32", configurable: true });

    try {
      // First call throws ENOSPC, second call (polling fallback) succeeds
      vi.mocked(chokidar.watch)
        .mockImplementationOnce(() => {
          const err: any = new Error(
            "ENOSPC: System limit for number of file watchers reached"
          );
          ((err as any).code) = "ENOSPC";
          throw err;
        })
        .mockReturnValueOnce({
          on: vi.fn().mockReturnThis(),
          close: vi.fn().mockResolvedValue(undefined)
        } as any);

      startHardkasWatcher();

      // It should have called watch twice: once native (fail), once polling fallback (success)
      expect(chokidar.watch).toHaveBeenCalledTimes(2);
      const nativeOpts = (chokidar.watch as any).mock.calls[0][1];
      const fallbackOpts = (chokidar.watch as any).mock.calls[1][1];

      expect(nativeOpts.usePolling).toBe(false);
      expect(fallbackOpts.usePolling).toBe(true);
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true
      });
    }
  });
});
