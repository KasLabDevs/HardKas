// SECURITY-INTEGRATION-1 probe (loopback only): does the official kaspa-wasm RpcClient reconnect by itself after the node
// behind its URL restarts, and which events does it emit? Fake node in this process; nothing else is contacted.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const SRC = "C:/Users/jrodr/hkl1/si/src";
const req = createRequire(`${SRC}/packages/cli/package.json`);
const { WebSocketServer } = req("ws");
const rpc = await import(pathToFileURL(`${SRC}/packages/kaspa-rpc/dist/index.js`).href);

function fake(network, port = 0) {
  const server = new WebSocketServer({ host: "127.0.0.1", port });
  const methods = [];
  server.on("connection", (s) =>
    s.on("message", (d) => {
      const t = String(d);
      const id = /"id"\s*:\s*(\d+)/.exec(t)?.[1];
      const m = /"method"\s*:\s*"([^"]+)"/.exec(t)?.[1] ?? "?";
      methods.push(m);
      if (!id) return;
      if (m === "getServerInfo") return s.send(`{"id":${id},"method":"${m}","params":{"rpcApiVersion":1,"rpcApiRevision":0,"serverVersion":"2.1.0","networkId":"${network}","hasUtxoIndex":true,"isSynced":true,"virtualDaaScore":1}}`);
      if (m === "getBlockDagInfo") return s.send(`{"id":${id},"method":"${m}","params":{"network":"${network}","blockCount":1,"headerCount":1,"tipHashes":[],"difficulty":1,"pastMedianTime":1,"virtualParentHashes":[],"pruningPointHash":"${"0".repeat(64)}","virtualDaaScore":1,"sink":"${"0".repeat(64)}"}}`);
      s.send(`{"id":${id},"error":{"code":1,"message":"nope"}}`);
    })
  );
  return new Promise((r) => server.on("listening", () => r({ server, methods, port: server.address().port })));
}
const close = (f) => new Promise((r) => { for (const c of f.server.clients) c.terminate(); f.server.close(() => r()); });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const events = [];
const factory = (url) => {
  const c = rpc.officialRpcFactory ? rpc.officialRpcFactory(url) : null;
  for (const e of ["connect", "disconnect"]) c.addEventListener(e, (ev) => events.push(`${e}:${ev?.type ?? "?"}`));
  return c;
};
if (!rpc.officialRpcFactory) { console.log("officialRpcFactory not exported"); process.exit(1); }
const A = await fake("testnet-10");
const client = new rpc.JsonWrpcKaspaClient({ rpcUrl: `ws://127.0.0.1:${A.port}`, rpcFactory: factory, expectedNetworkId: "testnet-10" });
await client.getBlockDagInfo();
console.log("A methods", A.methods, "events", events);
await close(A);
await sleep(Number(process.env.GAP_MS ?? 1500));
console.log("after drop: events", events);
const M = await fake("mainnet", A.port);
await sleep(5000);
console.log("after restart (no call yet): M methods", M.methods, "events", events);
try {
  await client.getBlockDagInfo();
  console.log("call SUCCEEDED on the restarted node; M methods", M.methods);
} catch (e) {
  console.log("call refused:", e.code, "M methods", M.methods);
}
await client.close();
await close(M);
process.exit(0);
