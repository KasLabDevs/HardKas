import type { AddressInfo } from "node:net";
import { WebSocketServer, type WebSocket } from "ws";

/**
 * RPC-RESPONSE-TOO-LARGE-1 · a fake rusty-kaspa 2.1.0 wRPC JSON endpoint on loopback (an ephemeral port), for tests that
 * put the REAL official kaspa-wasm client in front of an address whose UTXO list is too large to read. It answers what
 * HardKAS asks around a UTXO read (getServerInfo, getInfo, getBlockDagInfo, getBalancesByAddresses, getMempoolEntries*),
 * and each address's getUtxosByAddresses as the test says:
 *   - `{ kind: "entries", count }`: that many entries, in v2.1.0's serde shape (covenantId: null included);
 *   - `{ kind: "bytes", size }`: ONE entry, padded with JSON whitespace to exactly `size` bytes — an answer of any size
 *     without building 277,000 entries (one Buffer, filled once; no huge JS string on this side);
 *   - `{ kind: "drop" }`: no answer, the connection is cut (a plain disconnect, not a size refusal).
 * Every answer leaves as ONE text frame, as kaspad's server sends it. Request ids are u64 values above 2^53: echoed
 * verbatim from the request text, never through a JS number. Never a real node.
 */
export type UtxoReply = { kind: "entries"; count: number } | { kind: "bytes"; size: number } | { kind: "drop" };

export interface UtxoHeavyNode {
  url: string;
  /** getUtxosByAddresses requests received for `address` (all addresses when omitted). */
  utxoReads(address?: string): number;
  /** Close codes the server saw from its clients (1009: the client refused a message for its size). */
  closeCodes: number[];
  close(): Promise<void>;
}

export const FAKE_VIRTUAL_DAA = 1_341_858;
const SPK = "0000" + "20" + "ab".repeat(32) + "ac";
const HASH = "ab".repeat(32);

function entryJson(address: string, i: number, daa: number): string {
  const txid = (i + 1).toString(16).padStart(64, "0");
  return (
    `{"address":"${address}","outpoint":{"transactionId":"${txid}","index":0},` +
    `"utxoEntry":{"amount":5000000000,"scriptPublicKey":"${SPK}","blockDaaScore":${daa - (i % 1000) - 2000},"isCoinbase":false,"covenantId":null}}`
  );
}

function utxosAnswer(id: string, address: string, reply: Exclude<UtxoReply, { kind: "drop" }>, daa: number): Buffer {
  if (reply.kind === "entries") {
    const parts: string[] = [];
    for (let i = 0; i < reply.count; i++) parts.push(entryJson(address, i, daa));
    return Buffer.from(`{"id":${id},"params":{"entries":[${parts.join(",")}]}}`);
  }
  const head = Buffer.from(`{"id":${id},"params":{"entries":[${entryJson(address, 0, daa)}]}`);
  const tail = Buffer.from("}");
  if (reply.size < head.length + tail.length) throw new Error(`a ${reply.size}-byte answer cannot hold one entry`);
  const body = Buffer.alloc(reply.size, 0x20);
  head.copy(body, 0);
  tail.copy(body, reply.size - tail.length);
  return body;
}

export async function startUtxoHeavyWrpcNode(options: {
  /** getUtxosByAddresses per address; an address not named gets one entry. */
  replies: Record<string, UtxoReply>;
  /** getBalancesByAddresses per address (sompi); an address not named has 5000000000 per entry it would list. */
  balances?: Record<string, bigint>;
  networkId?: string;
}): Promise<UtxoHeavyNode> {
  const networkId = options.networkId ?? "simnet";
  const daa = FAKE_VIRTUAL_DAA;
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0, perMessageDeflate: false, maxPayload: 1 << 30 });
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  const reads = new Map<string, number>();
  const closeCodes: number[] = [];
  const small: Record<string, (params: any) => unknown> = {
    getServerInfo: () => ({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId, hasUtxoIndex: true, isSynced: true, virtualDaaScore: daa }),
    getInfo: () => ({ p2pId: "utxo-heavy-fake", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true }),
    getBlockDagInfo: () => ({
      network: networkId,
      blockCount: daa,
      headerCount: daa,
      tipHashes: [HASH],
      difficulty: 1.0,
      pastMedianTime: 1761000000000,
      virtualParentHashes: [HASH],
      pruningPointHash: HASH,
      virtualDaaScore: daa,
      sink: HASH
    }),
    getBalancesByAddresses: (params) => ({
      entries: ((params?.addresses ?? []) as string[]).map((address) => {
        const given = options.balances?.[address];
        const reply = options.replies[address];
        const count = reply?.kind === "entries" ? reply.count : 1;
        return { address, balance: Number(given ?? BigInt(count) * 5_000_000_000n) };
      })
    }),
    getMempoolEntriesByAddresses: () => ({ entries: [] }),
    getMempoolEntries: () => ({ mempoolEntries: [] })
  };
  server.on("connection", (socket: WebSocket) => {
    socket.on("close", (code: number) => closeCodes.push(code));
    socket.on("error", () => {});
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      if (!id) return;
      let msg: any;
      try {
        msg = JSON.parse(text);
      } catch {
        return;
      }
      const method = String(msg?.method ?? "");
      if (method === "getUtxosByAddresses") {
        const address = String(msg?.params?.addresses?.[0] ?? "");
        reads.set(address, (reads.get(address) ?? 0) + 1);
        const reply = options.replies[address] ?? { kind: "entries", count: 1 };
        if (reply.kind === "drop") {
          socket.terminate();
          return;
        }
        socket.send(utxosAnswer(id, address, reply, daa), { binary: false });
        return;
      }
      const answer = small[method];
      if (answer) {
        socket.send(`{"id":${id},"params":${JSON.stringify(answer(msg?.params))}}`);
        return;
      }
      socket.send(`{"id":${id},"error":${JSON.stringify({ code: 0, message: `utxo-heavy fake: ${method} not implemented`, data: null })}}`);
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    utxoReads: (address) => (address === undefined ? [...reads.values()].reduce((a, b) => a + b, 0) : reads.get(address) ?? 0),
    closeCodes,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of server.clients) client.terminate();
        server.close(() => resolve());
      })
  };
}
