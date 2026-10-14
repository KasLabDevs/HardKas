// SECURITY-INTEGRATION-1 · D1 stress probe (loopback only, real kaspa-wasm RpcClient): requests are fired without pause
// while the node behind the URL restarts as a node declaring mainnet. Invariant: the restarted node receives nothing but
// getServerInfo. Fake nodes in this process; nothing else is contacted.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const SRC = process.env.SI_SRC ?? "C:/Users/jrodr/hkl1/si/src";
const req = createRequire(`${SRC}/packages/cli/package.json`);
const { WebSocketServer } = req("ws");
const rpc = await import(pathToFileURL(`${SRC}/packages/kaspa-rpc/dist/index.js`).href);
const ROUNDS = Number(process.env.ROUNDS ?? 20);
import fs from "node:fs";
// synchronous phase marks (a native abort loses buffered stdio)
const MARK = process.env.MARK_FILE;
const mark = (s) => {
  if (MARK) fs.appendFileSync(MARK, `${Date.now()} ${s}\n`);
};

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

const summary = { rounds: ROUNDS, violations: 0, requests: 0, outcomes: {} };
for (let round = 0; round < ROUNDS; round++) {
  const A = await fake("testnet-10");
  const client = new rpc.JsonWrpcKaspaClient({ rpcUrl: `ws://127.0.0.1:${A.port}`, expectedNetworkId: "testnet-10", timeoutMs: 3000 });
  await client.getBlockDagInfo();
  const fired = [];
  let firing = true;
  const burst = (async () => {
    while (firing) {
      // two at a time: concurrent callers
      fired.push(client.getBlockDagInfo().then(() => "ok", (e) => e?.code ?? `${e?.name}: ${String(e?.message).replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:P").slice(0, 70)}`));
      fired.push(client.getBlockDagInfo().then(() => "ok", (e) => e?.code ?? `${e?.name}: ${String(e?.message).replace(/127\.0\.0\.1:\d+/g, "127.0.0.1:P").slice(0, 70)}`));
      await sleep(Number(process.env.INTERVAL_MS ?? 5));
    }
  })();
  await sleep(50);
  mark(`round ${round} close A`);
  await close(A);
  const M = await fake("mainnet", A.port); // something else answers behind the same URL, no gap
  mark(`round ${round} M up`);
  await sleep(2500);
  firing = false;
  await burst;
  mark(`round ${round} await fired`);
  const results = await Promise.all(fired);
  mark(`round ${round} fired settled`);
  const leaked = M.methods.filter((m) => m !== "getServerInfo");
  if (leaked.length) summary.violations++;
  summary.requests += results.length;
  for (const r of results) summary.outcomes[r] = (summary.outcomes[r] ?? 0) + 1;
  console.log(`round ${round}: M received ${JSON.stringify(M.methods.reduce((a, m) => ((a[m] = (a[m] ?? 0) + 1), a), {}))}${leaked.length ? "  << VIOLATION" : ""}`);
  mark(`round ${round} client.close`);
  await client.close();
  mark(`round ${round} client closed`);
  await close(M);
  mark(`round ${round} M closed`);
}
console.log(JSON.stringify(summary));
process.exit(0);
