// E1' helper: run ONE hardkas CLI command (clean develop build, isolated home) under the hermetic preload
// (loopback only), save {argv, exit, stdout, stderr, ms} to runs/<tag>.json and print a short view.
//   node hk.mjs <tag> <cwd> <args...>
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = process.env.HK_SRC ?? "C:/Users/jrodr/hkl1/src";
const PWFILE = "C:/Users/jrodr/hkl1/e1/.pw";
fs.mkdirSync(path.dirname(PWFILE), { recursive: true });
if (!fs.existsSync(PWFILE)) fs.writeFileSync(PWFILE, (await import("node:crypto")).randomBytes(24).toString("hex"));
const pw = fs.readFileSync(PWFILE, "utf8");

const [tag, cwd, ...args] = process.argv.slice(2);
const runs = process.env.HK_RUNS ?? path.join(HERE, "runs");
fs.mkdirSync(runs, { recursive: true });
const t0 = Date.now();
const r = spawnSync(process.execPath, [`${SRC}/packages/cli/dist/index.js`, ...args], {
  cwd,
  env: {
    ...process.env,
    HARDKAS_HOME: "C:/Users/jrodr/hkl1/home",
    HK_PW: pw,
    NODE_OPTIONS: `--require=${SRC}/scripts/hermetic/no-network-preload.cjs`,
    HARDKAS_HERMETIC_LOG: path.join(runs, "net.log"),
    NO_COLOR: "1",
    FORCE_COLOR: "0"
  },
  encoding: "utf8",
  timeout: Number(process.env.HK_TIMEOUT_MS ?? 300000)
});
const clean = (s) => String(s ?? "").split(pw).join("[PW]").replace(/("?(privateKey|mnemonic|xprv|seed)"?\s*[:=]\s*)"[^"]*"/gi, '$1"[REDACTED]"');
const rec = { tag, cwd, argv: args, exit: r.status, timedOut: r.error?.code === "ETIMEDOUT", ms: Date.now() - t0, stdout: clean(r.stdout), stderr: clean(r.stderr) };
fs.writeFileSync(path.join(runs, `${tag}.json`), JSON.stringify(rec, null, 2));
const max = Number(process.env.HK_SHOW ?? 1800);
console.log(`[${tag}] exit=${rec.exit}${rec.timedOut ? " TIMEOUT" : ""} ${rec.ms}ms`);
if (rec.stdout) console.log(rec.stdout.slice(0, max));
if (rec.stderr) console.log("STDERR: " + rec.stderr.slice(0, Math.min(max, 1200)));
