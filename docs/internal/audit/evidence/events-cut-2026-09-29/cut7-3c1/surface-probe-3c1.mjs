// Surface Cut 3c-1 · packed-consumer probe, run INSIDE an external consumer (cwd = consumer dir;
// ESM resolves from the script's location, so the script is copied there). No node needed.
// The removed surface:
//  - @hardkas/kaspa-rpc/internal/resilient-subscriber: does it resolve, what does it export;
//  - @hardkas/toolkit: is WalletSubscriptionManager exported; which packed files mention the
//    removed names (js, d.ts, maps).
// What must not change (3b and 3c-2 territory):
//  - WalletToolkit.watch() without a node still fails with WALLET_WATCH_REQUIRES_NODE;
//  - createUtxoContext still exported by @hardkas/tx-builder;
//  - the KaspaRpcClient subscription members still on JsonWrpcKaspaClient and MockKaspaRpcClient.
// Everything is written under the OS temp dir. usage: node surface-probe-3c1.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const out = {};
const errOf = (e) => e?.code ?? String(e?.message ?? e).slice(0, 160);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-3c1-probe-"));
const NAMES = ["ResilientSubscriptionClient", "resilient-subscriber", "WalletSubscriptionManager", "WalletWatchHandler", "WalletSubscriptionEvent"];
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
try {
  // removed surface
  try {
    const m = await import("@hardkas/kaspa-rpc/internal/resilient-subscriber");
    out.resilientSubpath = { resolves: true, exports: Object.keys(m).sort() };
  } catch (e) {
    out.resilientSubpath = { resolves: false, error: errOf(e) };
  }
  const rpcPkg = JSON.parse(fs.readFileSync(path.join(pkgDir("@hardkas/kaspa-rpc"), "package.json"), "utf8"));
  out.kaspaRpcExportKeys = Object.keys(rpcPkg.exports ?? {}).sort();
  out.kaspaRpcDistInternal = fs.existsSync(path.join(pkgDir("@hardkas/kaspa-rpc"), "dist", "internal"))
    ? fs.readdirSync(path.join(pkgDir("@hardkas/kaspa-rpc"), "dist", "internal")).sort()
    : null;
  out.kaspaRpcMentions = mentionsIn("@hardkas/kaspa-rpc");

  const tk = await import("@hardkas/toolkit");
  out.toolkitExportsManager = "WalletSubscriptionManager" in tk;
  out.toolkitDistFiles = fs.readdirSync(path.join(pkgDir("@hardkas/toolkit"), "dist")).filter((f) => f.startsWith("subscriptions"));
  out.toolkitMentions = mentionsIn("@hardkas/toolkit");

  // what must not change
  const wallet = tk.WalletToolkit.open("probe", { storePath: path.join(tmp, "w.json") });
  wallet.receive = async () => "kaspasim:qprobe";
  try {
    const h = await wallet.watch(() => {});
    out.toolkitWatchWithoutNode = "RESOLVED";
    await h.unwatch?.();
  } catch (e) {
    out.toolkitWatchWithoutNode = errOf(e);
  }
  const tx = await import("@hardkas/tx-builder");
  out.txBuilderCreateUtxoContext = typeof tx.createUtxoContext;
  const rpc = await import("@hardkas/kaspa-rpc");
  const members = ["subscribeToUtxosChanged", "subscribeToVirtualChainChanged", "on", "off"];
  out.kaspaRpcSubscriptionMembers = Object.fromEntries(
    ["JsonWrpcKaspaClient", "MockKaspaRpcClient"].map((cls) => [cls, members.filter((m) => typeof rpc[cls]?.prototype?.[m] === "function")])
  );
} catch (e) {
  out.fatal = String(e?.stack ?? e).slice(0, 500);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(JSON.stringify(out));
process.exit(0);
