import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";
import { installL2Extension, removeProject, cliIn } from "./helpers/installed-l2.js";
import { FOUNDRY_REFERENCES, foundryReferenceFor, isMusl } from "../src/toolchains/foundry.js";
import { extractPinnedFilesToDir } from "../../cli/src/toolchain-archive.js";
import { repoRoot } from "../../cli/test/first-contact-helpers.js";

// L2-EXT stage 3 · the REAL Foundry v1.8.6 release assets (vitest.foundry.config.ts; never in the canonical gate: it
// needs the ~120 MB assets on disk). HARDKAS_FOUNDRY_ASSETS = a directory with <platform>/<assetName>, as downloaded
// and verified on 30-oct (hkl1\foundry-pin\download). Offline: every CLI run carries the hermetic preload, and the test
// fails if any run attempted a non-loopback connection.

const ASSETS = process.env.HARDKAS_FOUNDRY_ASSETS;
if (!ASSETS) throw new Error("HARDKAS_FOUNDRY_ASSETS is not set: this suite needs the verified Foundry release assets on disk");
const here = foundryReferenceFor(process.platform, process.arch, isMusl());
if (!here) throw new Error(`no Foundry pin for ${process.platform}-${process.arch}: run this suite on win32-x64 or glibc linux-x64`);
const otherKey = process.platform === "win32" ? "linux-x64" : "win32-x64";
const other = FOUNDRY_REFERENCES[otherKey]!;
const assetPath = (key: string, name: string) => path.join(ASSETS, key, name);
const hereAsset = assetPath(`${process.platform}-${process.arch}`, here.assetName);
const PRELOAD = path.join(repoRoot, "scripts", "hermetic", "no-network-preload.cjs").split(path.sep).join("/");

let parent: string;
let ws: string;
let home: string;
let links: string[] = [];
let rssScript: string;

function run(args: string[], name: string) {
  const net = path.join(parent, `${name}.net.log`);
  const rss = path.join(parent, `${name}.rss`);
  const r = cliIn(ws, args, name, {
    HARDKAS_HOME: home,
    HARDKAS_HERMETIC_LOG: net,
    HARDKAS_RSS_FILE: rss,
    NODE_OPTIONS: `--require="${PRELOAD}" --import=${pathToFileURL(rssScript).href} --import=${pathToFileURL(path.join(repoRoot, "packages", "cli", "test", "fixtures", "module-recorder.mjs")).href}`
  });
  const refused = fs.existsSync(net) ? fs.readFileSync(net, "utf8").split(/\r?\n/).filter((l) => /REFUSED/.test(l)) : [];
  const maxRssMb = fs.existsSync(rss) ? Number(fs.readFileSync(rss, "utf8")) / 1024 : NaN;
  return { ...r, refused, maxRssMb };
}

beforeAll(() => {
  for (const f of [hereAsset, assetPath(otherKey, other.assetName)]) if (!fs.existsSync(f)) throw new Error(`missing ${f}`);
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-foundry-real-"));
  ws = path.join(parent, "project");
  home = path.join(parent, "home");
  fs.mkdirSync(ws);
  fs.mkdirSync(home);
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};\n");
  links = installL2Extension(ws);
  // peak resident memory of the process, written when it exits (kilobytes)
  rssScript = path.join(parent, "rss.mjs");
  fs.writeFileSync(rssScript, `import fs from "node:fs";\nprocess.on("exit", () => { try { fs.writeFileSync(process.env.HARDKAS_RSS_FILE, String(process.resourceUsage().maxRSS)); } catch {} });\n`);
}, 120_000);

afterAll(() => {
  if (parent) {
    removeProject(ws, links);
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

describe("Foundry v1.8.6, real release assets, offline", () => {
  it("installing the extension did not install foundry: `toolchain status` lists it as not installed", { timeout: 180_000 }, () => {
    const r = run(["toolchain", "status", "--json"], "status-before");
    const foundry = r.json?.toolchains?.find((t: any) => t.id === "foundry");
    expect(foundry, r.stdout + r.stderr).toMatchObject({ installed: false, verified: false, assetSha256: here.assetSha256 });
    expect(fs.existsSync(path.join(home, "toolchains", "foundry"))).toBe(false);
    expect(r.refused).toEqual([]);
  });

  it("`toolchain install foundry --from-file <asset>`: verified install, streamed (bounded memory), no network", { timeout: 600_000 }, () => {
    const r = run(["toolchain", "install", "foundry", "--from-file", hereAsset, "--json"], "install");
    expect(r.json?.status, r.stdout + r.stderr).toBe("TOOLCHAIN_INSTALLED");
    const dir = path.join(home, "toolchains", "foundry", "1.8.6");
    expect(fs.readdirSync(dir).sort()).toEqual([...Object.keys(here.files), "toolchain.json"].sort());
    for (const [name, pin] of Object.entries(here.files)) {
      const data = fs.readFileSync(path.join(dir, name));
      expect({ name, size: data.length, sha: crypto.createHash("sha256").update(data).digest("hex") }).toEqual({ name, size: pin.size, sha: pin.sha256 });
    }
    // in memory, the ~120 MB asset plus ~210 MB of pinned binaries would have to fit at once
    console.log(`foundry install: peak resident memory ${r.maxRssMb.toFixed(1)} MB`);
    expect(r.maxRssMb).toBeLessThan(250);
    expect(r.refused).toEqual([]);
  });

  it("the installed, verified anvil runs and is v1.8.6; `toolchain status` and `doctor l2` see it verified", { timeout: 180_000 }, () => {
    const anvil = path.join(home, "toolchains", "foundry", "1.8.6", here.entry);
    expect(execFileSync(anvil, ["--version"], { encoding: "utf8", timeout: 60_000 })).toMatch(/1\.8\.6/);
    const s = run(["toolchain", "status", "--json"], "status-after");
    expect(s.json.toolchains.find((t: any) => t.id === "foundry")).toMatchObject({ installed: true, verified: true });
    const d = run(["doctor", "l2", "--json"], "doctor-l2");
    expect(d.json?.extensions?.[0]?.checks?.find((c: any) => c.id === "l2.foundry")).toMatchObject({ ok: true });
  });

  it("a tampered copy of the asset (one byte): TOOLCHAIN_ASSET_DIGEST_MISMATCH, and the verified install stays untouched", { timeout: 600_000 }, () => {
    const tampered = path.join(parent, here.assetName);
    fs.copyFileSync(hereAsset, tampered);
    const fd = fs.openSync(tampered, "r+");
    const b = Buffer.alloc(1);
    const at = Math.floor(fs.statSync(tampered).size / 2);
    fs.readSync(fd, b, 0, 1, at);
    b[0] ^= 0x01;
    fs.writeSync(fd, b, 0, 1, at);
    fs.closeSync(fd);
    const r = run(["toolchain", "install", "foundry", "--from-file", tampered, "--force", "--json"], "tampered");
    expect({ status: r.status, code: r.json?.code }).toEqual({ status: 4, code: "TOOLCHAIN_ASSET_DIGEST_MISMATCH" });
    const s = run(["toolchain", "status", "--json"], "status-after-tamper");
    expect(s.json.toolchains.find((t: any) => t.id === "foundry")).toMatchObject({ installed: true, verified: true });
    const parentDir = path.join(home, "toolchains", "foundry");
    expect(fs.readdirSync(parentDir).filter((n) => n.startsWith("."))).toEqual([]);
  });

  it(`the other platform's asset (${otherKey}) streams through the same extractor and matches every pin`, { timeout: 600_000 }, async () => {
    const dest = fs.mkdtempSync(path.join(parent, "other-"));
    await extractPinnedFilesToDir(other, assetPath(otherKey, other.assetName), dest);
    expect(fs.readdirSync(dest).sort()).toEqual(Object.keys(other.files).sort());
  });
});
