// WORKSPACE-AUTHORITY-2 · reviewer's hold, item 2, the one per-call path with no account/world check of its own:
// `createConsolidationPlan({ account, selectedUtxos, destination, network })` on a SIMULATED instance, with an explicit
// account OBJECT of another world (external-wallet, simnet) and caller-supplied real UTXOs. Does a cross-world plan come
// out? And the same identity through `tx.plan` with the `networkProfile` override (the check must run first).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const { Hardkas } = await import("file:///C:/Users/jrodr/AppData/Local/Temp/hk-ra/wt/packages/sdk/dist/index.js");
const { expectedScriptPublicKeyHex } = await import("file:///C:/Users/jrodr/AppData/Local/Temp/hk-ra/wt/packages/artifacts/dist/index.js");
const T = 'targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" }, localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } }';
const FROM = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
const TO = "kaspasim:qrrqglu5g8kh6mfsg4qxa9wq0nv9cauwfwxw70984wkqnw2uwz0w27rvnw0sc";
const script = (a) => expectedScriptPublicKeyHex(a);
const UTXOS = [
  { outpoint: { transactionId: "a".repeat(64), index: 0 }, address: FROM, amountSompi: 1_000_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1000n, isCoinbase: false },
  { outpoint: { transactionId: "b".repeat(64), index: 1 }, address: FROM, amountSompi: 500_000_000n, scriptPublicKey: script(FROM), blockDaaScore: 1200n, isCoinbase: false }
];
const d = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wa2-cons-"));
fs.writeFileSync(path.join(d, "hardkas.config.ts"), `export default { execution: { default: "simulator", ${T} }, network: { allowPublic: false } };\n`);
fs.mkdirSync(path.join(d, ".hardkas"));
const out = (p) => p.then((v) => ({ kind: "ok", ...v }), (e) => ({ kind: "refused", code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 220) }));
const pick = (p) => ({ mode: p.mode, networkId: p.networkId, execution: p.execution, from: p.from?.address, to: p.to?.address, authority: p.ctx?.plannerAuthority ?? p.plannerAuthority ?? null, inputs: p.inputs?.length, planId: p.planId ? String(p.planId).slice(0, 12) : null });
const log = (label, v) => console.log(label + " -> " + JSON.stringify(v));
const sdk = await Hardkas.open({ cwd: d });
log("instance", { network: sdk.network, mode: sdk.execution.mode, provider: sdk.rpc.constructor.name });
const external = { name: FROM, kind: "external-wallet", network: "simnet", address: FROM };
log("P1 createConsolidationPlan({ account: <external-wallet simnet OBJECT>, real utxos, network: 'simnet' })", await out(sdk.tx.createConsolidationPlan({ account: external, selectedUtxos: UTXOS, destination: TO, network: "simnet" }).then(pick)));
log("P2 createConsolidationPlan({ account: <same object>, real utxos, NO network })", await out(sdk.tx.createConsolidationPlan({ account: external, selectedUtxos: UTXOS, destination: TO }).then(pick)));
log("P3 createConsolidationPlan({ account: 'alice' (resolved in the instance's world), real utxos, network: 'simnet' })", await out(sdk.tx.createConsolidationPlan({ account: "alice", selectedUtxos: UTXOS, destination: TO, network: "simnet" }).then(pick)));
log("P4 tx.plan({ from: <external-wallet simnet OBJECT>, networkProfile: 'simnet' })", await out(sdk.tx.plan({ from: external, to: TO, amount: "1", networkProfile: "simnet" }).then(pick)));
log("P5 tx.plan({ from: <external-wallet simnet OBJECT> }) (no override)", await out(sdk.tx.plan({ from: external, to: TO, amount: "1" }).then(pick)));
const tree = [];
const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); tree.push(path.relative(d, p)); if (e.isDirectory()) walk(p); } };
walk(d);
log("workspace entries", { count: tree.length, entries: tree });
await sdk.close();
fs.rmSync(d, { recursive: true, force: true });
