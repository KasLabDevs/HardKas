import { describe, it, expect } from "vitest";
import { OfficialRpcSession } from "../src/upstream/session.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

// AUDIT 2026-11-21 · M4 · a node that answers getServerInfo without saying its network, or that refuses the question, is
// refused even when the caller names no expected network: it could be mainnet, which is not reachable at all.
describe("M4 · a node that does not identify itself is refused without an expected network", () => {
  it("NI-1 getServerInfo with no networkId ? NODE_NETWORK_UNKNOWN, nothing else reaches the node", async () => {
    const rpc = fakeOfficialRpc({ getServerInfo: () => ({ serverVersion: "2.1.0" }), getBlockDagInfo: () => ({}) });
    const s = new OfficialRpcSession("ws://127.0.0.1:18211", 1000, rpc.factory);
    await expect(s.request("getBlockDagInfo")).rejects.toMatchObject({ code: "NODE_NETWORK_UNKNOWN" });
  });
  it("NI-2 getServerInfo that fails (the node refuses) ? NODE_NETWORK_UNKNOWN", async () => {
    const rpc = fakeOfficialRpc({ getServerInfo: () => { throw new Error("method not found"); }, getBlockDagInfo: () => ({}) });
    const s = new OfficialRpcSession("ws://127.0.0.1:18211", 1000, rpc.factory);
    await expect(s.request("getBlockDagInfo")).rejects.toMatchObject({ code: "NODE_NETWORK_UNKNOWN" });
  });
  it("NI-3 a node that names a non-mainnet network is used as before", async () => {
    const rpc = fakeOfficialRpc({ getServerInfo: () => ({ networkId: "testnet-10" }), getBlockDagInfo: () => ({ ok: 1 }) });
    const s = new OfficialRpcSession("ws://127.0.0.1:18211", 1000, rpc.factory);
    await expect(s.request("getBlockDagInfo")).resolves.toBeDefined();
  });
});
