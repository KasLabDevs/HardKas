import { describe, it, expect, vi, afterEach } from "vitest";

// Route 7 (10-nov), closed 2026-11-11 · the simnet test harness held HARDKAS_KASPAD_IMAGE to no rule: any tag ran. It now
// applies the digest rule of `hardkas node start` (P39) before any directory is made or Docker is asked anything. No
// Docker here: `spawn` is replaced, so "Docker was not asked" is observed.

const spawned = vi.hoisted(() => ({ calls: [] as unknown[][] }));
vi.mock("child_process", async (importOriginal) => {
  const real = await importOriginal<typeof import("child_process")>();
  return {
    ...real,
    spawn: (...args: unknown[]) => {
      spawned.calls.push(args);
      throw new Error("spawn is not expected in this test");
    }
  };
});

import { SimnetNodeHarness } from "../src/simnet-node-harness.js";

afterEach(() => {
  vi.unstubAllEnvs();
  spawned.calls.length = 0;
});

describe("SimnetNodeHarness · HARDKAS_KASPAD_IMAGE must be pinned by digest", () => {
  it("a floating image is NODE_IMAGE_DIGEST_REQUIRED and nothing is spawned", async () => {
    vi.stubEnv("KASPAD_BIN", undefined);
    for (const image of ["kaspanet/rusty-kaspad:latest", "kaspanet/rusty-kaspad:v2.1.0", ""]) {
      vi.stubEnv("HARDKAS_KASPAD_IMAGE", image);
      const err: any = await SimnetNodeHarness.start({}).then(
        () => undefined,
        (e) => e
      );
      expect(err?.code, JSON.stringify(image)).toBe("NODE_IMAGE_DIGEST_REQUIRED");
      expect(String(err?.message)).toMatch(/Nothing was started/);
    }
    expect(spawned.calls).toEqual([]);
  });

  it("control: a pinned image passes the check and Docker is asked (here: the replaced spawn)", async () => {
    vi.stubEnv("KASPAD_BIN", undefined);
    vi.stubEnv("HARDKAS_KASPAD_IMAGE", "kaspanet/rusty-kaspad@sha256:f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b");
    const err: any = await SimnetNodeHarness.start({}).then(
      () => undefined,
      (e) => e
    );
    expect(err?.code).not.toBe("NODE_IMAGE_DIGEST_REQUIRED");
    expect(spawned.calls.length).toBeGreaterThan(0);
  });
});
