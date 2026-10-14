// ENDPOINT-AUTHORITY-1: adapt the hermetic send tests to the decided contract (EA-I2/EA-I3/EA-I4).
// Exact from -> to replacements with expected counts; aborts (writes nothing for that file) on any count mismatch.
import fs from "node:fs";
import path from "node:path";

const T = "C:/Users/jrodr/hkl1/ea/src/packages/sdk/test";
const IMPORT_TOP = (rel) => `import { asRpcInstance, sendAsRpc } from "${rel}helpers/rpc-instance.js";\n`;
const BROADCASTABLE_FROM = "function asBroadcastable(signed: any): any {\n  const s: any = structuredClone(signed);\n";
const BROADCASTABLE_TO =
  "// ENDPOINT-AUTHORITY-1 (EA-I3): the re-issued artifact is for the network the instance sends on\n" +
  "function asBroadcastable(signed: any, network?: string): any {\n  const s: any = structuredClone(signed);\n  if (network) s.networkId = network;\n";

const plans = {
  "event-ledger-2-submission.test.ts": {
    rel: "./",
    edits: [
      [BROADCASTABLE_FROM, BROADCASTABLE_TO, 1],
      [
        '    const signed = asBroadcastable(await sdk.tx.sign(plan as any, "alice"));\n    Object.defineProperty(sdk, "network", { get: () => "simnet", configurable: true });\n',
        '    const signed = asBroadcastable(await sdk.tx.sign(plan as any, "alice"), "simnet");\n    asRpcInstance(sdk, LOOPBACK, "simnet");\n',
        1
      ],
      [
        "    vi.spyOn(sdk.tx, \"send\").mockImplementation((signed: any) => realSend(asBroadcastable(signed), LOOPBACK));\n",
        "    vi.spyOn(sdk.tx, \"send\").mockImplementation((signed: any) => {\n      asRpcInstance(sdk, LOOPBACK, \"simnet\");\n      return realSend(asBroadcastable(signed, \"simnet\"), LOOPBACK);\n    });\n",
        1
      ]
    ]
  },
  "event-ledger-2-effect.test.ts": {
    rel: "./",
    edits: [
      [BROADCASTABLE_FROM, BROADCASTABLE_TO, 1],
      [
        '    const signed = asBroadcastable(await sdk.tx.sign(plan as any, "alice"));\n    Object.defineProperty(sdk, "network", { get: () => "simnet", configurable: true });\n',
        '    const signed = asBroadcastable(await sdk.tx.sign(plan as any, "alice"), "simnet");\n    asRpcInstance(sdk, LOOPBACK, "simnet");\n',
        1
      ]
    ]
  },
  "adversarial/wave1-3-b2-workflow-rejected-send.test.ts": {
    rel: "../",
    edits: [
      [BROADCASTABLE_FROM, BROADCASTABLE_TO, 1],
      [
        "  vi.spyOn(sdk.tx, \"send\").mockImplementation((signed: any) => realSend(asBroadcastable(signed), LOOPBACK));\n",
        "  vi.spyOn(sdk.tx, \"send\").mockImplementation((signed: any) => {\n    asRpcInstance(sdk, LOOPBACK, \"simnet\");\n    return realSend(asBroadcastable(signed, \"simnet\"), LOOPBACK);\n  });\n",
        1
      ]
    ]
  },
  "evidence-trust-1.test.ts": {
    rel: "./",
    edits: [
      ["    const sent: any = await sdk.tx.send(signed, rpcUrl);\n", "    const sent: any = await sendAsRpc(sdk, signed, rpcUrl);\n", 1],
      [
        '      const sent: any = await sdk.tx.send(signed, "http://127.0.0.1:16110/?token=ET1SECRETTOKEN");\n',
        '      const sent: any = await sendAsRpc(sdk, signed, "http://127.0.0.1:16110/?token=ET1SECRETTOKEN");\n',
        1
      ]
    ]
  },
  "evidence-trust-1-contract.test.ts": {
    rel: "./",
    edits: [
      [
        '    const sent: any = await sdk.tx.send(signed, "https://op:ET1PASS@node.example:17110/?token=ET1TOKEN&network=testnet-10");\n',
        '    const sent: any = await sendAsRpc(sdk, signed, "https://op:ET1PASS@node.example:17110/?token=ET1TOKEN&network=testnet-10");\n',
        1
      ]
    ]
  },
  "adversarial/wave1-3-producers.test.ts": {
    rel: "../",
    edits: [
      ['    const sent: any = await sdk.tx.send(signed, "http://127.0.0.1:16110/?token=secret");\n', '    const sent: any = await sendAsRpc(sdk, signed, "http://127.0.0.1:16110/?token=secret");\n', 1],
      ['    const sent: any = await sdk.tx.send(signed, "http://127.0.0.1:16110");\n', '    const sent: any = await sendAsRpc(sdk, signed, "http://127.0.0.1:16110");\n', 1],
      ['    const first: any = await sdk.tx.send(signed, "http://127.0.0.1:16110");\n', '    const first: any = await sendAsRpc(sdk, signed, "http://127.0.0.1:16110");\n', 1]
    ]
  },
  "adversarial/wave2-a-tx-observer.test.ts": {
    rel: "../",
    edits: [['    const sent: any = await sdk.tx.send(s, "http://127.0.0.1:16110");\n', '    const sent: any = await sendAsRpc(sdk, s, "http://127.0.0.1:16110");\n', 1]]
  },
  "reorged-acceptance-churn.test.ts": {
    rel: "./",
    edits: [['    const sent: any = await sdk.tx.send(s, "http://127.0.0.1:16110");\n', '    const sent: any = await sendAsRpc(sdk, s, "http://127.0.0.1:16110");\n', 1]]
  },
  "hardening.test.ts": {
    rel: "./",
    edits: [['    await expect(sdk.tx.send(invalidSigned as any, "http://127.0.0.1:16110")).rejects.toThrow(', '    await expect(sendAsRpc(sdk, invalidSigned as any, "http://127.0.0.1:16110")).rejects.toThrow(', 1]]
  }
};

const count = (s, sub) => s.split(sub).length - 1;
let failures = 0;
for (const [file, plan] of Object.entries(plans)) {
  const p = path.join(T, file);
  let src = fs.readFileSync(p, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const norm = (x) => (eol === "\r\n" ? x.replace(/\n/g, "\r\n") : x);
  let ok = true;
  for (const [from, to, n] of plan.edits) {
    const c = count(src, norm(from));
    if (c !== n) {
      console.log(`ABORT ${file}: expected ${n} of ${JSON.stringify(from.slice(0, 70))}, found ${c}`);
      ok = false;
      break;
    }
    src = src.split(norm(from)).join(norm(to));
  }
  if (!ok) {
    failures++;
    continue;
  }
  // the import, after the last import line
  const lines = src.split(eol);
  let last = -1;
  lines.forEach((l, i) => {
    if (/^import .* from ".*";$/.test(l)) last = i;
  });
  lines.splice(last + 1, 0, IMPORT_TOP(plan.rel).trimEnd());
  fs.writeFileSync(p, lines.join(eol));
  console.log(`ok ${file}`);
}
process.exit(failures ? 1 : 0);
