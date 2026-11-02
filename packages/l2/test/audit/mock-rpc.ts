// L2 AUDIT (30-oct-2026) — local mock JSON-RPC server + external-network guard.
// Binds only to 127.0.0.1. Never forwards anything anywhere.
import http from "node:http";
import type { AddressInfo } from "node:net";

export type MockReply =
  | { result: unknown }
  | { error: { code: number; message: string } }
  | { raw: string; status?: number }
  | { destroy: true }
  | { delayMs: number; then: MockReply }
  | { idOverride: unknown; result: unknown };

export type MockHandler = (params: any[], call: number) => MockReply | undefined;

export interface MockRpc {
  readonly url: string;
  readonly calls: { method: string; params: any[] }[];
  set(method: string, handler: MockHandler): void;
  methods(): string[];
  close(): Promise<void>;
}

export async function startMockRpc(
  chainId: number,
  handlers: Record<string, MockHandler> = {}
): Promise<MockRpc> {
  const calls: { method: string; params: any[] }[] = [];
  const table: Record<string, MockHandler> = {
    eth_chainId: () => ({ result: "0x" + chainId.toString(16) }),
    eth_getTransactionCount: () => ({ result: "0x0" }),
    eth_gasPrice: () => ({ result: "0x3b9aca00" }),
    eth_estimateGas: () => ({ result: "0x5208" }),
    eth_blockNumber: () => ({ result: "0x10" }),
    eth_getTransactionReceipt: () => ({ result: null }),
    eth_getBlockByNumber: () => ({ result: null }),
    ...handlers
  };
  const perMethodCount = new Map<string, number>();

  const send = (res: http.ServerResponse, id: unknown, reply: MockReply): void => {
    if ("destroy" in reply) {
      res.socket?.destroy();
      return;
    }
    if ("delayMs" in reply) {
      setTimeout(() => send(res, id, reply.then), reply.delayMs);
      return;
    }
    if ("raw" in reply) {
      res.writeHead(reply.status ?? 200, { "Content-Type": "application/json" });
      res.end(reply.raw);
      return;
    }
    const body =
      "idOverride" in reply
        ? { jsonrpc: "2.0", id: reply.idOverride, result: reply.result }
        : "error" in reply
          ? { jsonrpc: "2.0", id, error: reply.error }
          : { jsonrpc: "2.0", id, result: reply.result };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  const server = http.createServer((req, res) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      const msg = JSON.parse(data);
      calls.push({ method: msg.method, params: msg.params });
      const n = (perMethodCount.get(msg.method) ?? 0) + 1;
      perMethodCount.set(msg.method, n);
      const h = table[msg.method];
      const reply = h?.(msg.params ?? [], n) ?? {
        error: { code: -32601, message: `mock: method not found ${msg.method}` }
      };
      send(res, msg.id, reply);
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  return {
    url: `http://127.0.0.1:${port}`,
    calls,
    set: (m, h) => {
      table[m] = h;
    },
    methods: () => calls.map((c) => c.method),
    close: () =>
      new Promise<void>((r) => {
        server.closeAllConnections?.();
        server.close(() => r());
      })
  };
}

/** Blocks every fetch whose host is not 127.0.0.1/localhost; records the attempted URL. */
export function installExternalFetchGuard(): { attempts: string[]; restore(): void } {
  const original = globalThis.fetch;
  const attempts: string[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = typeof input === "string" ? input : (input?.url ?? String(input));
    const host = new URL(url).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") {
      attempts.push(url);
      throw new Error(`AUDIT_GUARD: blocked external request to ${url}`);
    }
    return original(input, init);
  }) as typeof fetch;
  return {
    attempts,
    restore: () => {
      globalThis.fetch = original;
    }
  };
}

// Well-known public Anvil/Hardhat test key #0 (no real funds; used only to sign locally).
export const TEST_PK = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
export const TEST_ADDR = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
export const OTHER_ADDR = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
