import fs from "node:fs";
import http from "node:http";
import type { AddressInfo, Socket } from "node:net";
import { WebSocketServer } from "ws";

// MAINNET TOTAL LOCKDOWN · decoy "mainnet nodes" for the negative tests. Never a real node: a loopback server that
// COUNTS every TCP connection it accepts (before any protocol) and every request it is sent. It speaks just enough wRPC
// JSON (the official kaspa-wasm RpcClient's encoding) and EVM JSON-RPC to look like a node of the network it is told to
// claim, so a client that did connect would be able to read from it — which is exactly what the tests rule out.

export interface Decoy {
  readonly url: string;
  readonly httpUrl: string;
  readonly port: number;
  /** TCP connections accepted (any protocol). */
  connections: number;
  /** Every request received, in order: wRPC method names, or `http:<eth method>` for EVM JSON-RPC posts. */
  readonly methods: string[];
  close(): Promise<void>;
}

const hash = (n: number) => n.toString(16).padStart(64, "0");

/**
 * A decoy that says it serves `network` (getServerInfo.networkId, getBlockDagInfo.network) and, over HTTP JSON-RPC,
 * answers eth_chainId with `evmChainId` (default: Igra mainnet, 38833).
 */
export async function startDecoy(network: string, evmChainId = 38833): Promise<Decoy> {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += String(d)));
    req.on("end", () => {
      let method = "?";
      let id: unknown = 1;
      try {
        const j = JSON.parse(body);
        method = String(j?.method ?? "?");
        id = j?.id ?? 1;
      } catch {
        /* not JSON */
      }
      decoy.methods.push(`http:${method}`);
      res.setHeader("content-type", "application/json");
      if (method === "eth_chainId") return res.end(JSON.stringify({ jsonrpc: "2.0", id, result: `0x${evmChainId.toString(16)}` }));
      res.end(JSON.stringify({ jsonrpc: "2.0", id, result: "0x0" }));
    });
  });
  const sockets = new Set<Socket>();
  server.on("connection", (s: Socket) => {
    decoy.connections++;
    sockets.add(s);
    s.on("close", () => sockets.delete(s));
  });
  const wss = new WebSocketServer({ server });
  wss.on("connection", (socket) => {
    socket.on("message", (data) => {
      const text = String(data);
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      let params: any;
      try {
        params = JSON.parse(text.replace(/"id"\s*:\s*\d+/, '"id":0')).params;
      } catch {
        params = undefined;
      }
      decoy.methods.push(method);
      if (!id) return;
      const ok = (result: unknown) => socket.send(`{"id":${id},"method":"${method}","params":${JSON.stringify(result)}}`);
      const err = (message: string) => socket.send(`{"id":${id},"error":{"code":0,"message":${JSON.stringify(message)},"data":null}}`);
      switch (method) {
        case "getServerInfo":
          return ok({ rpcApiVersion: 1, rpcApiRevision: 0, serverVersion: "2.1.0", networkId: network, hasUtxoIndex: true, isSynced: true, virtualDaaScore: 600_000_000 });
        case "getInfo":
          return ok({ p2pId: "decoy", mempoolSize: 0, serverVersion: "2.1.0", isUtxoIndexed: true, isSynced: true, hasNotifyCommand: true, hasMessageId: true });
        case "getBlockDagInfo":
          return ok({ network, blockCount: 10, headerCount: 10, tipHashes: [hash(1)], difficulty: 1, pastMedianTime: Date.now(), virtualParentHashes: [hash(1)], pruningPointHash: hash(2), virtualDaaScore: 600_000_000, sink: hash(1) });
        case "getSinkBlueScore":
          return ok({ blueScore: 590_000_000 });
        case "getFeeEstimate":
          return ok({ estimate: { priorityBucket: { feerate: 1, estimatedSeconds: 1 }, normalBuckets: [], lowBuckets: [] } });
        case "getBalanceByAddress":
          return ok({ balance: 50_00000000 });
        case "getBalancesByAddresses":
          return ok({ entries: (params?.addresses ?? []).map((address: string) => ({ address, balance: 50_00000000 })) });
        case "getUtxosByAddresses":
          return ok({ entries: [] });
        case "getMempoolEntriesByAddresses":
          return ok({ entries: [] });
        case "getMempoolEntries":
          return ok({ mempoolEntries: [] });
        default:
          return err(`decoy does not implement ${method}`);
      }
    });
  });
  await new Promise<void>((r, j) => {
    server.once("error", j);
    server.listen(0, "127.0.0.1", () => r());
  });
  const port = (server.address() as AddressInfo).port;
  const decoy: Decoy = {
    url: `ws://127.0.0.1:${port}`,
    httpUrl: `http://127.0.0.1:${port}`,
    port,
    connections: 0,
    methods: [],
    close: () =>
      new Promise<void>((r) => {
        for (const c of wss.clients) c.terminate();
        for (const s of sockets) s.destroy();
        wss.close();
        server.close(() => r());
      })
  };
  return decoy;
}

/** Every connection attempt the hermetic preload recorded in `log` towards `port` (any host), and every refused one. */
export function attemptsIn(log: string, port?: number): { toPort: number; refused: string[]; all: string[] } {
  const text = fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "";
  const all = text.split(/\r?\n/).filter(Boolean);
  const toPort = port === undefined ? 0 : all.filter((l) => new RegExp(`\\t[^\\t]*:${port}\\t`).test(l)).length;
  const refused = all.filter((l) => /\tREFUSED_(CONNECT|DNS)\t/.test(l));
  return { toPort, refused, all };
}
