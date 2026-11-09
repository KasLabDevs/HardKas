import { describe, it, expect } from "vitest";
import { OfficialRpcSession } from "../src/upstream/session.js";
import * as rpc from "../src/index.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

// INT9-A (I-3b) · being synced is a separate verdict from serving the right network. A session that requires it asks
// nothing of a node that does not say it is synced (NODE_NOT_SYNCED), from the SAME getServerInfo answer as the
// network check (no extra call); a session that does not require it (diagnostics, reads) uses the node whatever it says.

function node(isSynced: boolean | undefined) {
  const fake = fakeOfficialRpc({
    getServerInfo: () => ({
      rpcApiVersion: 1,
      rpcApiRevision: 0,
      serverVersion: "2.1.0",
      networkId: "devnet",
      hasUtxoIndex: true,
      ...(isSynced === undefined ? {} : { isSynced }),
      virtualDaaScore: 7n
    }),
    getUtxosByAddresses: () => ({ entries: [] }),
    submitTransaction: () => ({ transactionId: "ab".repeat(32) })
  });
  return { fake, methods: () => fake.calls.map((c) => c.method) };
}

const session = (fake: ReturnType<typeof fakeOfficialRpc>, requireSynced: boolean) =>
  new (OfficialRpcSession as any)("ws://127.0.0.1:26320", 2000, fake.factory, "devnet", requireSynced) as OfficialRpcSession;

async function failure(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a failure, the call succeeded");
}

describe("INT9-A · a session can require a synced node, apart from its network", () => {
  it("a node of the right network that says it is not synced: NODE_NOT_SYNCED, nothing else asked", async () => {
    const { fake, methods } = node(false);
    const e = await failure(session(fake, true).request("getUtxosByAddresses", { addresses: ["kaspadev:q"] }));
    expect({ code: e.code, name: e.name, retriable: e.isRetriable }).toEqual({ code: "NODE_NOT_SYNCED", name: "NodeSyncError", retriable: false });
    expect(String(e.message)).toMatch(/says it is not synced/);
    expect((rpc as any).isNodeSyncError(e)).toBe(true);
    expect((rpc as any).isNodeNetworkIdentityError(e)).toBe(false);
    expect(methods()).toEqual(["getServerInfo"]);
  });

  it("a node that does not say: refused the same way (never assumed synced)", async () => {
    const { fake, methods } = node(undefined);
    const e = await failure(session(fake, true).request("getUtxosByAddresses", { addresses: ["kaspadev:q"] }));
    expect(e.code).toBe("NODE_NOT_SYNCED");
    expect(String(e.message)).toMatch(/did not say whether it is synced/);
    expect(methods()).toEqual(["getServerInfo"]);
  });

  it("a submission to a node that is not synced never reaches it (typed, marked not sent)", async () => {
    const { fake, methods } = node(false);
    const transaction = { version: 0, inputs: [], outputs: [], lockTime: "0", subnetworkId: "00".repeat(20), gas: "0", payload: "", storageMass: "0" };
    const e = await failure(session(fake, true).request("submitTransaction", { transaction }));
    expect(e.code).toBe("NODE_NOT_SYNCED");
    expect((rpc as any).isRpcRequestNotSentError(e)).toBe(true);
    expect(methods()).not.toContain("submitTransaction");
  });

  it("a synced node is used normally, with no extra call; without the requirement an unsynced node is used for reads", async () => {
    const synced = node(true);
    await session(synced.fake, true).request("getUtxosByAddresses", { addresses: ["kaspadev:q"] });
    expect(synced.methods()).toEqual(["getServerInfo", "getUtxosByAddresses"]);
    const unsynced = node(false);
    await session(unsynced.fake, false).request("getUtxosByAddresses", { addresses: ["kaspadev:q"] });
    expect(unsynced.methods()).toEqual(["getServerInfo", "getUtxosByAddresses"]);
  });

  it("JsonWrpcKaspaClient and KaspaWrpcClient carry the requirement to their session", async () => {
    const a = node(false);
    const json = new rpc.JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:26320", rpcFactory: a.fake.factory, expectedNetworkId: "devnet", requireSynced: true } as any);
    expect((await failure(json.getUtxosByAddresses(["kaspadev:q"]))).code).toBe("NODE_NOT_SYNCED");
    const b = node(false);
    const ws = new rpc.KaspaWrpcClient("ws://127.0.0.1:26320", { rpcFactory: b.fake.factory, expectedNetworkId: "devnet", requireSynced: true } as any);
    expect((await failure(ws.connect(2000))).code).toBe("NODE_NOT_SYNCED");
  });

  it("getServerInfo reports the RPC protocol version and revision (endpoint identity evidence)", async () => {
    const a = node(true);
    const json = new rpc.JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:26320", rpcFactory: a.fake.factory } as any);
    const info: any = await json.getServerInfo();
    expect({ rpcApiVersion: info.rpcApiVersion, rpcApiRevision: info.rpcApiRevision, isSynced: info.isSynced }).toEqual({ rpcApiVersion: 1, rpcApiRevision: 0, isSynced: true });
  });
});
