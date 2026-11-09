import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { CANONICAL_NODE_EXPECTATION } from "@hardkas/core";
import { createKaspaSimulator, SOMPI_PER_KAS } from "../src/simulator-node.js";
import { SimulatorRpcServer } from "../src/rpc/rpc-server.js";
import { SIMULATOR_SERVER_VERSION } from "../src/rpc/simulator-rpc.js";
import { managedKaspaWasm } from "./helpers/managed-wasm.js";

// HK-06: the managed kaspa-wasm (HARDKAS_HOME), never an absolute path of one machine
const { k: kaspaWasm, reason: noWasm } = managedKaspaWasm();

describe("SimulatorRpcServer (wRPC & JSON-RPC)", () => {
  let sim: ReturnType<typeof createKaspaSimulator>;
  let server: SimulatorRpcServer;
  let wsUrl: string;
  let httpUrl: string;

  beforeAll(async () => {
    sim = createKaspaSimulator({ networkId: "simnet", automine: true, bootstrapDevAccounts: true });
    server = new SimulatorRpcServer(sim);
    const info = await server.start({ port: 0, host: "127.0.0.1" });
    wsUrl = info.wsUrl;
    httpUrl = info.url;
  });

  afterAll(async () => {
    await server.close();
  });

  it("responds to HTTP GET /health and /info", async () => {
    const res = await fetch(`${httpUrl}/health`);
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.status).toBe("healthy");
    expect(data.serverVersion).toContain("2.1.0");
  });

  it("responds to HTTP POST JSON-RPC 2.0 requests", async () => {
    const res = await fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 101,
        method: "getBlockDagInfo",
        params: {}
      })
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.jsonrpc).toBe("2.0");
    expect(json.id).toBe(101);
    expect(json.result.networkId).toBe("simnet");
    expect(json.result.tipHashes.length).toBeGreaterThan(0);
  });

  it("supports dev methods over HTTP JSON-RPC (kaspasim_mine, snapshot, revert)", async () => {
    const devAccsRes = await fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "kaspasim_getDevAccounts"
      })
    });
    const devAccs = (await devAccsRes.json()).result.accounts;
    expect(devAccs.length).toBeGreaterThanOrEqual(5);

    // Snapshot
    const snapRes = await fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "kaspasim_snapshot" })
    });
    const snapId = (await snapRes.json()).result.snapshotId;

    // Mine 3 blocks
    const mineRes = await fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 3, method: "kaspasim_mine", params: { blocks: 3 } })
    });
    expect((await mineRes.json()).result.blocksMined).toBe(3);

    // Revert
    const revertRes = await fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 4, method: "kaspasim_revert", params: { snapshotId: snapId } })
    });
    expect((await revertRes.json()).result.reverted).toBe(true);
  });

  it("SIM-16: a browser origin is refused before any method runs (no CORS *), and nothing is minted", async () => {
    const bob = sim.accounts.bob;
    const before = sim.ledger.getBalance(bob.address);
    const res = await fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "text/plain", Origin: "https://evil.example" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 9, method: "kaspasim_fund", params: { address: bob.address, amountSompi: "100000000" } })
    });
    expect(res.status).toBe(403);
    expect(res.headers.get("access-control-allow-origin")).toBeNull();
    expect((await res.json()).error.message).toMatch(/SIMULATOR_ORIGIN_REFUSED/);
    expect(sim.ledger.getBalance(bob.address)).toBe(before);

    const ws = new WebSocket(wsUrl, { headers: { Origin: "https://evil.example" } });
    const outcome = await new Promise<string>((resolve) => {
      ws.on("open", () => resolve("open"));
      ws.on("error", () => resolve("refused"));
      ws.on("unexpected-response", () => resolve("refused"));
    });
    expect(outcome).toBe("refused");
    ws.terminate();
  });

  it("SIM-16: bigints are written exactly (no Number precision loss)", async () => {
    const res = await fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 10, method: "getCoinSupply" })
    });
    const text = await res.text();
    expect(text).toContain('"maxSompi":2900000000000000000');
  });

  it("SIM-13: an unknown method and an unknown block are errors, not null", async () => {
    const call = async (method: string, params?: unknown) =>
      (await fetch(httpUrl, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 11, method, params }) })).json();
    expect((await call("getNoSuchThing")).error.message).toMatch(/SIMULATOR_RPC_METHOD_UNSUPPORTED/);
    expect((await call("getBlock", { hash: "ab".repeat(32) })).error.message).toMatch(/SIMULATOR_BLOCK_NOT_FOUND/);
    expect((await call("submitTransactionReplacement", { transaction: {} })).error.message).toMatch(/SIMULATOR_RBF_UNSUPPORTED/);
  });

  it("CA-TX-07: getFeeEstimate has only the node's shape, at the minimum relay feerate", async () => {
    const res = await fetch(httpUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 12, method: "getFeeEstimate" })
    });
    const { result } = await res.json();
    expect(Object.keys(result)).toEqual(["estimate"]);
    expect(Object.keys(result.estimate).sort()).toEqual(["lowBuckets", "normalBuckets", "priorityBucket"]);
    expect(result.estimate.priorityBucket.feerate).toBe(100);
    expect(result.estimate.priorityBucket).not.toHaveProperty("feeRate");
  });

  it("handles wRPC WebSocket requests and subscriptions", async () => {
    const ws = new WebSocket(wsUrl);
    await new Promise<void>((resolve, reject) => {
      ws.on("open", () => resolve());
      ws.on("error", reject);
    });

    const sendAndReceive = (msg: object): Promise<any> => {
      return new Promise((resolve) => {
        const handler = (data: WebSocket.Data) => {
          const parsed = JSON.parse(String(data));
          if (parsed.id === (msg as any).id) {
            ws.off("message", handler);
            resolve(parsed);
          }
        };
        ws.on("message", handler);
        ws.send(JSON.stringify(msg));
      });
    };

    // 1. getServerInfo
    const serverInfoResp = await sendAndReceive({
      id: "req-1",
      method: "getServerInfo",
      params: {}
    });
    expect(serverInfoResp.id).toBe("req-1");
    expect(serverInfoResp.params.networkId).toBe("simnet");
    // CA-EV-09 / HK-01: the simulator names itself; it never reports the canonical rusty-kaspad version
    expect(serverInfoResp.params.serverVersion).toBe(SIMULATOR_SERVER_VERSION);
    expect(serverInfoResp.params.serverVersion).not.toBe(CANONICAL_NODE_EXPECTATION.serverVersion);

    // 2. getUtxosByAddresses
    const alice = sim.accounts.alice;
    const utxoResp = await sendAndReceive({
      id: "req-2",
      method: "getUtxosByAddresses",
      params: { addresses: [alice.address] }
    });
    expect(utxoResp.id).toBe("req-2");
    expect(utxoResp.params.entries.length).toBeGreaterThan(0);
    expect(utxoResp.params.entries[0].utxoEntry).toBeDefined();

    // 3. Test Subscription to DAA score changes
    let receivedDaaNotification = false;
    const notificationPromise = new Promise<void>((resolve) => {
      ws.on("message", (data) => {
        const parsed = JSON.parse(String(data));
        if (parsed.method === "notifyVirtualDaaScoreChanged") {
          receivedDaaNotification = true;
          resolve();
        }
      });
    });

    await sendAndReceive({
      id: "req-sub",
      method: "notifyVirtualDaaScoreChanged",
      params: {}
    });

    // Mine a block to trigger DAA change notification
    sim.mine(1);
    await notificationPromise;
    expect(receivedDaaNotification).toBe(true);

    ws.close();
  });

  it.skipIf(!kaspaWasm)(`interoperates with the official kaspa-wasm RpcClient over wRPC WebSocket${noWasm ? ` (skipped: ${noWasm})` : ""}`, async () => {

    // Set ws.WebSocket as the global WebSocket for kaspa-wasm compatibility
    (globalThis as any).WebSocket = WebSocket;

    const rpc = new kaspaWasm.RpcClient({
      url: wsUrl,
      encoding: kaspaWasm.Encoding.SerdeJson
    });

    await rpc.connect({ blockAsyncConnect: true });
    expect(rpc.isConnected).toBe(true);

    // 1. Call getServerInfo
    const serverInfo = await rpc.getServerInfo();
    expect(serverInfo.serverVersion).toBe(SIMULATOR_SERVER_VERSION);
    expect(serverInfo.serverVersion).not.toBe(CANONICAL_NODE_EXPECTATION.serverVersion);
    expect(serverInfo.networkId).toBe("simnet");

    // 2. Call getBlockDagInfo
    const dagInfo = await rpc.getBlockDagInfo();
    expect(dagInfo.network).toBe("simnet");

    // 3. Call getUtxosByAddresses
    const alice = sim.accounts.alice;
    const bob = sim.accounts.bob;
    const utxos = await rpc.getUtxosByAddresses({ addresses: [alice.address] });
    expect(utxos.entries.length).toBeGreaterThan(0);

    // 4. Create, sign, and submit real transaction using kaspa-wasm SDK!
    const sendAmount = 10n * SOMPI_PER_KAS;
    const changeAmount = 89n * SOMPI_PER_KAS; // Alice started with 100 KAS, fee = 1 KAS
    const entry = utxos.entries[0];

    const tx = kaspaWasm.createTransaction(
      [
        {
          address: alice.address,
          outpoint: entry.outpoint,
          amount: BigInt(entry.amount),
          scriptPublicKey: kaspaWasm.payToAddressScript(alice.address),
          blockDaaScore: BigInt(entry.blockDaaScore),
          isCoinbase: Boolean(entry.isCoinbase)
        }
      ],
      [
        { address: bob.address, amount: sendAmount },
        { address: alice.address, amount: changeAmount }
      ],
      0n,
      "",
      1
    );

    const signedTx = kaspaWasm.signTransaction(tx, [new kaspaWasm.PrivateKey(alice.privateKey)], true);
    const submitResult = await rpc.submitTransaction({ transaction: signedTx });
    expect(submitResult.transactionId).toBeDefined();
    expect(typeof submitResult.transactionId).toBe("string");

    // 5. Verify Bob now has received the 10 KAS transfer!
    const bobUtxos = await rpc.getUtxosByAddresses({ addresses: [bob.address] });
    expect(bobUtxos.entries.length).toBeGreaterThan(0);
    const received = bobUtxos.entries.find((e: any) => BigInt(e.amount) === sendAmount);
    expect(received).toBeDefined();
    expect(BigInt(received.amount)).toBe(sendAmount);

    await rpc.disconnect();
  });
});
