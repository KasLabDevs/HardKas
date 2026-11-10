import http from "node:http";
import type { AddressInfo } from "node:net";
import { WebSocketServer, WebSocket } from "ws";
import type { KaspaSimulatorNode } from "../simulator-node.js";
import { SIMULATOR_EVENTS, simulatorRpcError, type SimulatorRpcClient } from "./simulator-rpc.js";
import type { SimulatorBlock, SimulatorUtxo } from "../types.js";

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);
const MIN_SAFE = BigInt(Number.MIN_SAFE_INTEGER);

/**
 * Recursively converts BigInt values to JSON numbers when they are safe integers and to decimal strings otherwise
 * (SIM-16: it converted every bigint to a Number, losing precision above 2^53, e.g. the coin supply).
 * The RPC server itself does not use it: it writes bigints exactly (stringifyRpcJson).
 */
export function sanitizeForJson(value: unknown): unknown {
  if (typeof value === "bigint") {
    return value <= MAX_SAFE && value >= MIN_SAFE ? Number(value) : value.toString();
  }
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(sanitizeForJson);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = sanitizeForJson(v);
  }
  return out;
}

/**
 * JSON with every bigint written as an exact integer literal, as rusty-kaspad writes its u64 fields (SIM-16).
 */
export function stringifyRpcJson(value: unknown): string {
  // Bigints are replaced before JSON.stringify sees them, so a `BigInt.prototype.toJSON` installed by the host
  // application (a common hack that turns them into strings) cannot change what goes on the wire.
  const rawJSON = (JSON as any).rawJSON as ((text: string) => unknown) | undefined;
  const big: string[] = [];
  const marker = (v: bigint) => (typeof rawJSON === "function" ? rawJSON(v.toString()) : `\u0000bigint:${big.push(v.toString()) - 1}\u0000`);
  const walk = (v: unknown): unknown => {
    if (typeof v === "bigint") return marker(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object" && (Object.getPrototypeOf(v) === Object.prototype || Object.getPrototypeOf(v) === null)) {
      const out: Record<string, unknown> = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  const text = JSON.stringify(walk(value));
  return big.length === 0 ? text : text.replace(/"\\u0000bigint:(\d+)\\u0000"/g, (_m, i) => big[Number(i)]!);
}

export interface SimulatorRpcServerOptions {
  /** Port to listen on (0: any free port). The CLI's default is KASPA_SIMULATOR_DEFAULT_PORT (19110). */
  port?: number;
  /** Interface to bind; loopback by default. */
  host?: string;
  /**
   * Browser origins allowed to call the server. SIM-16: by default none: a request carrying an `Origin` header (any web
   * page, including a DNS-rebinding one) is refused, so a page cannot mint funds or revert the simulator. Clients that
   * are not browsers send no Origin and are unaffected.
   */
  allowedOrigins?: readonly string[];
  /**
   * Whether the simulator's dev methods (kaspasim_fund/mine/snapshot/revert/setAutomine/startMiner/stopMiner and their
   * evm_* aliases) are served. Default true; false serves the node RPC only.
   */
  devMethods?: boolean;
}

const DEV_METHODS = new Set([
  "kaspasim_mine",
  "evm_mine",
  "kaspasim_snapshot",
  "evm_snapshot",
  "kaspasim_revert",
  "evm_revert",
  "kaspasim_fund",
  "kaspasim_getDevAccounts",
  "kaspasim_setAutomine",
  "kaspasim_startMiner",
  "kaspasim_stopMiner"
]);

export class SimulatorRpcServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private port: number = 0;
  private host: string = "127.0.0.1";
  private allowedOrigins: ReadonlySet<string> = new Set();
  private devMethods = true;

  // Active subscriptions by client socket
  private daaSubscribers = new Set<WebSocket>();
  private blueScoreSubscribers = new Set<WebSocket>();
  private blockAddedSubscribers = new Set<WebSocket>();
  private utxoSubscribers = new Map<WebSocket, Set<string>>(); // socket -> Set of monitored addresses

  constructor(
    private readonly node: KaspaSimulatorNode,
    private readonly rpcClient: SimulatorRpcClient = node.rpc
  ) {
    this.setupNodeEvents();
  }

  private setupNodeEvents(): void {
    // The simulator's own in-process events (SIMULATOR_EVENTS), relayed to subscribed sockets as wRPC notifications.
    this.rpcClient.on(SIMULATOR_EVENTS.daaScoreChanged, (daaScore: bigint) => {
      this.broadcastDaaScore(daaScore);
    });

    this.rpcClient.on(SIMULATOR_EVENTS.blockAdded, (block: SimulatorBlock) => {
      this.broadcastBlockAdded(block);
      this.broadcastBlueScore(this.node.dagChain.getBlueScore());
    });

    this.rpcClient.on(SIMULATOR_EVENTS.utxosChanged, (payload: { added: SimulatorUtxo[]; removed: SimulatorUtxo[] }) => {
      this.broadcastUtxosChanged(payload);
    });
  }

  private broadcastDaaScore(daaScore: bigint): void {
    const msg = stringifyRpcJson(({
        method: "notifyVirtualDaaScoreChanged",
        params: { virtualDaaScore: daaScore }
      })
    );
    for (const ws of this.daaSubscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  private broadcastBlueScore(blueScore: bigint): void {
    const msg = stringifyRpcJson(({
        method: "notifyVirtualSelectedParentBlueScoreChanged",
        params: { blueScore }
      })
    );
    for (const ws of this.blueScoreSubscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  private broadcastBlockAdded(block: SimulatorBlock): void {
    const msg = stringifyRpcJson(({
        method: "notifyBlockAdded",
        params: { block }
      })
    );
    for (const ws of this.blockAddedSubscribers) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  private broadcastUtxosChanged(payload: { added: SimulatorUtxo[]; removed: SimulatorUtxo[] }): void {
    for (const [ws, watchedAddresses] of this.utxoSubscribers.entries()) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      const relevantAdded = payload.added.filter((u) => watchedAddresses.has(u.address));
      const relevantRemoved = payload.removed.filter((u) => watchedAddresses.has(u.address));

      if (relevantAdded.length > 0 || relevantRemoved.length > 0) {
        const msg = stringifyRpcJson(({
            method: "notifyUtxosChanged",
            params: {
              added: relevantAdded.map((u) => ({
                address: u.address,
                outpoint: { transactionId: u.transactionId, index: u.index },
                utxoEntry: {
                  amount: u.amountSompi,
                  scriptPublicKey: u.scriptPublicKey.startsWith("0000") ? u.scriptPublicKey : `0000${u.scriptPublicKey}`,
                  blockDaaScore: u.blockDaaScore,
                  isCoinbase: u.isCoinbase
                }
              })),
              removed: relevantRemoved.map((u) => ({
                transactionId: u.transactionId,
                index: u.index
              }))
            }
          })
        );
        ws.send(msg);
      }
    }
  }

  /**
   * Starts HTTP + WebSocket server.
   */
  public async start(options: SimulatorRpcServerOptions = {}): Promise<{ port: number; url: string; httpUrl: string; wsUrl: string }> {
    const host = options.host ?? "127.0.0.1";
    const port = options.port ?? 0;
    this.allowedOrigins = new Set(options.allowedOrigins ?? []);
    this.devMethods = options.devMethods !== false;

    const server = http.createServer(async (req, res) => {
      // SIM-16: no `Access-Control-Allow-Origin: *`. A browser request (it carries Origin) is served only for an
      // allowed origin; any other is refused before it can reach a method (even a "simple" POST a page sends blind).
      const origin = req.headers.origin;
      if (origin !== undefined && !this.allowedOrigins.has(origin)) {
        res.writeHead(403, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: `SIMULATOR_ORIGIN_REFUSED: origin ${origin} is not allowed` } }));
        return;
      }
      if (origin !== undefined) {
        res.setHeader("Access-Control-Allow-Origin", origin);
        res.setHeader("Vary", "Origin");
        res.setHeader("Access-Control-Allow-Methods", "POST, GET, OPTIONS");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      }

      if (req.method === "OPTIONS") {
        res.writeHead(204);
        res.end();
        return;
      }

      if (req.method === "GET") {
        if (req.url === "/health" || req.url === "/" || req.url === "/info") {
          const info = await this.rpcClient.getInfo();
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(stringifyRpcJson(({ status: "healthy", ...info })));
          return;
        }
        res.writeHead(404);
        res.end();
        return;
      }

      if (req.method === "POST") {
        let body = "";
        req.on("data", (chunk) => {
          body += chunk;
        });
        req.on("end", async () => {
          try {
            const parsed = JSON.parse(body || "{}");
            const id = parsed.id ?? null;
            const method = parsed.method ?? "";
            const params = parsed.params;

            const result = await this.handleRpcMethod(method, params, null);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              stringifyRpcJson(({
                  jsonrpc: "2.0",
                  id,
                  result
                })
              )
            );
          } catch (err: any) {
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(
              JSON.stringify({
                jsonrpc: "2.0",
                id: null,
                error: {
                  code: -32603,
                  message: err?.message || String(err),
                  ...(err?.code ? { data: { code: String(err.code) } } : {})
                }
              })
            );
          }
        });
        return;
      }

      res.writeHead(405);
      res.end();
    });

    // SIM-16: the same origin rule for WebSocket upgrades (a page can open a socket to loopback).
    const wss = new WebSocketServer({
      server,
      verifyClient: (info: { origin?: string; req: http.IncomingMessage }) => {
        const origin = info.req.headers.origin;
        return origin === undefined || this.allowedOrigins.has(origin);
      }
    });

    wss.on("connection", (socket) => {
      socket.on("message", async (data) => {
        const text = String(data);
        const idMatch = /"id"\s*:\s*([^,}\s]+)/.exec(text);
        const rawId = idMatch ? idMatch[1] : "0";

        const methodMatch = /"method"\s*:\s*"([^"]+)"/.exec(text);
        const method = (methodMatch && methodMatch[1]) ? methodMatch[1] : "";

        let params: any = undefined;
        try {
          const parsed = JSON.parse(text);
          params = parsed.params;
        } catch {
          // ignore parsing error
        }

        try {
          const result = await this.handleRpcMethod(method, params, socket);
          // Kaspa wRPC SerdeJson protocol format: {"id": id, "method": method, "params": result}; bigints exact
          const response = `{"id":${rawId},"method":${JSON.stringify(method)},"params":${stringifyRpcJson(result ?? {})}}`;
          socket.send(response);
        } catch (err: any) {
          const errResponse = `{"id":${rawId},"error":{"code":1,"message":${JSON.stringify(err?.message || String(err))}}}`;
          socket.send(errResponse);
        }
      });

      socket.on("close", () => {
        this.daaSubscribers.delete(socket);
        this.blueScoreSubscribers.delete(socket);
        this.blockAddedSubscribers.delete(socket);
        this.utxoSubscribers.delete(socket);
      });
    });

    await new Promise<void>((resolve) => {
      server.listen(port, host, () => resolve());
    });

    const addr = server.address() as AddressInfo;
    this.server = server;
    this.wss = wss;
    this.port = addr.port;
    this.host = host;

    return {
      port: addr.port,
      url: `http://${host}:${addr.port}`,
      httpUrl: `http://${host}:${addr.port}`,
      wsUrl: `ws://${host}:${addr.port}`
    };
  }

  private async handleRpcMethod(method: string, params: any, socket: WebSocket | null): Promise<any> {
    if (method === "ping" || method === "pingRequest") {
      return {};
    }

    // Special subscriptions & notifications
    if (socket) {
      if (
        method === "notifyVirtualDaaScoreChanged" ||
        method === "notifyVirtualDaaScoreChangedRequest" ||
        method === "subscribeVirtualDaaScoreChanged"
      ) {
        this.daaSubscribers.add(socket);
        return {};
      }
      if (
        method === "stopNotifyingVirtualDaaScoreChanged" ||
        method === "stopNotifyingVirtualDaaScoreChangedRequest" ||
        method === "unsubscribeVirtualDaaScoreChanged"
      ) {
        this.daaSubscribers.delete(socket);
        return {};
      }
      if (
        method === "notifyVirtualSelectedParentBlueScoreChanged" ||
        method === "notifyVirtualSelectedParentBlueScoreChangedRequest" ||
        method === "notifySinkBlueScoreChanged" ||
        method === "subscribeSinkBlueScoreChanged" ||
        method === "subscribeVirtualSelectedParentBlueScoreChanged"
      ) {
        this.blueScoreSubscribers.add(socket);
        return {};
      }
      if (
        method === "unsubscribeSinkBlueScoreChanged" ||
        method === "unsubscribeVirtualSelectedParentBlueScoreChanged"
      ) {
        this.blueScoreSubscribers.delete(socket);
        return {};
      }
      if (
        method === "notifyBlockAdded" ||
        method === "notifyBlockAddedRequest" ||
        method === "subscribeBlockAdded"
      ) {
        this.blockAddedSubscribers.add(socket);
        return {};
      }
      if (method === "unsubscribeBlockAdded") {
        this.blockAddedSubscribers.delete(socket);
        return {};
      }
      if (
        method === "notifyUtxosChanged" ||
        method === "notifyUtxosChangedRequest" ||
        method === "subscribeUtxosChanged"
      ) {
        const addresses: string[] = Array.isArray(params)
          ? params
          : (Array.isArray(params?.addresses) ? params.addresses : []);
        let set = this.utxoSubscribers.get(socket);
        if (!set) {
          set = new Set<string>();
          this.utxoSubscribers.set(socket, set);
        }
        for (const addr of addresses) set.add(addr);
        return {};
      }
      if (
        method === "stopNotifyingUtxosChanged" ||
        method === "stopNotifyingUtxosChangedRequest" ||
        method === "unsubscribeUtxosChanged"
      ) {
        this.utxoSubscribers.delete(socket);
        return {};
      }
    }

    // Dev & Anvil-like simulator commands (only when the server was started with them; see devMethods)
    if (DEV_METHODS.has(method) && !this.devMethods) {
      throw simulatorRpcError("SIMULATOR_DEV_METHODS_DISABLED", `${method} is a simulator dev method and this server serves none`);
    }
    switch (method) {
      case "kaspasim_mine":
      case "evm_mine": {
        const count = Number(params?.blocks ?? params?.count ?? (Array.isArray(params) ? params[0] : 1)) || 1;
        const blocks = this.node.mine(count);
        return { blocksMined: blocks.length, tipHash: this.node.dagChain.getSink() };
      }
      case "kaspasim_snapshot":
      case "evm_snapshot": {
        const id = this.node.snapshot();
        return { snapshotId: id };
      }
      case "kaspasim_revert":
      case "evm_revert": {
        const id = String(params?.snapshotId ?? (Array.isArray(params) ? params[0] : ""));
        const ok = this.node.revert(id);
        return { reverted: ok };
      }
      case "kaspasim_fund": {
        const addr = params?.address ?? (Array.isArray(params) ? params[0] : "");
        const sompi = BigInt(params?.amountSompi ?? params?.amount ?? (Array.isArray(params) ? params[1] : 0));
        const utxo = this.node.fund(addr, sompi);
        return { utxo };
      }
      case "kaspasim_getDevAccounts": {
        return { accounts: this.node.getDevAccounts() };
      }
      case "kaspasim_setAutomine": {
        const enabled = Boolean(params?.enabled ?? (Array.isArray(params) ? params[0] : true));
        this.node.setAutomine(enabled);
        return { automine: enabled };
      }
      case "kaspasim_startMiner": {
        const interval = Number(params?.intervalMs ?? (Array.isArray(params) ? params[0] : 25)) || 25;
        this.node.startMiner(interval);
        return { minerRunning: true, intervalMs: interval };
      }
      case "kaspasim_stopMiner": {
        this.node.stopMiner();
        return { minerRunning: false };
      }
    }

    // Default dispatch to SimulatorRpcClient
    return this.rpcClient.call(method, params);
  }

  public getPort(): number {
    return this.port;
  }

  public getWsUrl(): string {
    return `ws://${this.host}:${this.port}`;
  }

  public getHttpUrl(): string {
    return `http://${this.host}:${this.port}`;
  }

  /**
   * Gracefully closes the HTTP server and terminates WebSocket connections.
   */
  public async close(): Promise<void> {
    if (this.wss) {
      for (const client of this.wss.clients) {
        client.terminate();
      }
      await new Promise<void>((resolve) => this.wss!.close(() => resolve()));
      this.wss = null;
    }

    if (this.server) {
      await new Promise<void>((resolve) => this.server!.close(() => resolve()));
      this.server = null;
    }
  }
}
