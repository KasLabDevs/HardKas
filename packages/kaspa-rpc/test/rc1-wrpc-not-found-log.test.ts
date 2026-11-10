import { describe, it, expect, vi, afterEach } from "vitest";
import { KaspaWrpcClient } from "../src/index.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

// RC1 · hackathon guide finding: after a successful `tx send`, the CLI printed
// {"level":"error","event":"wRPC error response","context":{"method":"getMempoolEntry","error":"Transaction … not found"}}
// because the observer asks the mempool for a transaction that had already left it. A lookup answered "not found" is an
// expected answer (debug level); any other failure is still an error. The caller receives the error in both cases.

afterEach(() => {
  vi.restoreAllMocks();
});

function node() {
  return fakeOfficialRpc({
    getMempoolEntry: () => {
      throw new Error("RPC Server (remote error) -> Transaction 3087f21464b64fcd4fb74b44411e37f3e94c133f36c15f3fa9ad2d8c41bc4d61 not found");
    },
    getBlockDagInfo: () => {
      throw new Error("RPC Server (remote error) -> internal failure");
    }
  });
}

describe("RC1 · wRPC log levels", () => {
  it("getMempoolEntry answered 'not found': rejected to the caller, but no error-level log line", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = new KaspaWrpcClient("ws://127.0.0.1:26398", { rpcFactory: node().factory });
    await client.connect(2000);
    await expect(client.call("getMempoolEntry", { transactionId: "00".repeat(32) })).rejects.toThrow(/not found/);
    expect(errors.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"level":"error"'))).toEqual([]);
    await client.disconnect();
  });

  it("any other failure is still logged at error level (control)", async () => {
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const client = new KaspaWrpcClient("ws://127.0.0.1:26398", { rpcFactory: node().factory });
    await client.connect(2000);
    await expect(client.call("getBlockDagInfo")).rejects.toThrow(/internal failure/);
    const lines = errors.mock.calls.map((c) => String(c[0])).filter((l) => l.includes('"level":"error"'));
    expect(lines.length).toBe(1);
    expect(lines[0]).toContain("wRPC error response");
    await client.disconnect();
  });
});
