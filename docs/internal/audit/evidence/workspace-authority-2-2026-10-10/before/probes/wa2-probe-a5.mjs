// WORKSPACE-AUTHORITY-2 · A5 variant: the public guard switched off through the SDK option (`policy.allowPublic`), the
// config untouched — what happens to a target NAME given as `network`.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const { Hardkas } = await import("file:///C:/Users/jrodr/AppData/Local/Temp/hk-ra/wt/packages/sdk/dist/index.js");
const T = 'targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" }, localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } }';
const d = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wa2-p-"));
fs.writeFileSync(path.join(d, "hardkas.config.ts"), `export default { execution: { default: "simulator", ${T} }, network: { allowPublic: false } };\n`);
fs.mkdirSync(path.join(d, ".hardkas"));
const out = (p) => p.then((v) => ({ kind: "ok", ...v }), (e) => ({ kind: "refused", code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 320) }));
const opened = await out(
  Hardkas.open({ cwd: d, network: "localnet", policy: { allowPublic: true } }).then(async (s) => {
    const v = { network: s.network, provider: s.rpc.constructor.name, rpcUrl: s.resolveRpcUrl ? s.resolveRpcUrl() : null };
    let plan = null;
    try {
      const p = await s.tx.plan({ from: "alice", to: "bob", amount: "1" });
      plan = { kind: "ok", mode: p.mode, networkId: p.networkId, from: p.from?.address };
    } catch (e) {
      plan = { kind: "refused", code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 240) };
    }
    const alice = await s.accounts.resolve("alice").then((a) => ({ kind: a.kind, network: a.network ?? null, address: a.address }), (e) => ({ refused: e?.code ?? String(e).slice(0, 120) }));
    await s.close();
    return { ...v, alice, plan };
  })
);
console.log("A5 policy.allowPublic:true network=localnet ->", JSON.stringify(opened));
fs.rmSync(d, { recursive: true, force: true });
