// ENDPOINT-AUTHORITY-1 test adaptation, round 2: EL-2 plans and signs for the network the send runs on (simnet, as
// wave1-3-b2 does), instead of relabelling the artifact (which breaks its lineage: LINEAGE_NETWORK_MISMATCH).
import fs from "node:fs";
const T = "C:/Users/jrodr/hkl1/ea/src/packages/sdk/test";
const FROM =
  '    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });\n' +
  '    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" } as any);\n' +
  '    const signed = asBroadcastable(await sdk.tx.sign(plan as any, "alice"), "simnet");\n' +
  '    asRpcInstance(sdk, LOOPBACK, "simnet");\n';
const TO =
  '    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });\n' +
  "    // ENDPOINT-AUTHORITY-1 (EA-I3): planned and signed for the network the send runs on\n" +
  '    Object.defineProperty(sdk, "network", { get: () => "simnet", configurable: true });\n' +
  '    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "1" } as any);\n' +
  '    const signed = asBroadcastable(await sdk.tx.sign(plan as any, "alice"));\n' +
  '    asRpcInstance(sdk, LOOPBACK, "simnet");\n';
const HARD_FROM =
  '    await expect(sendAsRpc(sdk, invalidSigned as any, "http://127.0.0.1:16110")).rejects.toThrow(';
const HARD_TO =
  "    // (an RPC instance of its own: the simulator branch is asserted on `sdk` below)\n" +
  '    await expect(sendAsRpc(await Hardkas.open({ cwd: tmpDir }), invalidSigned as any, "http://127.0.0.1:16110")).rejects.toThrow(';
const plans = {
  "event-ledger-2-submission.test.ts": [[FROM, TO, 1]],
  "event-ledger-2-effect.test.ts": [[FROM, TO, 1]],
  "hardening.test.ts": [[HARD_FROM, HARD_TO, 1]]
};
let failures = 0;
for (const [file, edits] of Object.entries(plans)) {
  const p = `${T}/${file}`;
  let src = fs.readFileSync(p, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const norm = (x) => (eol === "\r\n" ? x.replace(/\n/g, "\r\n") : x);
  let ok = true;
  for (const [from, to, n] of edits) {
    const c = src.split(norm(from)).length - 1;
    if (c !== n) {
      console.log(`ABORT ${file}: expected ${n}, found ${c}`);
      ok = false;
      break;
    }
    src = src.split(norm(from)).join(norm(to));
  }
  if (!ok) {
    failures++;
    continue;
  }
  fs.writeFileSync(p, src);
  console.log(`ok ${file}`);
}
process.exit(failures ? 1 : 0);
