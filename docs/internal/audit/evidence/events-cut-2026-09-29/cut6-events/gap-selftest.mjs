// Offline self-test of gap-lib.mjs: no node, no Docker, loopback only.
//  1. The partition proxy in front of a local WebSocket echo server: round trip; partition closes
//     the live client and refuses new ones; heal accepts again on the same port.
//  2. decide() on synthetic sets for each outcome of the approved criterion.
// usage: node gap-selftest.mjs <repoRoot>
import { createRequire } from "node:module";
import path from "node:path";
import { createPartitionProxy, entryMap, applyNotification, diffSets, decide } from "./gap-lib.mjs";

const repo = path.resolve(process.argv[2]);
const ws = createRequire(path.join(repo, "packages", "kaspa-rpc", "package.json"))("ws");
const results = [];
const check = (name, ok, detail) => results.push({ name, ok: !!ok, detail });
const withTimeout = (p, ms, label) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timeout: ${label}`)), ms))]);

// 1. proxy
const echo = new ws.WebSocketServer({ host: "127.0.0.1", port: 0 });
await new Promise((r) => echo.once("listening", r));
echo.on("connection", (s) => s.on("message", (m) => s.send(m)));
const proxy = createPartitionProxy({ host: "127.0.0.1", port: echo.address().port });
await proxy.listen();
const open = (url) => new Promise((resolve, reject) => {
  const c = new ws.WebSocket(url);
  c.once("open", () => resolve(c));
  c.once("error", reject);
});
const roundTrip = (c, msg) => new Promise((resolve) => { c.once("message", (m) => resolve(String(m))); c.send(msg); });

const c1 = await open(proxy.url);
check("round trip through the proxy", (await withTimeout(roundTrip(c1, "ping"), 2000, "echo")) === "ping");
const closed = new Promise((r) => c1.once("close", () => r(true)));
await proxy.partition();
check("partition closes the live client", await withTimeout(closed, 2000, "close").catch(() => false));
check("no piped socket left after partition", proxy.active() === 0, { active: proxy.active() });
const refused = await withTimeout(open(proxy.url).then((c) => { c.close(); return false; }, () => true), 3000, "refuse").catch(() => false);
check("new connections are refused while partitioned", refused);
const port = proxy.port;
await proxy.heal();
check("heal listens on the same port", proxy.port === port, { before: port, after: proxy.port });
const c2 = await open(proxy.url);
check("round trip after heal", (await withTimeout(roundTrip(c2, "pong"), 2000, "echo2")) === "pong");
c2.close();
await proxy.partition();
echo.close();

// 2. decide()
const M = (...ops) => new Map(ops.map((op) => [op, "1"]));
const ok = { ok: true };
const validity = { V1: ok, V2: ok, V3: ok, V4: ok, V5: ok, V6: ok, V7: ok };
const T0 = M("a:0", "b:0", "c:0", "d:0");
const gap = { inputs: ["a:0", "b:0"], change: ["x:1"] };
const Tgap = M("c:0", "d:0", "x:1");
const Tfinal = M("d:0", "x:1", "y:1"); // post-heal spend: c:0 → y:1
const resubOnlyC2 = new Map(T0); // nothing arrived during the gap
const resubOnlyC3 = new Map(resubOnlyC2);
applyNotification(resubOnlyC3, M("c:0"), M("y:1")); // the post-heal spend arrives live
const d = (cand, truth) => diffSets(cand, truth);

check(
  "criterion: R converges → RESUBSCRIBE_SUFFICIENT",
  decide({ validity, gap, R: { C2: d(Tgap, Tgap), C3: d(Tfinal, Tfinal) }, U: { C2: d(Tgap, Tgap), C3: d(Tfinal, Tfinal) } }).verdict === "RESUBSCRIBE_SUFFICIENT"
);
check(
  "criterion: R misses exactly the gap, U converges → UTXOCONTEXT_REQUIRED",
  decide({ validity, gap, R: { C2: d(resubOnlyC2, Tgap), C3: d(resubOnlyC3, Tfinal) }, U: { C2: d(Tgap, Tgap), C3: d(Tfinal, Tfinal) } }).verdict === "UTXOCONTEXT_REQUIRED"
);
check(
  "criterion: U also wrong → INCONCLUSIVE",
  decide({ validity, gap, R: { C2: d(resubOnlyC2, Tgap), C3: d(resubOnlyC3, Tfinal) }, U: { C2: d(T0, Tgap), C3: d(Tfinal, Tfinal) } }).verdict === "INCONCLUSIVE"
);
const offByOne = new Map(resubOnlyC2);
offByOne.set("z:9", "1");
check(
  "criterion: R's difference is not exactly the gap → INCONCLUSIVE",
  decide({ validity, gap, R: { C2: d(offByOne, Tgap), C3: d(resubOnlyC3, Tfinal) }, U: { C2: d(Tgap, Tgap), C3: d(Tfinal, Tfinal) } }).verdict === "INCONCLUSIVE"
);
const liveMissed = new Map(resubOnlyC2); // R never received the post-heal spend either
check(
  "criterion: R dead after heal (C3 not just the inherited gap) → INCONCLUSIVE",
  decide({ validity, gap, R: { C2: d(resubOnlyC2, Tgap), C3: d(liveMissed, Tfinal) }, U: { C2: d(Tgap, Tgap), C3: d(Tfinal, Tfinal) } }).verdict === "INCONCLUSIVE"
);
check(
  "criterion: any failed validity check → INVALID",
  decide({ validity: { ...validity, V2: { ok: false, why: "a proxied socket stayed open" } }, gap, R: { C2: d(Tgap, Tgap), C3: d(Tfinal, Tfinal) }, U: { C2: d(Tgap, Tgap), C3: d(Tfinal, Tfinal) } }).verdict === "INVALID"
);
const amountOff = new Map(Tgap);
amountOff.set("c:0", "2");
check("an amount mismatch is not exact", diffSets(amountOff, Tgap).amountMismatch.length === 1);
check(
  "entryMap reads kaspa-wasm and HardKAS shapes",
  entryMap([{ outpoint: { transactionId: "AB", index: 1 }, amount: 5n }, { outpoint: { transactionId: "cd", index: 0 }, amountSompi: 7n }]).get("ab:1") === "5"
);

console.log(JSON.stringify({ passed: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length, results }, null, 2));
process.exit(results.every((r) => r.ok) ? 0 : 1);
