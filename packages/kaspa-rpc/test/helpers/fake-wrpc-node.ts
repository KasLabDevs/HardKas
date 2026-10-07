import type { AddressInfo } from "node:net";
import { WebSocketServer } from "ws";

/**
 * A fake Kaspa wRPC JSON endpoint on loopback for lifecycle tests: it accepts WebSocket connections and answers every
 * request with a remote error in the envelope the official RpcClient recognises, so a client connects, fails fast and
 * stays connected. Never a real node: it listens on an ephemeral port.
 */
export interface FakeWrpcNode {
  url: string;
  /** Connections opened so far (one per WebSocket handshake). */
  connections(): number;
  close(): Promise<void>;
}

export async function startFakeWrpcNode(): Promise<FakeWrpcNode> {
  const server = new WebSocketServer({ host: "127.0.0.1", port: 0 });
  await new Promise<void>((resolve) => server.on("listening", () => resolve()));
  let opened = 0;
  server.on("connection", (socket) => {
    opened++;
    socket.on("message", (data) => {
      const text = String(data);
      // The request id is a u64: echo its digits verbatim (a JS number would lose precision and the client would
      // never match the answer).
      const id = /"id"\s*:\s*(\d+)/.exec(text)?.[1];
      const method = /"method"\s*:\s*"([^"]+)"/.exec(text)?.[1] ?? "?";
      if (id) socket.send(`{"id":${id},"error":{"code":1,"message":"fake node refuses ${method}"}}`);
    });
  });
  const { port } = server.address() as AddressInfo;
  return {
    url: `ws://127.0.0.1:${port}`,
    connections: () => opened,
    close: () =>
      new Promise<void>((resolve) => {
        for (const client of server.clients) client.terminate();
        server.close(() => resolve());
      })
  };
}
