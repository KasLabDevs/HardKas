// Snapshot of the localnet containers as found, in UTF-8 (PowerShell 5.1 `>` writes UTF-16).
// usage: node snapshot-docker.mjs <dir> <tag>   → <dir>/miner-<tag>.json (docker inspect of the miner,
// when it exists), <dir>/node-<tag>.json (same for the node), <dir>/docker-ps-<tag>.txt
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const [dir, tag] = process.argv.slice(2);
fs.mkdirSync(dir, { recursive: true });
const inspect = (name) => {
  try {
    return execFileSync("docker", ["inspect", name], { stdio: ["ignore", "pipe", "ignore"] }).toString();
  } catch {
    return null;
  }
};
for (const [label, name] of [["miner", "hardkas-toccata-miner"], ["node", "hardkas-kaspad-toccata-v2"]]) {
  const j = inspect(name);
  const file = path.join(dir, `${label}-${tag}.json`);
  if (j) fs.writeFileSync(file, j);
  const parsed = j ? JSON.parse(j)[0] : null;
  console.log(`${label}: ${parsed ? `${parsed.Id.slice(0, 12)} ${parsed.State.Status} exit=${parsed.State.ExitCode} image=${parsed.Config.Image.slice(0, 40)} network=${parsed.HostConfig.NetworkMode.slice(0, 22)} cmd=${(parsed.Config.Cmd ?? []).join(" ")}` : "absent"}`);
}
const ps = execFileSync("docker", ["ps", "-a", "--no-trunc", "--format", "{{.ID}} {{.Names}} | {{.Status}} | {{.Image}}"]).toString();
fs.writeFileSync(path.join(dir, `docker-ps-${tag}.txt`), ps);
console.log(ps.trim());
