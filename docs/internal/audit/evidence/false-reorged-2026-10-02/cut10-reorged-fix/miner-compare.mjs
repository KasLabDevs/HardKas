// Is the demo miner container still the one snapshotted before run 1 (image + arguments)?
// Reads the snapshot the same way reorged-record.mjs does (UTF-16/BOM aware).
// usage: node miner-compare.mjs <miner-before.json>
import { execFileSync } from "node:child_process";
import fs from "node:fs";

function readSnapshot(file) {
  const buf = fs.readFileSync(file);
  let text = buf[0] === 0xff && buf[1] === 0xfe ? buf.subarray(2).toString("utf16le") : buf.toString("utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return JSON.parse(text);
}
const before = readSnapshot(process.argv[2])[0];
const now = JSON.parse(execFileSync("docker", ["inspect", "hardkas-toccata-miner"]).toString())[0];
const out = {
  imageBefore: before.Config.Image,
  imageNow: now.Config.Image,
  sameImage: before.Config.Image === now.Config.Image,
  sameCmd: JSON.stringify(before.Config.Cmd) === JSON.stringify(now.Config.Cmd),
  cmdNow: now.Config.Cmd.join(" "),
  networkNow: now.HostConfig.NetworkMode,
  stateNow: now.State.Status
};
console.log(JSON.stringify(out, null, 2));
