import { describe, it, expect } from "vitest";
import { OfficialRpcSession } from "../src/upstream/session.js";
import { NodeNetworkIdentityError, RpcConnectionError } from "../src/index.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

// -----------------------------------------------------------------------------
// SECURITY-INTEGRATION-1 (2026-10-13) · NODE-NETWORK-IDENTITY-1 on the official client's OWN reconnection. The real
// kaspa-wasm RpcClient, after the node behind its URL went away, reconnects by itself when something answers again
// (it emits "disconnect", then "connect", and reports isConnected === true). Found by the integration's cross test
// (SI-4b) and a loopback probe: the session kept handing out that client without asking the new node which network it
// serves. A connection resumed after a "disconnect" is verified like any other before it is used.
// And the session's messages name the endpoint without its credentials: the identity refusal hid the userinfo but kept
// a secret query parameter (?token=…), and a connection failure repeated the URL as given (SI-6b).
// -----------------------------------------------------------------------------

function nodeClaiming(initial: string) {
  const state = { networkId: initial };
  const fake = fakeOfficialRpc({
    getServerInfo: () => ({ rpcApiVersion: 1, serverVersion: "2.1.0", networkId: state.networkId, hasUtxoIndex: true, isSynced: true, virtualDaaScore: 7n }),
    getBlockDagInfo: () => ({ virtualDaaScore: 7n, tipHashes: [] }),
    submitTransaction: () => ({ transactionId: "ab".repeat(32) })
  });
  return { fake, state, methods: () => fake.calls.map((c) => c.method) };
}
const session = (fake: ReturnType<typeof fakeOfficialRpc>, expectedNetworkId?: string, url = "ws://127.0.0.1:28210") =>
  new (OfficialRpcSession as any)(url, 2000, fake.factory, expectedNetworkId) as OfficialRpcSession;
/** The official client resumes by itself: same client object, connected again, behind the same URL. */
const silentReconnect = (fake: ReturnType<typeof fakeOfficialRpc>) => {
  fake.emit("disconnect", undefined);
  fake.emit("connect", undefined);
};

async function failure(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a failure, the call succeeded");
}

describe("SECURITY-INTEGRATION-1 · a connection the official client resumed by itself is verified again", () => {
  it("resumed on a node that declares mainnet: NODE_NETWORK_MISMATCH before the request reaches it; the client is released", async () => {
    const { fake, state, methods } = nodeClaiming("testnet-10");
    const s = session(fake, "testnet-10");
    await s.request("getBlockDagInfo");
    state.networkId = "mainnet";
    silentReconnect(fake);
    const e = await failure(s.request("submitTransaction", { transaction: { version: 0, inputs: [], outputs: [], lockTime: "0", subnetworkId: "00".repeat(20), gas: "0", payload: "", storageMass: "0" } }));
    expect(e.code).toBe("NODE_NETWORK_MISMATCH");
    expect(methods()).toEqual(["getServerInfo", "getBlockDagInfo", "getServerInfo"]);
    expect(s.current()).toBeNull();
    expect(fake.connects).toBe(1);
  });

  it("resumed on a node of the same network: verified once, then used normally", async () => {
    const { fake, methods } = nodeClaiming("testnet-10");
    const s = session(fake, "testnet-10");
    await s.request("getBlockDagInfo");
    silentReconnect(fake);
    await s.request("getBlockDagInfo");
    await s.request("getBlockDagInfo");
    expect(methods()).toEqual(["getServerInfo", "getBlockDagInfo", "getServerInfo", "getBlockDagInfo", "getBlockDagInfo"]);
    await s.close();
  });

  it("concurrent requests after a resume share one verification", async () => {
    const { fake, methods } = nodeClaiming("testnet-10");
    const s = session(fake, "testnet-10");
    await s.request("getBlockDagInfo");
    silentReconnect(fake);
    await Promise.all([s.request("getBlockDagInfo"), s.request("getBlockDagInfo")]);
    expect(methods().filter((m) => m === "getServerInfo")).toHaveLength(2);
    await s.close();
  });

  it("without an expected network a resume changes nothing (no identity call)", async () => {
    const { fake, methods } = nodeClaiming("simnet");
    const s = session(fake);
    await s.request("getBlockDagInfo");
    silentReconnect(fake);
    await s.request("getBlockDagInfo");
    expect(methods()).toEqual(["getBlockDagInfo", "getBlockDagInfo"]);
    await s.close();
  });
});

describe("SECURITY-INTEGRATION-1 · the session's messages never carry endpoint credentials", () => {
  const SECRET_URL = "wss://op:si-pw-SECRET@node.example:443/?token=si-tok-SECRET&net=t10";
  const leaked = (e: any) => ["si-pw-SECRET", "si-tok-SECRET"].filter((s) => JSON.stringify({ m: String(e?.message), d: e?.data ?? null }).includes(s));

  it("an identity refusal names the endpoint without userinfo and with secret query parameters redacted", async () => {
    const { fake } = nodeClaiming("mainnet");
    const e = await failure(session(fake, "testnet-10", SECRET_URL).request("getBlockDagInfo"));
    expect(e.code).toBe("NODE_NETWORK_MISMATCH");
    expect(leaked(e)).toEqual([]);
    expect(String(e.message)).toContain("node.example:443/?token=REDACTED&net=t10");
  });

  it("a connection failure (the official client repeats the URL in its own text) carries no credential", async () => {
    const fake = fakeOfficialRpc({}, { connectError: new Error(`wRPC -> WebSocket -> Unable to connect to ${SECRET_URL}`) });
    const e = await failure(session(fake, "testnet-10", SECRET_URL).request("getBlockDagInfo"));
    expect(String(e.message)).toMatch(/Cannot connect to Kaspa RPC/);
    expect(leaked(e)).toEqual([]);
  });

  it("a connection lost under a request carries no credential", async () => {
    const fake = fakeOfficialRpc({
      getServerInfo: () => ({ networkId: "testnet-10" }),
      getBlockDagInfo: () => {
        throw new Error(`WebSocket is not connected (${SECRET_URL})`);
      }
    });
    const e = await failure(session(fake, "testnet-10", SECRET_URL).request("getBlockDagInfo"));
    expect(String(e.message)).toMatch(/was lost/);
    expect(leaked(e)).toEqual([]);
  });
});
// -----------------------------------------------------------------------------
// D1 (review of SECURITY-INTEGRATION-1): concurrent requests right after a resume never skip the new verification; a
// connection that drops while its network is asked is a connection failure (never handed out unverified, never an
// identity verdict); the redacted errors keep their type, code and retriability.
// -----------------------------------------------------------------------------

/** A node whose getServerInfo can be held open (a slow answer) to place events while the question is pending. */
function heldNode(initial: string) {
  const state = { networkId: initial, hold: null as null | { release(): void; promise: Promise<void> } };
  const info = () => ({ rpcApiVersion: 1, serverVersion: "2.1.0", networkId: state.networkId, hasUtxoIndex: true, isSynced: true, virtualDaaScore: 7n });
  const fake = fakeOfficialRpc({
    getServerInfo: () => (state.hold ? state.hold.promise.then(info) : info()),
    getBlockDagInfo: () => ({ virtualDaaScore: 7n, tipHashes: [] }),
    submitTransaction: () => ({ transactionId: "ab".repeat(32) })
  });
  const hold = () => {
    let release!: () => void;
    const promise = new Promise<void>((r) => (release = r));
    state.hold = { release: () => { state.hold = null; release(); }, promise };
    return state.hold;
  };
  return { fake, state, hold, methods: () => fake.calls.map((c) => c.method) };
}
const TX = { transaction: { version: 0, inputs: [], outputs: [], lockTime: "0", subnetworkId: "00".repeat(20), gas: "0", payload: "", storageMass: "0" } };
const tick = () => new Promise((r) => setTimeout(r, 0));

describe("SECURITY-INTEGRATION-1 · D1 concurrency and connection errors around a resume", () => {
  it("five concurrent requests (submitTransaction among them) right after a resume onto a mainnet node: all refused, the node asked once, nothing else reaches it", async () => {
    const { fake, state, methods } = nodeClaiming("testnet-10");
    const s = session(fake, "testnet-10");
    await s.request("getBlockDagInfo");
    state.networkId = "mainnet";
    silentReconnect(fake);
    const results = await Promise.allSettled([
      s.request("getBlockDagInfo"),
      s.request("submitTransaction", TX),
      s.request("getBlockDagInfo"),
      s.request("submitTransaction", TX),
      s.request("getBlockDagInfo")
    ]);
    expect(results.map((r) => (r.status === "rejected" ? (r.reason as any).code : "fulfilled"))).toEqual(Array(5).fill("NODE_NETWORK_MISMATCH"));
    expect(methods()).toEqual(["getServerInfo", "getBlockDagInfo", "getServerInfo"]);
    expect(s.current()).toBeNull();
  });

  it("requests arriving while the re-verification is pending wait for it: none reaches the node before the answer", async () => {
    const { fake, hold, methods } = heldNode("testnet-10");
    const s = session(fake, "testnet-10");
    await s.request("getBlockDagInfo");
    silentReconnect(fake);
    const h = hold();
    const pending = [s.request("getBlockDagInfo"), s.request("submitTransaction", TX)];
    await tick();
    pending.push(s.request("getBlockDagInfo")); // a late arrival joins the same verification
    await tick();
    expect(methods()).toEqual(["getServerInfo", "getBlockDagInfo", "getServerInfo"]);
    h.release();
    await Promise.all(pending);
    expect(methods().slice(3).sort()).toEqual(["getBlockDagInfo", "getBlockDagInfo", "submitTransaction"]);
    expect(methods().filter((m) => m === "getServerInfo")).toHaveLength(2);
    await s.close();
  });

  it("a drop while the re-verification is pending: the answer is not trusted, every waiting request fails as a connection error, nothing reaches the node; the next request verifies a new connection", async () => {
    const { fake, hold, methods } = heldNode("testnet-10");
    const s = session(fake, "testnet-10");
    await s.request("getBlockDagInfo");
    silentReconnect(fake);
    const h = hold();
    const pending = Promise.allSettled([s.request("getBlockDagInfo"), s.request("submitTransaction", TX)]);
    await tick();
    silentReconnect(fake); // the connection drops and resumes again while getServerInfo is unanswered
    h.release();
    const results = await pending;
    for (const r of results) {
      expect(r.status).toBe("rejected");
      const e = (r as PromiseRejectedResult).reason;
      expect(e).toBeInstanceOf(RpcConnectionError);
      expect(String(e.code ?? "")).not.toMatch(/^NODE_NETWORK_/);
    }
    expect(methods()).toEqual(["getServerInfo", "getBlockDagInfo", "getServerInfo"]);
    expect(s.current()).toBeNull();
    await s.request("getBlockDagInfo");
    expect(fake.connects).toBe(2);
    expect(methods().slice(3)).toEqual(["getServerInfo", "getBlockDagInfo"]);
    await s.close();
  });

  it("a drop while the FIRST verification is pending: a connection failure, the connection never handed out", async () => {
    const { fake, hold, methods } = heldNode("testnet-10");
    const s = session(fake, "testnet-10");
    const h = hold();
    const first = s.request("submitTransaction", TX).then(() => null, (e) => e);
    await tick();
    silentReconnect(fake);
    h.release();
    const e = await first;
    expect(e).toBeInstanceOf(RpcConnectionError);
    expect(methods()).toEqual(["getServerInfo"]);
    expect(s.current()).toBeNull();
  });

  it("a connection lost while re-verifying stays a connection failure with the same type and retriability as any other", async () => {
    const state = { lost: false };
    const fake = fakeOfficialRpc({
      getServerInfo: () => {
        if (state.lost) throw new Error("WebSocket is not connected");
        return { networkId: "testnet-10" };
      },
      getBlockDagInfo: () => ({ virtualDaaScore: 7n })
    });
    const s = session(fake, "testnet-10");
    await s.request("getBlockDagInfo");
    state.lost = true;
    silentReconnect(fake);
    const e = await failure(s.request("getBlockDagInfo"));
    const baseline = await failure(session(fakeOfficialRpc({}, { connectError: new Error("Unable to connect") }), "testnet-10").request("getBlockDagInfo"));
    expect(e).toBeInstanceOf(RpcConnectionError);
    expect({ name: e.name, retriable: e.isRetriable }).toEqual({ name: baseline.name, retriable: baseline.isRetriable });
    expect(String(e.code ?? "")).not.toMatch(/^NODE_NETWORK_/);
    expect(s.current()).toBeNull();
  });

  it("redaction keeps the typed errors: identity refusal (code, not retriable, expected/observed, endpoint without credentials) and connection failure (class, retriable)", async () => {
    const SECRET_URL = "wss://op:si-pw-SECRET@node.example:443/?token=si-tok-SECRET";
    const { fake } = nodeClaiming("simnet");
    const id = await failure(session(fake, "testnet-10", SECRET_URL).request("getBlockDagInfo"));
    expect(id).toBeInstanceOf(NodeNetworkIdentityError);
    expect({ code: id.code, retriable: id.isRetriable, expected: id.data?.expected, observed: id.data?.observed }).toEqual({
      code: "NODE_NETWORK_MISMATCH",
      retriable: false,
      expected: "testnet-10",
      observed: "simnet"
    });
    expect(id.data?.endpoint).toBe("wss://node.example:443/?token=REDACTED");
    const conn = await failure(
      session(fakeOfficialRpc({}, { connectError: new Error(`Unable to connect to ${SECRET_URL}`) }), "testnet-10", SECRET_URL).request("getBlockDagInfo")
    );
    expect(conn).toBeInstanceOf(RpcConnectionError);
    expect(conn.isRetriable).toBe(true);
    expect(JSON.stringify({ m: conn.message, i: id.message, d: id.data })).not.toMatch(/si-pw-SECRET|si-tok-SECRET/);
  });
});