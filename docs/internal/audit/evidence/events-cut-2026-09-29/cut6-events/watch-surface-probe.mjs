// Surface Cut 3b · packed-consumer probe of the watch contract, run INSIDE an external consumer
// (cwd = consumer dir; ESM resolves from the script's location, so the script is copied there).
// No node needed:
//  - @hardkas/toolkit WalletToolkit.watch() without a node endpoint;
//  - @hardkas/sdk on its default (simulated) network: hk.wallet.open(...).watch();
//  - the packed type declarations of toolkit and tx-builder (new watch/resync surface).
// Everything is written under the OS temp dir. usage: node watch-surface-probe.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const out = {};
const errOf = (e) => e?.code ?? String(e?.message ?? e).slice(0, 140);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "hk-3b-probe-"));
try {
  const tk = await import("@hardkas/toolkit");
  const wallet = tk.WalletToolkit.open("probe", { storePath: path.join(tmp, "w.json") });
  wallet.receive = async () => "kaspasim:qprobe";
  try {
    const h = await wallet.watch(() => {});
    out.toolkitWithoutNode = "RESOLVED";
    await h.unwatch?.();
  } catch (e) {
    out.toolkitWithoutNode = errOf(e);
  }

  const sdk = await import("@hardkas/sdk");
  const hk = await sdk.Hardkas.open({ cwd: tmp });
  out.sdkNetwork = hk.network;
  const w2 = hk.wallet.open("probe2", { storePath: path.join(tmp, "w2.json") });
  w2.receive = async () => "kaspasim:qprobe";
  try {
    const h = await w2.watch(() => {});
    out.sdkSimulatedWatch = "RESOLVED (never fires)";
    await h.unwatch?.();
  } catch (e) {
    out.sdkSimulatedWatch = errOf(e);
  }

  const dtsOf = (pkg) => {
    const dir = fs.realpathSync(path.join(process.cwd(), "node_modules", ...pkg.split("/"), "dist"));
    const files = [];
    (function walk(d) {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p);
        else if (p.endsWith(".d.ts")) files.push(fs.readFileSync(p, "utf8"));
      }
    })(dir);
    return files.join("\n");
  };
  const toolkitDts = dtsOf("@hardkas/toolkit");
  const txDts = dtsOf("@hardkas/tx-builder");
  out.toolkitDeclares = Object.fromEntries(["WalletWatchHandle", "WalletWatchEvent", "resync", "rpcUrl", "WalletSubscriptionManager"].map((n) => [n, toolkitDts.includes(n)]));
  out.txBuilderDeclares = Object.fromEntries(["onResync", "resyncing", "onError", "createUtxoContext"].map((n) => [n, txDts.includes(n)]));
} catch (e) {
  out.fatal = String(e?.stack ?? e).slice(0, 400);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}
console.log(JSON.stringify(out));
process.exit(0);
