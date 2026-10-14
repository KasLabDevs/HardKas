// WORKSPACE-AUTHORITY-2 · reviewer's hold, item 2 and 3 (built SDK + config, no network):
//  (2) can a per-call override change the execution world silently, or skip the account/world check?
//      - tx.plan({ networkProfile }) · createConsolidationPlan({ network }) · plan({ amount: "all" }) ·
//        observe.address({ target }) · tx.send(signed, "<url>")
//  (3) are target, network id, mode and endpoint coherent between the SDK and the CLI's resolution, legacy included?
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const { Hardkas } = await import("file:///C:/Users/jrodr/AppData/Local/Temp/hk-ra/wt/packages/sdk/dist/index.js");
const config = await import("file:///C:/Users/jrodr/AppData/Local/Temp/hk-ra/wt/packages/config/dist/index.js");
const T = 'targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" }, localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } }';
const CONFIGS = {
  scaffold: `export default { execution: { default: "simulator", ${T} }, network: { allowPublic: false } };\n`,
  localnetDefault: `export default { execution: { default: "localnet", ${T} }, network: { allowPublic: false } };\n`,
  rpcDevnet: `export default { execution: { mode: "rpc", domain: "kaspa-l1", network: "devnet" } };\n`,
  legacySimnet: `export default { defaultNetwork: "simnet" };\n`,
  legacySimulated: `export default { defaultNetwork: "simulated" };\n`,
  customSimnetUrl: `export default { execution: { default: "localnet", ${T} }, networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } } };\n`,
  none: null
};
const ws = (body) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wa2-ov-"));
  if (body) fs.writeFileSync(path.join(d, "hardkas.config.ts"), body);
  fs.mkdirSync(path.join(d, ".hardkas"));
  return d;
};
const out = (p) => p.then((v) => ({ kind: "ok", ...v }), (e) => ({ kind: "refused", code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 200) }));
const pick = (p) => ({ mode: p.mode, networkId: p.networkId, execution: p.execution, from: p.from?.address, authority: p.ctx?.plannerAuthority ?? p.plannerAuthority ?? null, inputs: p.inputs?.length });
const log = (label, v) => console.log(label + " -> " + JSON.stringify(v));

console.log("===== (2) per-call overrides on a SIMULATED instance (scaffold default) =====");
{
  const d = ws(CONFIGS.scaffold);
  const sdk = await Hardkas.open({ cwd: d });
  log("instance", { network: sdk.network, mode: sdk.execution.mode, source: sdk.executionSource, provider: sdk.rpc.constructor.name });
  const base = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" });
  log("control plan", pick(base));
  const written = await sdk.artifacts.write(base);
  log("2a tx.plan({ networkProfile: 'simnet' })", await out(sdk.tx.plan({ from: "alice", to: "bob", amount: "1", networkProfile: "simnet" }).then(pick)));
  log("2b tx.plan({ networkProfile: <an existing artifact id> })", await out(sdk.tx.plan({ from: "alice", to: "bob", amount: "1", networkProfile: base.contentHash }).then(pick)));
  const utxos = await sdk.query.getSpendableUtxos({ address: "kaspa:sim_alice" }).then((r) => r.data, () => []);
  log("alice simulated utxos", { count: utxos.length });
  log("2c createConsolidationPlan({ network: 'simnet' })", await out(sdk.tx.createConsolidationPlan({ account: "alice", selectedUtxos: utxos, destination: "kaspa:sim_bob", network: "simnet" }).then(pick)));
  log("2c' createConsolidationPlan({ network: 'devnet' })", await out(sdk.tx.createConsolidationPlan({ account: "alice", selectedUtxos: utxos, destination: "kaspa:sim_bob", network: "devnet" }).then(pick)));
  log("2d plan({ amount: 'all' }) (consolidation on the instance's network)", await out(sdk.tx.plan({ from: "alice", to: "bob", amount: "all" }).then(pick)));
  log("2e observe.address({ target: 'simnet' })", await out(sdk.observe.address({ address: "kaspa:sim_alice", target: "simnet" }).then((o) => ({ keys: Object.keys(o ?? {}).slice(0, 8), execution: o?.execution ?? o?.target ?? null }))));
  const signed = await sdk.tx.sign(base, "alice");
  log("2f tx.send(simulatorSigned, 'ws://127.0.0.1:1')", await out(sdk.tx.send(signed, "ws://127.0.0.1:1").then((r) => ({ receipt: Boolean(r?.receipt), mode: r?.mode ?? null, submitted: r?.submitted ?? null }))));
  log("2g tx.send(simulatorSigned) (no override; control)", await out(sdk.tx.send(signed).then((r) => ({ receipt: Boolean(r?.receipt), mode: r?.mode ?? r?.receipt?.mode ?? null, simulated: r?.simulated ?? null }))));
  await sdk.close();
  fs.rmSync(d, { recursive: true, force: true });
}

console.log("===== (3) coherence SDK vs CLI resolution: target, network id, mode, endpoint =====");
const cases = [
  ["scaffold", {}], ["scaffold", { network: "simnet" }], ["scaffold", { target: "localnet" }], ["scaffold", { network: "devnet" }],
  ["localnetDefault", {}], ["localnetDefault", { network: "simulated" }], ["localnetDefault", { target: "simulator" }],
  ["rpcDevnet", {}], ["legacySimnet", {}], ["legacySimulated", {}], ["customSimnetUrl", {}], ["none", {}], ["none", { network: "simnet" }]
];
for (const [name, override] of cases) {
  const d = ws(CONFIGS[name]);
  const loaded = await config.loadHardkasConfig({ cwd: d, workspaceRoot: d });
  const cliSide = await out(Promise.resolve().then(() => {
    const r = config.resolveWorkspaceExecution({ config: loaded.config, ...override });
    const networkDef = loaded.config.networks?.[r.networkId];
    const provider = config.resolveProvider({ network: r.networkId, configNetworkKind: networkDef?.kind, executionMode: r.execution.mode });
    return { target: r.targetName ?? null, network: r.networkId, mode: r.execution.mode, source: r.source, endpoint: provider.mode === "simulator" ? "(simulator)" : (provider.endpoint ?? networkDef?.rpcUrl ?? "(default)") };
  }));
  const sdkSide = await out(Hardkas.open({ cwd: d, ...override }).then(async (s) => {
    const v = { target: override.target ?? null, network: s.network, mode: s.execution.mode, source: s.executionSource, endpoint: s.execution.mode === "simulator" ? "(simulator)" : s.resolveRpcUrl(), mirror: s.config.config.defaultNetwork };
    await s.close();
    return v;
  }));
  const same = cliSide.kind === sdkSide.kind && cliSide.network === sdkSide.network && cliSide.mode === sdkSide.mode && cliSide.source === sdkSide.source;
  log(`${name} ${JSON.stringify(override)} · same=${same}`, { cli: cliSide, sdk: sdkSide });
  fs.rmSync(d, { recursive: true, force: true });
}
