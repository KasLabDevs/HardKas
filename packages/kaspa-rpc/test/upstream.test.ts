import { describe, it, expect, vi } from "vitest";
import { createRequire } from "node:module";
import { OfficialRpcSession, officialMethodName, toWrpcUrl, nodeMessage } from "../src/upstream/session.js";
import { toWire, toOfficialTransaction, u64FieldsToBigint } from "../src/upstream/wire.js";
import { JsonWrpcKaspaClient, RpcConnectionError, RpcNotFoundError, RpcTimeoutError } from "../src/index.js";
import { fakeOfficialRpc } from "./helpers/fake-official-rpc.js";

// Stand-ins for the SDK's wasm-bindgen classes: what matters is the class name and the `__wbg_ptr` handle.
class Address {
  __wbg_ptr = 1;
  constructor(private readonly text: string) {}
  toString() {
    return this.text;
  }
}
class Hash {
  __wbg_ptr = 2;
  constructor(private readonly hex: string) {}
  toString() {
    return this.hex;
  }
}
class ScriptPublicKey {
  __wbg_ptr = 3;
  constructor(readonly version: number, readonly script: string) {}
}
class UtxoEntryReference {
  __wbg_ptr = 4;
  constructor(private readonly covenant?: Hash) {}
  get address() {
    return new Address("kaspasim:qexample");
  }
  get outpoint() {
    return { transactionId: "ab".repeat(32), index: 3 };
  }
  get amount() {
    return 5_000_000_000n;
  }
  get scriptPublicKey() {
    return new ScriptPublicKey(0, "20aa");
  }
  get blockDaaScore() {
    return 1538n;
  }
  get isCoinbase() {
    return true;
  }
  get entry() {
    return { covenantId: this.covenant };
  }
}
class OptionalHeader {
  __wbg_ptr = 5;
  toJSON() {
    return { hash: "cc".repeat(32), blueScore: 9n };
  }
}

describe("upstream session: names and URLs", () => {
  it("maps HardKAS URLs to the node's WebSocket endpoint", () => {
    expect(toWrpcUrl("http://127.0.0.1:18210")).toBe("ws://127.0.0.1:18210");
    expect(toWrpcUrl("https://node.example:443")).toBe("wss://node.example:443");
    expect(toWrpcUrl("ws://127.0.0.1:18210")).toBe("ws://127.0.0.1:18210");
    expect(toWrpcUrl("127.0.0.1:18210")).toBe("ws://127.0.0.1:18210");
  });

  it("names official methods from HardKAS method names", () => {
    expect(officialMethodName("getBlockDagInfoRequest")).toBe("getBlockDagInfo");
    expect(officialMethodName("getBlockDagInfo")).toBe("getBlockDagInfo");
    expect(officialMethodName("getVirtualSelectedParentBlueScoreRequest")).toBe("getSinkBlueScore");
    expect(officialMethodName("getBlockHeaders")).toBe("getHeaders");
  });

  it("keeps the node's own text from an official remote error", () => {
    expect(nodeMessage("RPC Server (remote error) -> code:0  message:`Transaction x not found` data:None")).toBe("Transaction x not found");
    expect(nodeMessage("wRPC -> WebSocket -> Unable to connect")).toBe("wRPC -> WebSocket -> Unable to connect");
  });
});

describe("upstream wire: official values → the node's JSON shape", () => {
  it("writes u64 values as numbers, and as strings above Number.MAX_SAFE_INTEGER", () => {
    expect(toWire({ a: 5n, b: 10685671755453539746n, c: 1.5, d: "x" })).toEqual({ a: 5, b: "10685671755453539746", c: 1.5, d: "x" });
  });

  it("nests a UTXO entry reference under utxoEntry, with a versioned hex script", () => {
    expect(toWire({ entries: [new UtxoEntryReference(new Hash("ee".repeat(32)))] })).toEqual({
      entries: [
        {
          address: "kaspasim:qexample",
          outpoint: { transactionId: "ab".repeat(32), index: 3 },
          utxoEntry: {
            amount: 5_000_000_000,
            scriptPublicKey: "000020aa",
            blockDaaScore: 1538,
            isCoinbase: true,
            covenantId: "ee".repeat(32)
          }
        }
      ]
    });
    expect((toWire(new UtxoEntryReference()) as any).utxoEntry).not.toHaveProperty("covenantId");
  });

  it("reads other SDK objects through toJSON, and never leaks a wasm handle", () => {
    const out = toWire({ header: new OptionalHeader(), address: new Address("kaspa:q1"), spk: new ScriptPublicKey(1, "51") });
    expect(out).toEqual({ header: { hash: "cc".repeat(32), blueScore: 9 }, address: "kaspa:q1", spk: "000151" });
    expect(JSON.stringify(out)).not.toContain("__wbg_ptr");
  });

  it("restores the u64 fields of a block so a template can be submitted back", () => {
    const template = {
      header: { version: 2, bits: 545259519, timestamp: 1790632938760n, nonce: 10685671755453539746n, daaScore: 5146n, blueScore: 3892n, hashMerkleRoot: "aa" },
      transactions: [{ version: 1, outputs: [{ value: 5_000_000_000n, scriptPublicKey: "000020aa" }], lockTime: 0n, gas: 0n, mass: 0n }]
    };
    const back = u64FieldsToBigint(toWire(template)) as any;
    expect(back.header).toEqual({ version: 2, bits: 545259519, timestamp: 1790632938760n, nonce: 10685671755453539746n, daaScore: 5146n, blueScore: 3892n, hashMerkleRoot: "aa" });
    expect(back.transactions[0]).toEqual(template.transactions[0]);
  });
});

describe("upstream wire: a HardKAS transaction → the official ITransaction", () => {
  const wire = {
    version: 1,
    inputs: [{ previousOutpoint: { transactionId: "ab".repeat(32), index: "2" }, signatureScript: "41", sequence: "0", computeBudget: 10 }],
    outputs: [
      { amount: "1000", scriptPublicKey: { version: 0, scriptPublicKey: "20aa" }, covenant: { authorizingInput: 0, covenantId: "ee".repeat(32) } },
      { value: 5, scriptPublicKey: "000051" }
    ],
    lockTime: 0,
    subnetworkId: "0000000000000000000000000000000000000000",
    gas: 0,
    payload: "",
    storageMass: 1234
  };

  it("converts the broadcast payload (a JSON string, wrapped or not)", () => {
    for (const input of [JSON.stringify(wire), { tx: wire }, JSON.stringify({ inner: wire })]) {
      expect(toOfficialTransaction(input)).toEqual({
        version: 1,
        inputs: [{ previousOutpoint: { transactionId: "ab".repeat(32), index: 2 }, signatureScript: "41", sequence: 0n, sigOpCount: 0, computeBudget: 10 }],
        outputs: [
          { value: 1000n, scriptPublicKey: "000020aa", covenant: { authorizingInput: 0, covenantId: "ee".repeat(32) } },
          { value: 5n, scriptPublicKey: "000051" }
        ],
        lockTime: 0n,
        subnetworkId: "0000000000000000000000000000000000000000",
        gas: 0n,
        payload: "",
        storageMass: 1234n
      });
    }
  });

  it("is idempotent, defaults a v0 input to one sig op, and passes SDK transactions through", () => {
    const once = toOfficialTransaction(wire);
    expect(toOfficialTransaction(once)).toEqual(once);
    const v0 = toOfficialTransaction({ ...wire, version: 0, inputs: [{ previousOutpoint: { transactionId: "ab".repeat(32), index: 0 }, signatureScript: "", sequence: 0 }] }) as any;
    expect(v0.inputs[0].sigOpCount).toBe(1);
    const sdkTx = { __wbg_ptr: 9 };
    expect(toOfficialTransaction(sdkTx)).toBe(sdkTx);
  });

  it("refuses what the node would refuse, before sending", () => {
    const noMass: Record<string, unknown> = { ...wire };
    delete noMass.storageMass;
    expect(() => toOfficialTransaction(noMass)).toThrow(expect.objectContaining({ code: "RPC_STORAGE_MASS_MISSING" }));
    expect(() => toOfficialTransaction({ ...wire, mass: 1 })).toThrow(expect.objectContaining({ code: "RPC_STORAGE_MASS_CONFLICT" }));
    expect(() => toOfficialTransaction("abcd")).toThrow(expect.objectContaining({ code: "RPC_TRANSACTION_INVALID" }));
  });
});

describe("upstream session: connection, errors and timeouts", () => {
  it("an unreachable node is a typed connection error naming the endpoint", async () => {
    const rpc = fakeOfficialRpc({}, { connectError: "wRPC -> WebSocket -> Unable to connect to ws://127.0.0.1:1" });
    const session = new OfficialRpcSession("ws://127.0.0.1:1", 1000, rpc.factory);
    const err = await session.request("getServerInfo").catch((e) => e);
    expect(err).toBeInstanceOf(RpcConnectionError);
    expect(err.message).toContain("Cannot connect to Kaspa RPC at ws://127.0.0.1:1");
    expect(err.message).toContain("Unable to connect");
  });

  it("a connection that never opens times out as a connection error", async () => {
    const rpc = fakeOfficialRpc({});
    const hanging = (url: string) => Object.assign(rpc.factory(url), { connect: () => new Promise<void>(() => {}) });
    const session = new OfficialRpcSession("ws://127.0.0.1:18210", 20, hanging);
    await expect(session.request("getServerInfo")).rejects.toThrow("Connection timed out");
  });

  it("a request that never answers times out as RpcTimeoutError", async () => {
    const rpc = fakeOfficialRpc({ getServerInfo: () => new Promise(() => {}) });
    const session = new OfficialRpcSession("ws://127.0.0.1:18210", 1000, rpc.factory);
    await expect(session.request("getServerInfo", {}, 20)).rejects.toBeInstanceOf(RpcTimeoutError);
  });

  it("a lost connection is a connection error, and the next call reconnects", async () => {
    let calls = 0;
    const rpc = fakeOfficialRpc({
      getServerInfo: () => {
        calls++;
        if (calls === 1) throw new Error("RPC Server (remote error) -> WebSocket -> WebSocket is not connected");
        return { serverVersion: "2.1.0" };
      }
    });
    const session = new OfficialRpcSession("ws://127.0.0.1:18210", 1000, rpc.factory);
    await expect(session.request("getServerInfo")).rejects.toBeInstanceOf(RpcConnectionError);
    expect(await session.request("getServerInfo")).toEqual({ serverVersion: "2.1.0" });
    expect(rpc.urls).toHaveLength(2);
  });

  it("a method the node does not serve is RpcNotFoundError, without a call", async () => {
    const rpc = fakeOfficialRpc({});
    const session = new OfficialRpcSession("ws://127.0.0.1:18210", 1000, rpc.factory);
    await expect(session.request("getTransactionRequest", { transactionId: "x" })).rejects.toBeInstanceOf(RpcNotFoundError);
    expect(rpc.calls).toEqual([]);
  });

  it("submitBlock through call() receives the template's u64 fields as bigint", async () => {
    const rpc = fakeOfficialRpc({ submitBlock: () => ({ report: { type: "success" } }) });
    const client = new JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:18210", rpcFactory: rpc.factory });
    await client.call("submitBlockRequest", { block: { header: { nonce: "10685671755453539746", timestamp: 1790632938760, bits: 1 } }, allowNonDAABlocks: false });
    expect(rpc.calls[0]).toEqual({
      method: "submitBlock",
      request: { block: { header: { nonce: 10685671755453539746n, timestamp: 1790632938760n, bits: 1 } }, allowNonDAABlocks: false }
    });
  });
});

describe("Node/Windows compatibility: the SDK's WebSocket (node-websocket-compat.ts)", () => {
  it("officialRpcFactory gives the SDK the `ws` WebSocket when the global is still Node's", async () => {
    const original = (globalThis as any).WebSocket;
    vi.resetModules();
    try {
      const fresh = await import("../src/upstream/session.js");
      fresh.officialRpcFactory("ws://127.0.0.1:1");
      expect((globalThis as any).WebSocket).toBe(createRequire(import.meta.url)("ws").WebSocket);
    } finally {
      (globalThis as any).WebSocket = original;
    }
  });

  it("leaves a WebSocket the host installed after HardKAS loaded", async () => {
    const original = (globalThis as any).WebSocket;
    vi.resetModules();
    try {
      const compat = await import("../src/upstream/node-websocket-compat.js");
      class HostWebSocket {}
      (globalThis as any).WebSocket = HostWebSocket;
      compat.useWsWebSocketForSdk();
      expect((globalThis as any).WebSocket).toBe(HostWebSocket);
    } finally {
      (globalThis as any).WebSocket = original;
    }
  });

  it("applies once per process", async () => {
    const original = (globalThis as any).WebSocket;
    vi.resetModules();
    try {
      const compat = await import("../src/upstream/node-websocket-compat.js");
      compat.useWsWebSocketForSdk();
      const ws = (globalThis as any).WebSocket;
      class Later {}
      (globalThis as any).WebSocket = Later;
      compat.useWsWebSocketForSdk();
      expect(ws).toBe(createRequire(import.meta.url)("ws").WebSocket);
      expect((globalThis as any).WebSocket).toBe(Later);
    } finally {
      (globalThis as any).WebSocket = original;
    }
  });
});
