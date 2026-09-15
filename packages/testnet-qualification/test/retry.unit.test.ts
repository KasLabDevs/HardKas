import { describe, it, expect, vi } from "vitest";
import {
  classifyError,
  withRetryOnTransport,
  RemoteTestnetProbeFailedErrorMarker
} from "../src/retry.js";

class FakeProbeError extends RemoteTestnetProbeFailedErrorMarker {
  readonly reason: "NETWORK_MISMATCH" | "UNSYNCED" | "MISSING_CAPABILITY" | "RPC_ERROR";
  constructor(reason: FakeProbeError["reason"], message: string) {
    super(message);
    this.reason = reason;
  }
}

describe("classifyError", () => {
  it("classifies node errno codes as transport", () => {
    for (const code of ["ECONNREFUSED", "ECONNRESET", "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "ENETUNREACH", "ENOTFOUND", "EAI_AGAIN"]) {
      const err = Object.assign(new Error("boom"), { code });
      expect(classifyError(err), `code=${code}`).toBe("transport");
    }
  });

  it("classifies message patterns like 'timeout', 'connection refused', 'socket hang up' as transport", () => {
    expect(classifyError(new Error("connect timeout after 3000ms"))).toBe("transport");
    expect(classifyError(new Error("Connection refused by remote"))).toBe("transport");
    expect(classifyError(new Error("socket hang up"))).toBe("transport");
    expect(classifyError(new Error("Websocket unexpectedly closed"))).toBe("transport");
  });

  it("classifies probe errors via the marker (network-mismatch, unsynced, missing-capability, transport for RPC_ERROR)", () => {
    expect(classifyError(new FakeProbeError("NETWORK_MISMATCH", "x"))).toBe("network-mismatch");
    expect(classifyError(new FakeProbeError("UNSYNCED", "x"))).toBe("unsynced");
    expect(classifyError(new FakeProbeError("MISSING_CAPABILITY", "x"))).toBe("missing-capability");
    expect(classifyError(new FakeProbeError("RPC_ERROR", "x"))).toBe("transport");
  });

  it("classifies consensus/policy messages as consensus", () => {
    expect(classifyError(new Error("Transaction rejected: invalid signature"))).toBe("consensus");
    expect(classifyError(new Error("orphan transaction"))).toBe("consensus");
    expect(classifyError(new Error("double spend"))).toBe("consensus");
    expect(classifyError(new Error("mass exceeds maximum"))).toBe("consensus");
  });

  it("classifies plain-text network mismatch / unsynced / missing capability", () => {
    expect(classifyError(new Error("Wrong network on endpoint"))).toBe("network-mismatch");
    expect(classifyError(new Error("Node is still syncing"))).toBe("unsynced");
    expect(classifyError(new Error("Unknown method"))).toBe("missing-capability");
  });

  it("returns 'unknown' when the error carries nothing recognisable", () => {
    expect(classifyError(new Error("something happened"))).toBe("unknown");
    expect(classifyError({ some: "shape" })).toBe("unknown");
    expect(classifyError(null)).toBe("unknown");
  });
});

describe("withRetryOnTransport", () => {
  it("succeeds on first attempt without sleeping", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const fn = vi.fn(async () => "ok");
    const result = await withRetryOnTransport(fn, { sleep });
    expect(result).toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(0);
  });

  it("retries on transport errors up to maxAttempts, then throws the last error", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const err = Object.assign(new Error("connect timeout"), { code: "ETIMEDOUT" });
    const fn = vi.fn(async () => { throw err; });
    await expect(withRetryOnTransport(fn, { maxAttempts: 3, backoffBaseMs: 10, sleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2); // sleeps between attempts 1→2 and 2→3
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([10, 20]);
  });

  it("does NOT retry on consensus errors even on attempt 1", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const err = new Error("Transaction rejected: policy violation");
    const fn = vi.fn(async () => { throw err; });
    await expect(withRetryOnTransport(fn, { maxAttempts: 5, sleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(0);
  });

  it("does NOT retry on network-mismatch / unsynced / missing-capability probe errors", async () => {
    for (const reason of ["NETWORK_MISMATCH", "UNSYNCED", "MISSING_CAPABILITY"] as const) {
      const sleep = vi.fn(async (_ms: number) => {});
      const err = new FakeProbeError(reason, `x-${reason}`);
      const fn = vi.fn(async () => { throw err; });
      await expect(withRetryOnTransport(fn, { maxAttempts: 5, sleep })).rejects.toBe(err);
      expect(fn, `reason=${reason}`).toHaveBeenCalledTimes(1);
      expect(sleep).toHaveBeenCalledTimes(0);
    }
  });

  it("recovers when a transient transport failure precedes a success", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const transient = Object.assign(new Error("socket hang up"), { code: "ECONNRESET" });
    let calls = 0;
    const fn = vi.fn(async () => {
      calls++;
      if (calls === 1) throw transient;
      return "eventual";
    });
    const result = await withRetryOnTransport(fn, { maxAttempts: 3, backoffBaseMs: 5, sleep });
    expect(result).toBe("eventual");
    expect(fn).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenCalledTimes(1);
  });

  it("does not treat 'unknown' as transport (unknown → consensus semantics)", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const err = new Error("something opaque");
    const fn = vi.fn(async () => { throw err; });
    await expect(withRetryOnTransport(fn, { maxAttempts: 5, sleep })).rejects.toBe(err);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(sleep).toHaveBeenCalledTimes(0);
  });

  it("invokes onRetry with attempt number and error before each backoff", async () => {
    const sleep = vi.fn(async (_ms: number) => {});
    const onRetry = vi.fn();
    const err = Object.assign(new Error("timeout"), { code: "ETIMEDOUT" });
    const fn = vi.fn(async () => { throw err; });
    await expect(withRetryOnTransport(fn, { maxAttempts: 3, backoffBaseMs: 1, sleep, onRetry })).rejects.toBe(err);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0]).toEqual([1, err]);
    expect(onRetry.mock.calls[1]).toEqual([2, err]);
  });
});
