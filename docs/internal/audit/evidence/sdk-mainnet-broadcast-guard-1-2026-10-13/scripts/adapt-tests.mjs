// SDK-MAINNET-BROADCAST-GUARD-1: tests that pinned the old untyped mainnet messages now pin the typed policy codes.
import fs from "node:fs";
const P = "C:/Users/jrodr/hkl1/mg/src/packages";
const plans = {
  "accounts/test/signer.test.ts": [
    ["    ).rejects.toThrow(/Mainnet signing is disabled by default/);\n", "    ).rejects.toMatchObject({ code: \"MAINNET_SIGNING_DISABLED\" });\n", 1],
    ["    ).rejects.not.toThrow(/Mainnet signing is disabled by default/);\n", "    ).rejects.not.toThrow(/Mainnet signing is disabled/);\n", 1]
  ],
  "cli/test/account-hardening.test.ts": [
    ["    ).rejects.toThrow(\"Mainnet signing is blocked\");\n", "    ).rejects.toMatchObject({ code: \"MAINNET_SIGNING_DISABLED\" });\n", 1]
  ],
  "cli/test/broadcast-guard.test.ts": [
    ["/Mainnet broadcast is disabled in HardKAS 0.12.0-rc.27/", "/Mainnet broadcast is disabled in HardKAS/", 3],
    ["it(\"should block mainnet (always rejected in 0.12.0-rc.27)\", () => {", "it(\"should block mainnet (always rejected: MAINNET_BROADCAST_DISABLED)\", () => {", 1],
    [
      "  it(\"should fail on network mismatch\", () => {",
      "  it(\"the refusal is typed MAINNET_BROADCAST_DISABLED (the policy shared with the SDK)\", () => {\n" +
        "    let err: any;\n" +
        "    try {\n" +
        "      assertBroadcastNetworkAllowed({ artifactNetworkId: \"mainnet\", selectedNetwork: \"mainnet\" });\n" +
        "    } catch (e) {\n" +
        "      err = e;\n" +
        "    }\n" +
        "    expect(err?.code).toBe(\"MAINNET_BROADCAST_DISABLED\");\n" +
        "  });\n\n" +
        "  it(\"should fail on network mismatch\", () => {",
      1
    ]
  ]
};
let failures = 0;
for (const [file, edits] of Object.entries(plans)) {
  const p = `${P}/${file}`;
  let s = fs.readFileSync(p, "utf8");
  const eol = s.includes("\r\n") ? "\r\n" : "\n";
  const n = (x) => (eol === "\r\n" ? x.replace(/\n/g, "\r\n") : x);
  let ok = true;
  for (const [from, to, cnt] of edits) {
    const c = s.split(n(from)).length - 1;
    if (c !== cnt) {
      console.log(`ABORT ${file}: expected ${cnt}, found ${c} for ${JSON.stringify(from.slice(0, 70))}`);
      ok = false;
      break;
    }
    s = s.split(n(from)).join(n(to));
  }
  if (!ok) {
    failures++;
    continue;
  }
  fs.writeFileSync(p, s);
  console.log(`ok ${file}`);
}
process.exit(failures ? 1 : 0);
