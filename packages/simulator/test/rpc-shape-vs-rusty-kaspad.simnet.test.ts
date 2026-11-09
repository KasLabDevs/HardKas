import { describe, it, expect, beforeAll, afterAll } from "vitest";
import WebSocket from "ws";
import { createKaspaSimulator } from "../src/simulator-node.js";
import { SimulatorRpcServer } from "../src/rpc/rpc-server.js";
import { SIMULATOR_SERVER_VERSION } from "../src/rpc/simulator-rpc.js";
import { SimnetNodeHarness, type SimnetNodeHandle } from "../../testing/src/simnet-node-harness.js";
import { loadManagedKaspaWasmSync } from "@hardkas/core";

/*
 * RPC RESPONSE SHAPE: the simulator's wRPC answers compared with a real rusty-kaspad's, method by method, by KEYS AND
 * TYPES ONLY. Nothing here compares consensus behaviour (acceptance, rejection, scripts, masses): that is the job of the
 * vector suites run against a node. Simnet level: the harness starts its own rusty-kaspad (pinned image, its own port);
 * a missing node or toolchain FAILS the suite (HK-06 / CA-EV-02 / SIM-11, audit 6-nov-2026: the former
 * `differential-rusty-kaspad.test.ts` ran in the canonical gate, returned before any assertion without a node or
 * kaspa-wasm, attached to whatever listened on 18210, and silently disabled itself when that was the simulator).
 */

describe("RPC response shape: kaspa-simulator vs rusty-kaspad (keys and types only)", () => {
  let k: any;
  let node: SimnetNodeHandle;
  let sim: ReturnType<typeof createKaspaSimulator>;
  let simServer: SimulatorRpcServer;
  let rustyRpc: any;
  let simRpc: any;

  const sampleAddress = "kaspasim:qp8n2k7uklxq4aegau7vawtptkgxsja4kt99lpv6krctwpq8tpc656wlktmzx";

  beforeAll(async () => {
    // fail closed: the toolchain and the node are requirements of this level, never reasons to pass empty
    k = loadManagedKaspaWasmSync();
    (globalThis as any).WebSocket = WebSocket;

    node = await SimnetNodeHarness.start({ utxoIndex: true });
    await node.waitUntilReady();
    if (node.identity && !node.identity.verified) throw new Error("NODE_IDENTITY_UNVERIFIED: the harness node did not prove its identity");

    sim = createKaspaSimulator({ networkId: "simnet", automine: true, bootstrapDevAccounts: true });
    simServer = new SimulatorRpcServer(sim);
    const info = await simServer.start({ port: 0, host: "127.0.0.1" });

    rustyRpc = new k.RpcClient({ url: node.rpcUrl, encoding: k.Encoding.SerdeJson });
    await rustyRpc.connect({ blockAsyncConnect: true });
    simRpc = new k.RpcClient({ url: info.wsUrl, encoding: k.Encoding.SerdeJson });
    await simRpc.connect({ blockAsyncConnect: true });

    const rustyInfo = await rustyRpc.getServerInfo();
    if (String(rustyInfo.serverVersion).includes("simulator")) throw new Error("the reference node is a simulator");
  });

  afterAll(async () => {
    await simRpc?.disconnect().catch(() => {});
    await rustyRpc?.disconnect().catch(() => {});
    await simServer?.close();
    sim?.close();
    await node?.kill();
  });

  const both = async (method: string, params: any) => [await rustyRpc[method](params), await simRpc[method](params)] as const;
  const sameKeys = (a: any, b: any) => expect(Object.keys(b).sort()).toEqual(Object.keys(a).sort());

  it("getServerInfo: same keys; the simulator names itself", async () => {
    const [rusty, s] = await both("getServerInfo", {});
    sameKeys(rusty, s);
    expect(s.networkId).toBe(rusty.networkId);
    expect(s.rpcApiVersion).toBe(rusty.rpcApiVersion);
    expect(s.serverVersion).toBe(SIMULATOR_SERVER_VERSION);
    expect(s.serverVersion).not.toBe(rusty.serverVersion);
  });

  it("getBlockDagInfo: same keys", async () => {
    const [rusty, s] = await both("getBlockDagInfo", {});
    sameKeys(rusty, s);
    expect(s.network).toBe(rusty.network);
  });

  it("getCoinSupply: same keys and max supply", async () => {
    const [rusty, s] = await both("getCoinSupply", {});
    sameKeys(rusty, s);
    expect(BigInt(s.maxSompi)).toBe(BigInt(rusty.maxSompi));
  });

  it("getCurrentNetwork: same keys and network", async () => {
    const [rusty, s] = await both("getCurrentNetwork", {});
    sameKeys(rusty, s);
    expect(s.network).toBe(rusty.network);
  });

  it("getFeeEstimate: the node's shape only (CA-TX-07)", async () => {
    const [rusty, s] = await both("getFeeEstimate", {});
    sameKeys(rusty, s);
    sameKeys(rusty.estimate, s.estimate);
    expect(typeof s.estimate.priorityBucket.feerate).toBe("number");
  });

  it("getInfo: same keys", async () => {
    const [rusty, s] = await both("getInfo", {});
    sameKeys(rusty, s);
  });

  it("getSink / getSinkBlueScore / getSyncStatus / getBlockCount: same keys", async () => {
    for (const method of ["getSink", "getSinkBlueScore", "getSyncStatus", "getBlockCount"]) {
      const [rusty, s] = await both(method, {});
      sameKeys(rusty, s);
    }
  });

  it("getUtxosByAddresses / getBalanceByAddress / getBalancesByAddresses: same shapes", async () => {
    const [ru, su] = await both("getUtxosByAddresses", { addresses: [sampleAddress] });
    expect(Array.isArray(ru.entries) && Array.isArray(su.entries)).toBe(true);
    const [rb, sb] = await both("getBalanceByAddress", { address: sampleAddress });
    sameKeys(rb, sb);
    const [rbs, sbs] = await both("getBalancesByAddresses", { addresses: [sampleAddress] });
    expect(sbs.entries[0].address).toBe(rbs.entries[0].address);
  });

  it("getBlock (the sink): same keys", async () => {
    const rustyDag = await rustyRpc.getBlockDagInfo();
    const simDag = await simRpc.getBlockDagInfo();
    const r = await rustyRpc.getBlock({ hash: rustyDag.sink, includeTransactions: true });
    const s = await simRpc.getBlock({ hash: simDag.sink, includeTransactions: true });
    sameKeys(r, s);
  });

  it("an unknown block is an error on both (SIM-13)", async () => {
    const hash = "ab".repeat(32);
    await expect(rustyRpc.getBlock({ hash, includeTransactions: false })).rejects.toThrow();
    await expect(simRpc.getBlock({ hash, includeTransactions: false })).rejects.toThrow();
  });
});
