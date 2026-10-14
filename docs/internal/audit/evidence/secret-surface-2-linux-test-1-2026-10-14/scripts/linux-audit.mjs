// SECRET-SURFACE-2-LINUX-TEST-1 · Linux reproduction (runs INSIDE a Linux container, --network none):
// the built HardKAS CLI of the isolated tree (mounted read-only at /w) runs `security audit` on the three fixtures of
// the test case: the fixture as written today (no mode: the umask decides), the corrected one (0600), and the new
// negative one (0644). pnpm's Windows junctions appear under Linux as symlinks to the Docker Desktop host path of the
// tree (/mnt/host/c/...); that one path is recreated in the container as a link to the mount, so the exact pnpm layout
// resolves unchanged (nothing is flattened, nothing is written to the tree).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const W = "/w";
const OUT = process.argv[2] ?? "/h/linux-audit-results.json";
const HOST_TREE = process.env.HOST_TREE; // e.g. /mnt/host/c/Users/jrodr/hkl1/ssl/src
if (!HOST_TREE) throw new Error("HOST_TREE is required");
fs.mkdirSync(path.dirname(HOST_TREE), { recursive: true });
if (!fs.existsSync(HOST_TREE)) fs.symlinkSync(W, HOST_TREE, "dir");

const HEX = "ab".repeat(32);
const cli = path.join(W, "packages", "cli", "dist", "index.js");
const home = fs.mkdtempSync(path.join(os.tmpdir(), "hk-home-"));
function audit(fixture) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ss2-after-"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};");
  const key = path.join(ws, ".hardkas", "dev-accounts", "keys", "alice.key");
  fs.mkdirSync(path.dirname(key), { recursive: true });
  fs.writeFileSync(key, HEX);
  if (fixture.mode !== undefined) fs.chmodSync(key, fixture.mode);
  const mode = "0" + (fs.statSync(key).mode & 0o777).toString(8);
  const r = spawnSync(process.execPath, [cli, "security", "audit"], {
    cwd: ws,
    encoding: "utf8",
    env: { PATH: process.env.PATH, HOME: home, HARDKAS_HOME: home, NO_COLOR: "1" },
    input: "",
    timeout: 120_000
  });
  const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  fs.rmSync(ws, { recursive: true, force: true });
  return {
    fixture: fixture.name,
    keyMode: mode,
    exit: r.status,
    auditFailed: /SECURITY_AUDIT_FAILED/.test(all),
    permissionFinding: (/Key permission != 0600 for alice\.key \(got \d+\)/.exec(all) ?? [null])[0],
    valueEchoed: all.includes(HEX),
    output: all.replace(/\r/g, "").trim().slice(0, 600)
  };
}

const results = {
  platform: process.platform,
  node: process.version,
  umask: "0" + process.umask().toString(8),
  cliVersion: spawnSync(process.execPath, [cli, "--version"], { encoding: "utf8", env: { PATH: process.env.PATH, HOME: home, HARDKAS_HOME: home } }).stdout.trim(),
  cases: [
    audit({ name: "fixture as written today (no mode set; the umask decides)" }),
    audit({ name: "corrected fixture (0600)", mode: 0o600 }),
    audit({ name: "new negative fixture (0644)", mode: 0o644 })
  ]
};
fs.writeFileSync(OUT, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results, null, 2));
