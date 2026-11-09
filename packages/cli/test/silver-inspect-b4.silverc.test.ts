import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// L1-CORE-1 B4 · `silver inspect <record>`, the command: it shows a compile record the pinned silverc wrote (silverc
// level), offline. What it shows is the record's own provenance and contracts and the artifact the record carries, its
// entries with their dispatch tags; a record that is not a compile record, one edited after it was written, or one whose
// artifact was swapped and resealed is refused. Nothing is contacted.
// -----------------------------------------------------------------------------

const FIXTURE = path.join(repoRoot, "fixtures", "toccata-v2", "silver", "p2sh-signed-release");
const made: string[] = [];
let ws = "";
let record: any;

function run(name: string, args: string[]) {
  const log = path.join(ws, `${name}.net.log`);
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, encoding: "utf8", env: hermeticChildEnv(log), timeout: 90_000, windowsHide: true });
  let json: any;
  try {
    json = JSON.parse(String(r.stdout).trim());
  } catch {
    json = undefined;
  }
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  const all = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  return { status: r.status, json, all, dialled, brief: `exit ${r.status}\n${all.slice(0, 1500)}` };
}

beforeAll(() => {
  assertHermeticPreloadActive();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b4-silver-inspect-"));
  made.push(ws);
  fs.mkdirSync(path.join(ws, ".hardkas"));
  const cfg = { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default ${JSON.stringify(cfg, null, 2)};\n`);
  fs.copyFileSync(path.join(FIXTURE, "contract.sil"), path.join(ws, "contract.sil"));
  fs.copyFileSync(path.join(FIXTURE, "contract.constructor-args.json"), path.join(ws, "ctor.json"));
  const c = run("compile", ["silver", "compile", "contract.sil", "--args", "ctor.json", "--json"]);
  expect(c.status, c.brief).toBe(0);
  record = c.json;
});
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("L1-CORE-1 B4 · silver inspect <record>", () => {
  it("I-1 --json: the record's provenance and contracts, and the artifact it carries (entries, dispatch tags); nothing contacted", () => {
    const r = run("inspect-json", ["silver", "inspect", path.relative(ws, record.recordPath), "--json"]);
    expect(r.status, r.brief).toBe(0);
    expect(r.json.provenance).toEqual(record.provenance);
    expect(r.json.contracts).toEqual(record.contracts);
    expect(r.json.artifact).toEqual(JSON.parse(record.artifactJson));
    const [name] = Object.keys(r.json.artifact.contracts);
    expect(Object.keys(r.json.artifact.contracts[name!].entries).length).toBeGreaterThan(0);
    expect(r.dialled).toEqual([]);
  });

  it("I-2 text: source, compiler release, each contract with its address, each entry with its parameters and dispatch tag", () => {
    const r = run("inspect-text", ["silver", "inspect", path.relative(ws, record.recordPath)]);
    expect(r.status, r.brief).toBe(0);
    expect(r.all).toContain(`silverc ${record.provenance.compiler.releaseTag}`);
    const artifact = JSON.parse(record.artifactJson);
    for (const [name, c] of Object.entries<any>(artifact.contracts)) {
      expect(r.all).toContain(name);
      expect(r.all).toContain(record.contracts.find((x: any) => x.name === name).address);
      for (const [entry, v] of Object.entries<any>(c.entries)) {
        expect(r.all).toContain(`${entry}(`);
        expect(r.all).toContain(`#${v.dispatch_tag}`);
      }
    }
  });

  it("I-3 refused: a record of another schema, one edited after it was written, and one whose artifact was swapped and resealed", async () => {
    const { calculateContentHash } = await import("@hardkas/artifacts");
    const wrong = { ...record, schema: "hardkas.silverDeploy.v1" };
    fs.writeFileSync(path.join(ws, "wrong.json"), JSON.stringify(wrong));
    const edited = JSON.parse(fs.readFileSync(record.recordPath, "utf8"));
    edited.contracts[0].address = "kaspasim:qpumuen7l8wthtz45p3ftn58pvrs9xlumvkuu2xet8egzkcklqtes65ue9mw6";
    fs.writeFileSync(path.join(ws, "edited.json"), JSON.stringify(edited));
    const swapped = JSON.parse(fs.readFileSync(record.recordPath, "utf8"));
    const art = JSON.parse(swapped.artifactJson);
    const first = Object.keys(art.contracts)[0]!;
    art.contracts[first].bytecode = Array.isArray(art.contracts[first].bytecode) ? [...art.contracts[first].bytecode, 0x51] : art.contracts[first].bytecode;
    swapped.artifactJson = JSON.stringify(art);
    delete swapped.contentHash;
    swapped.contentHash = calculateContentHash(swapped, swapped.hashVersion);
    fs.writeFileSync(path.join(ws, "swapped.json"), JSON.stringify(swapped));
    for (const [file, code] of [
      ["wrong.json", /SILVER_RECORD_INVALID/],
      ["edited.json", /SILVER_RECORD_TAMPERED/],
      ["swapped.json", /SILVER_|artifact/i]
    ] as const) {
      const r = run(`inspect-${file}`, ["silver", "inspect", file, "--json"]);
      expect(r.status, `${file}\n${r.brief}`).not.toBe(0);
      expect(r.all, file).toMatch(code);
      expect(r.dialled).toEqual([]);
    }
  });
});
