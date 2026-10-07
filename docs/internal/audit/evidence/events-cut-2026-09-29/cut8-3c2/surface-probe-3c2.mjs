// Surface Cut 3c-2 · packed-consumer probe, run INSIDE an external consumer (cwd = consumer dir;
// ESM resolves from the script's location, so the script is copied there). No node needed.
// The removed surface:
//  - subscribeToUtxosChanged / subscribeToVirtualChainChanged / on / off on every exported
//    KaspaRpcClient class (kaspa-rpc and localnet);
//  - the packed files of kaspa-rpc, localnet, sdk and cli that mention a removed name.
// What must not change (kept by the order):
//  - request/response members on the same classes; MockKaspaRpcClient and a LoadBalancedRpcProvider
//    over two mocks answer getInfo(); JsonWrpcKaspaClient fails the same way on a closed port;
//  - Hardkas.open() in an empty dir: network, the rpc class, its getInfo();
//  - WalletToolkit.watch() without a node → WALLET_WATCH_REQUIRES_NODE; createUtxoContext exported;
//  - KaspaWrpcClient still exported (out of scope).
// Everything is written under the OS temp dir. usage: node surface-probe-3c2.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const out = {};
const errOf = (e) => ({ name: e?.name ?? null, code: e?.code ?? null, message: String(e?.message ?? e).replace(/\s+/g, " ").slice(0, 160) });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-3c2-probe-"));
const NAMES = ["subscribeToUtxosChanged", "subscribeToVirtualChainChanged", "UtxosChangedEvent", "VirtualChainChangedEvent", "RpcAcceptedTransactionIds", "KaspaSubscription", "OFFICIAL_EVENTS", "RPC_SUBSCRIPTIONS_UNSUPPORTED", "subscribeUtxosChanged", "subscribeVirtualChainChanged"];
const REMOVED = ["subscribeToUtxosChanged", "subscribeToVirtualChainChanged", "on", "off"];
const KEPT = ["getInfo", "healthCheck", "getUtxosByAddresses", "getBalanceByAddress", "submitTransaction", "getMempoolEntry", "getVirtualChainFromBlockV2", "getServerInfo", "call", "close"];
const pkgDir = (name) => fs.realpathSync(path.join(process.cwd(), "node_modules", ...name.split("/")));
function filesOf(dir) {
  const files = [];
  (function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) {
        if (e.name !== "node_modules") walk(p);
      } else files.push(p);
    }
  })(dir);
  return files;
}
const mentionsIn = (name) => {
  const dir = pkgDir(name);
  return filesOf(dir)
    .map((f) => ({ file: path.relative(dir, f).split(path.sep).join("/"), found: NAMES.filter((n) => fs.readFileSync(f).toString("latin1").includes(n)) }))
    .filter((x) => x.found.length);
};
const members = (cls) => ({ removed: REMOVED.filter((m) => m in cls.prototype), kept: KEPT.filter((m) => typeof cls.prototype[m] === "function") });
const plain = (v) => JSON.parse(JSON.stringify(v, (_, x) => (typeof x === "bigint" ? `${x}n` : x)));
try {
  const rpc = await import("@hardkas/kaspa-rpc");
  const localnet = await import("@hardkas/localnet");
  out.classes = Object.fromEntries(
    [
      ["JsonWrpcKaspaClient", rpc.JsonWrpcKaspaClient],
      ["KaspaJsonRpcClient", rpc.KaspaJsonRpcClient],
      ["LoadBalancedRpcProvider", rpc.LoadBalancedRpcProvider],
      ["MockKaspaRpcClient", rpc.MockKaspaRpcClient],
      ["LocalnetSimulatedProvider", localnet.LocalnetSimulatedProvider]
    ].map(([n, cls]) => [n, typeof cls === "function" ? members(cls) : "NOT_EXPORTED"])
  );
  out.mentions = Object.fromEntries(["@hardkas/kaspa-rpc", "@hardkas/localnet", "@hardkas/sdk", "@hardkas/cli"].map((n) => [n, mentionsIn(n)]));

  // kept behaviour
  out.mockGetInfo = plain(await new rpc.MockKaspaRpcClient().getInfo());
  const lb = new rpc.LoadBalancedRpcProvider([new rpc.MockKaspaRpcClient(), new rpc.MockKaspaRpcClient()]);
  out.loadBalancedGetInfo = plain(await lb.getInfo());
  await lb.close();
  try {
    const c = new rpc.JsonWrpcKaspaClient({ rpcUrl: "ws://127.0.0.1:1", timeoutMs: 1000 });
    await c.getInfo();
    out.closedPort = "RESOLVED";
    await c.close();
  } catch (e) {
    out.closedPort = errOf(e);
  }
  out.kaspaWrpcClient = typeof rpc.KaspaWrpcClient;

  const sdk = await import("@hardkas/sdk");
  const hk = await sdk.Hardkas.open({ cwd: tmp });
  out.sdk = { network: hk.network, rpcClass: hk.rpc?.constructor?.name ?? null, rpcRemoved: hk.rpc ? REMOVED.filter((m) => m in Object.getPrototypeOf(hk.rpc)) : null };
  try {
    out.sdk.rpcGetInfo = plain(await hk.rpc.getInfo());
  } catch (e) {
    out.sdk.rpcGetInfo = errOf(e);
  }

  const tk = await import("@hardkas/toolkit");
  const wallet = tk.WalletToolkit.open("probe", { storePath: path.join(tmp, "w.json") });
  wallet.receive = async () => "kaspasim:qprobe";
  try {
    const h = await wallet.watch(() => {});
    out.toolkitWatchWithoutNode = "RESOLVED";
    await h.unwatch?.();
  } catch (e) {
    out.toolkitWatchWithoutNode = e?.code ?? errOf(e);
  }
  out.txBuilderCreateUtxoContext = typeof (await import("@hardkas/tx-builder")).createUtxoContext;
} catch (e) {
  out.fatal = String(e?.stack ?? e).slice(0, 600);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(JSON.stringify(out));
process.exit(0);
