// SECURITY-INTEGRATION-1 · MG onto NNI+EA: the top of tx.send. Resolution = MG's mainnet assertion first (before
// anything), then EA's simulator/explicit-URL decision (EA-I4). The pre-EA `isExplicitRpc` lines on MG's side are the
// base code EA replaced; they are not reintroduced.
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
const ours = s.slice(s.indexOf(eol, start) + eol.length, mid); // EA
const theirs = s.slice(s.indexOf(eol, mid) + eol.length, end); // MG
const mgEnd = theirs.indexOf("    const isExplicitRpc =");
if (!ours.includes("SEND_ENDPOINT_ON_SIMULATOR") || !theirs.includes("assertMainnetTransactionsDisabled(") || mgEnd < 0) {
  console.log("ABORT: unexpected sides");
  process.exit(1);
}
const mgGuard = theirs.slice(0, mgEnd);
const merged = mgGuard + ours;
const afterEnd = s.indexOf(eol, end) + eol.length;
s = s.slice(0, start) + merged + s.slice(afterEnd);
fs.writeFileSync(p, s);
console.log("resolved; markers left:", (s.match(/^(<<<<<<<|=======|>>>>>>>)/gm) || []).length, "; isExplicitRpc refs:", (s.match(/isExplicitRpc/g) || []).length);
