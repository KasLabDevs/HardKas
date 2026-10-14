// SECURITY-INTEGRATION-1 · EA onto NNI: the only conflict in sdk/src/tx.ts is the import block. Both sides are kept:
// NNI's isNodeNetworkIdentityError and EA's endpoint helpers + endpointAuthority().
import fs from "node:fs";
const p = "C:/Users/jrodr/hkl1/si/src/packages/sdk/src/tx.ts";
let s = fs.readFileSync(p, "utf8");
const eol = s.includes("\r\n") ? "\r\n" : "\n";
const start = s.indexOf("<<<<<<< ours");
const mid = s.indexOf("=======", start);
const end = s.indexOf(">>>>>>> theirs", mid);
if (start < 0 || mid < 0 || end < 0 || s.indexOf("<<<<<<<", end) >= 0) {
  console.log("ABORT: expected exactly one conflict block");
  process.exit(1);
}
const ours = s.slice(s.indexOf(eol, start) + eol.length, mid);
const theirs = s.slice(s.indexOf(eol, mid) + eol.length, end);
if (ours.trim() !== 'import { isNodeNetworkIdentityError } from "@hardkas/kaspa-rpc";') {
  console.log("ABORT: unexpected ours side:", JSON.stringify(ours));
  process.exit(1);
}
const EA_IMPORT = 'import { rpcEndpointOf, sameRpcEndpoint } from "@hardkas/kaspa-rpc";';
if (!theirs.startsWith(EA_IMPORT)) {
  console.log("ABORT: unexpected theirs side");
  process.exit(1);
}
const merged =
  'import { isNodeNetworkIdentityError, rpcEndpointOf, sameRpcEndpoint } from "@hardkas/kaspa-rpc";' + theirs.slice(EA_IMPORT.length);
const afterEnd = s.indexOf(eol, end) + eol.length;
s = s.slice(0, start) + merged + s.slice(afterEnd);
fs.writeFileSync(p, s);
console.log("resolved; markers left:", (s.match(/^(<<<<<<<|=======|>>>>>>>)/gm) || []).length);
