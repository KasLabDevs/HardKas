// WORKSPACE-AUTHORITY-2 · probe of the two outcomes the BEFORE run left implicit (run with the built SDK, no network):
//  A5: a target NAME given as `network` once allowPublic is on — what refuses it, if anything;
//  A7: downstream of the mixed plan (simulator plan over a kaspa identity): sign, send, balance.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
const { Hardkas } = await import("file:///C:/Users/jrodr/AppData/Local/Temp/hk-ra/wt/packages/sdk/dist/index.js");
const T = 'targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" }, localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } }';
const ws = (body) => {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wa2-p-"));
  fs.writeFileSync(path.join(d, "hardkas.config.ts"), body);
  fs.mkdirSync(path.join(d, ".hardkas"));
  return d;
};
const out = (p) => p.then((v) => ({ kind: "ok", ...v }), (e) => ({ kind: "refused", code: e?.code ?? null, message: String(e?.message ?? e).slice(0, 320) }));
{
  const d = ws(`export default { execution: { default: "simulator", ${T} }, network: { allowPublic: true } };\n`);
  const r = await out(Hardkas.open({ cwd: d, network: "localnet" }).then(async (s) => { const v = { network: s.network, provider: s.rpc.constructor.name }; await s.close(); return v; }));
  console.log("A5 allowPublic:true network=localnet ->", JSON.stringify(r));
  fs.rmSync(d, { recursive: true, force: true });
}
{
  const d = ws(`export default { execution: { default: "localnet", ${T} }, network: { allowPublic: false } };\n`);
  const s = await Hardkas.open({ cwd: d });
  const plan = await s.tx.plan({ from: "alice", to: "bob", amount: "1" });
  console.log("A7 plan ->", JSON.stringify({ mode: plan.mode, networkId: plan.networkId, from: plan.from?.address, to: plan.to?.address, inputs: plan.inputs?.length, amount: plan.amountSompi, fee: plan.estimatedFeeSompi, authority: plan.ctx?.plannerAuthority ?? plan.plannerAuthority ?? null }));
  const signed = await out(s.tx.sign(plan, "alice").then((x) => ({ signerAddress: x.signerAddress ?? x.from?.address ?? null, format: x.signedTransaction?.format ?? null, mode: x.mode ?? null })));
  console.log("A7 sign ->", JSON.stringify(signed));
  if (signed.kind === "ok") {
    const sent = await out(s.tx.send(await s.tx.sign(plan, "alice")).then((r) => ({ receipt: Boolean(r?.receipt), mode: r?.mode ?? null, simulated: r?.simulated ?? null, status: r?.receipt?.status ?? null })));
    console.log("A7 send ->", JSON.stringify(sent));
  }
  const bal = await out(s.accounts.balance("alice").then((b) => ({ balance: String(b?.balanceSompi ?? b?.balance ?? b) })));
  console.log("A7 alice balance (as the SDK sees it) ->", JSON.stringify(bal));
  await s.close();
  fs.rmSync(d, { recursive: true, force: true });
}
