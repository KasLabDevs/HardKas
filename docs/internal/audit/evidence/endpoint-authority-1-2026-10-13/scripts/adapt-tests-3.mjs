// ENDPOINT-AUTHORITY-1 test adaptation, round 3: the two CLI demo-cut files reach send()'s real branch the same way.
import fs from "node:fs";
const T = "C:/Users/jrodr/hkl1/ea/src/packages/cli/test";
const plans = {
  "demo-cut-t-a14b-tx-status.test.ts": ['    const sent: any = await sdk.tx.send(s, "http://127.0.0.1:16110");\n', '    const sent: any = await sendAsRpc(sdk, s, "http://127.0.0.1:16110");\n'],
  "demo-cut-t-a14b-no-false-claims.test.ts": ['    const sent: any = await sdk.tx.send(s, "http://127.0.0.1:16110");\n', '    const sent: any = await sendAsRpc(sdk, s, "http://127.0.0.1:16110");\n']
};
const IMPORT = 'import { sendAsRpc } from "../../sdk/test/helpers/rpc-instance.js";';
let failures = 0;
for (const [file, [from, to]] of Object.entries(plans)) {
  const p = `${T}/${file}`;
  let src = fs.readFileSync(p, "utf8");
  const eol = src.includes("\r\n") ? "\r\n" : "\n";
  const f = eol === "\r\n" ? from.replace(/\n/g, "\r\n") : from;
  const c = src.split(f).length - 1;
  if (c !== 1) {
    console.log(`ABORT ${file}: found ${c}`);
    failures++;
    continue;
  }
  src = src.split(f).join(eol === "\r\n" ? to.replace(/\n/g, "\r\n") : to);
  const lines = src.split(eol);
  let last = -1;
  lines.forEach((l, i) => {
    if (/^import .* from ".*";$/.test(l)) last = i;
  });
  lines.splice(last + 1, 0, IMPORT);
  fs.writeFileSync(p, lines.join(eol));
  console.log(`ok ${file}`);
}
process.exit(failures ? 1 : 0);
