import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import {
  JsonWrpcKaspaClient,
  KaspaJsonRpcClient,
  RpcConnectionError,
  RpcError,
  RpcResponseTooLargeError,
  RpcSubmitOutcomeUnknownError,
  SDK_WEBSOCKET_MAX_PAYLOAD_BYTES,
  classifySubmitFailure,
  isRpcResponseTooLargeError
} from "../src/index.js";
import { startUtxoHeavyWrpcNode, type UtxoHeavyNode } from "./helpers/fake-utxo-heavy-wrpc-node.js";

vi.setConfig({ testTimeout: 60_000, hookTimeout: 30_000 });

// -----------------------------------------------------------------------------
// RPC-RESPONSE-TOO-LARGE-1 (diagnosed 21-oct-2026, LFU; measured on loopback: 276,400 UTXOs read, 278,400 failed): the
// SDK's socket is `ws`, whose message limit is 100 MiB (kaspa-wasm's request for 1 GiB never reaches it). A node answer
// above it — getUtxosByAddresses for an address holding more than about 277,000 UTXOs — is refused at its header, the
// socket closes with 1009, and kaspa-wasm rejects the request with "RPC Server (remote error) -> WebSocket disconnected".
// That reached every caller as a codeless, RETRIABLE RpcError, which the CLI prints as UNKNOWN_ERROR. Now: a typed,
// never-retried RPC_RESPONSE_TOO_LARGE naming the limit, the node's health and the remedy; a plain disconnect is a
// connection failure (RPC_CONNECTION_FAILED). The REAL official client (kaspa-wasm 2.1.0) and the real HardKAS session
// against a loopback fake node; the answers are padded with JSON whitespace, so no 277,000 entries are built or parsed.
// -----------------------------------------------------------------------------

const BIG = "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn";
const AT_LIMIT = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const DROPS = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const MiB = 1024 * 1024;

let node: UtxoHeavyNode;

beforeAll(async () => {
  node = await startUtxoHeavyWrpcNode({
    replies: {
      [BIG]: { kind: "bytes", size: 100 * MiB + 1 },
      [AT_LIMIT]: { kind: "bytes", size: 100 * MiB },
      [DROPS]: { kind: "drop" }
    },
    balances: { [BIG]: 1_391_000_000_000_000n }
  });
});
afterAll(async () => {
  await node?.close();
});

async function failureOf(p: Promise<unknown>): Promise<any> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("the call did not fail");
}

describe("RPC-RESPONSE-TOO-LARGE-1 · the transport's message limit is explicit and its refusal is typed", () => {
  it("TL-1 the limit is a named constant: 100 MiB, never kaspa-wasm's 1 GiB", () => {
    expect(SDK_WEBSOCKET_MAX_PAYLOAD_BYTES).toBe(104_857_600);
  });

  it("TL-2 one byte over the limit: RPC_RESPONSE_TOO_LARGE, not retriable, naming the limit, the node's health and the remedy; the client goes on", async () => {
    const client = new JsonWrpcKaspaClient({ rpcUrl: node.url, timeoutMs: 20_000, expectedNetworkId: "simnet" });
    try {
      const started = Date.now();
      const e = await failureOf(client.getUtxosByAddress(BIG));
      const elapsed = Date.now() - started;
      expect({ code: e?.code, isRetriable: e?.isRetriable }, String(e?.message)).toEqual({ code: "RPC_RESPONSE_TOO_LARGE", isRetriable: false });
      expect(e).toBeInstanceOf(RpcResponseTooLargeError);
      expect(e).toBeInstanceOf(RpcError);
      expect(isRpcResponseTooLargeError(e)).toBe(true);
      expect(e.message).toMatch(/^RPC_RESPONSE_TOO_LARGE: /);
      expect(e.message).toContain("getUtxosByAddresses");
      expect(e.message).toContain("100 MiB");
      expect(e.message).toMatch(/277,000/);
      expect(e.message).toMatch(/The node is fine/);
      expect(e.message).toMatch(/Use another address/);
      expect(e.message).toMatch(/paginated UTXO reads/);
      expect(e.suggestion).toMatch(/Use another address/);
      expect(e.data).toMatchObject({ method: "getUtxosByAddresses", maxPayloadBytes: 104_857_600 });
      // the words other layers read as "node down" are not in it
      expect(e.message).not.toMatch(/timed out|timeout|connection (refused|lost|closed)|not connected|WebSocket|connection error/i);
      // refused at the frame header: fast, never a read of the whole answer
      expect(elapsed).toBeLessThan(15_000);
      // the client refused it (1009); the node saw that close
      await new Promise((r) => setTimeout(r, 200));
      expect(node.closeCodes).toContain(1009);
      // the session dropped that connection and opens a new one: the same client still answers
      const balance = await client.getBalanceByAddress(BIG);
      expect(balance.balanceSompi).toBe(1_391_000_000_000_000n);
    } finally {
      await client.close();
    }
  });

  it("TL-3 an answer of exactly the limit is read (the limit is inclusive and nothing below it changed)", async () => {
    const client = new JsonWrpcKaspaClient({ rpcUrl: node.url, timeoutMs: 20_000, expectedNetworkId: "simnet" });
    try {
      const utxos = await client.getUtxosByAddress(AT_LIMIT);
      expect(utxos).toHaveLength(1);
      expect(utxos[0]!.address).toBe(AT_LIMIT);
      expect(utxos[0]!.amountSompi).toBe(5_000_000_000n);
    } finally {
      await client.close();
    }
  });

  it("TL-4 a connection cut with a request pending (no size refusal): RPC_CONNECTION_FAILED, never the size code, never codeless", async () => {
    const client = new JsonWrpcKaspaClient({ rpcUrl: node.url, timeoutMs: 20_000, expectedNetworkId: "simnet" });
    try {
      const e = await failureOf(client.getUtxosByAddress(DROPS));
      expect({ code: e?.code, name: e?.name }, String(e?.message)).toEqual({ code: "RPC_CONNECTION_FAILED", name: "RpcConnectionError" });
      expect(e).toBeInstanceOf(RpcConnectionError);
      expect(isRpcResponseTooLargeError(e)).toBe(false);
      expect(e.message).toMatch(/was lost/);
    } finally {
      await client.close();
    }
  });

  it("TL-5 the retrying client (KaspaJsonRpcClient) asks once: the refusal is never retried", async () => {
    const before = node.utxoReads(BIG);
    const client = new KaspaJsonRpcClient({ url: node.url, timeoutMs: 20_000, expectedNetworkId: "simnet" });
    try {
      const e = await failureOf(client.getUtxosByAddress(BIG));
      expect(e?.code, String(e?.message)).toBe("RPC_RESPONSE_TOO_LARGE");
      expect(node.utxoReads(BIG) - before).toBe(1);
    } finally {
      await client.close();
    }
  });

  it("TL-6 a broadcast whose answer is refused for its size has an UNKNOWN outcome (never a node rejection)", () => {
    const txId = "ef".repeat(32);
    const classified = classifySubmitFailure(new RpcResponseTooLargeError({ method: "submitTransaction", endpoint: "ws://127.0.0.1:1" }), txId);
    expect(classified).toBeInstanceOf(RpcSubmitOutcomeUnknownError);
    expect((classified as RpcSubmitOutcomeUnknownError).txId).toBe(txId);
  });
});
