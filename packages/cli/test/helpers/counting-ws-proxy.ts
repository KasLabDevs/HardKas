// INT9 · a loopback WebSocket relay in front of one node, counting the JSON wRPC methods its clients call.
//
// Tests that must prove a request was NOT sent (a `submitTransaction` a re-send must not make) point the CLI at this relay
// instead of the node: every frame is passed through unchanged, both ways, and each client→node text frame that parses as
// a JSON wRPC request adds one to its method's count. Nothing is answered by the relay itself; a client whose node
// connection closes is closed too. Loopback only.
import { WebSocketServer, WebSocket } from "ws";
import type { AddressInfo } from "node:net";

export interface CountingWsProxy {
  /** ws://127.0.0.1:<port> — what the CLI is pointed at. */
  url: string;
  port: number;
  /** The node every connection is relayed to. */
  upstream: string;
  /** How many requests of `method` clients sent through the relay so far. */
  count(method: string): number;
  /** Every request method, in order. */
  methods: string[];
  connections(): number;
  close(): Promise<void>;
}

export async function startCountingWsProxy(upstream: string, port = 0): Promise<CountingWsProxy> {
  const methods: string[] = [];
  let connections = 0;
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  await new Promise<void>((resolve, reject) => {
    server.once("listening", () => resolve());
    server.once("error", reject);
  });
  const sockets = new Set<WebSocket>();
  server.on("connection", (client) => {
    connections++;
    sockets.add(client);
    const node = new WebSocket(upstream);
    sockets.add(node);
    const pending: Array<{ data: any; isBinary: boolean }> = [];
    node.on("open", () => {
      for (const p of pending.splice(0)) node.send(p.data, { binary: p.isBinary });
    });
    client.on("message", (data, isBinary) => {
      if (!isBinary) {
        try {
          const msg = JSON.parse(String(data));
          if (msg && typeof msg.method === "string") methods.push(msg.method);
        } catch {
          /* not a JSON request: passed through uncounted */
        }
      }
      if (node.readyState === WebSocket.OPEN) node.send(data, { binary: isBinary });
      else pending.push({ data, isBinary });
    });
    node.on("message", (data, isBinary) => {
      if (client.readyState === WebSocket.OPEN) client.send(data, { binary: isBinary });
    });
    const end = () => {
      try {
        client.close();
      } catch {
        /* closing */
      }
      try {
        node.close();
      } catch {
        /* closing */
      }
      sockets.delete(client);
      sockets.delete(node);
    };
    client.on("close", end);
    node.on("close", end);
    client.on("error", end);
    node.on("error", end);
  });
  const listening = (server.address() as AddressInfo).port;
  return {
    url: `ws://127.0.0.1:${listening}`,
    port: listening,
    upstream,
    count: (method) => methods.filter((m) => m.toLowerCase() === method.toLowerCase()).length,
    methods,
    connections: () => connections,
    close: async () => {
      for (const s of sockets) {
        try {
          s.terminate();
        } catch {
          /* gone */
        }
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  };
}
