import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { cliDist, repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

// -----------------------------------------------------------------------------
// V1-ENGINE-2 · reference contracts (silverc level: needs the pinned silverc in HARDKAS_HOME). The reference contract of
// examples/09-silver-reference compiles with `hardkas silver compile` to exactly the artifact the engine tests use
// (packages/accounts/test/fixtures/v1-engine/reference), so the example and the tests cannot drift apart. No network.
// -----------------------------------------------------------------------------

const EXAMPLE = path.join(repoRoot, "examples", "09-silver-reference", "contracts");
const FIXTURE = path.join(repoRoot, "packages", "accounts", "test", "fixtures", "v1-engine", "reference");
const made: string[] = [];

async function run(args: string[], cwd: string) {
  const log = path.join(cwd, "net.log");
  const r = await new Promise<{ status: number | null; stdout: string; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, [cliDist, ...args], { cwd, env: hermeticChildEnv(log) });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += String(d)));
    child.stderr.on("data", (d) => (stderr += String(d)));
    child.on("close", (status) => resolve({ status, stdout, stderr }));
  });
  let json: any;
  try {
    json = JSON.parse(r.stdout);
  } catch {
    json = undefined;
  }
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  return { exit: r.status, json, dialled, brief: `exit ${r.status}\n${r.stdout.slice(-1500)}\n${r.stderr.slice(0, 1500)}` };
}

beforeAll(() => assertHermeticPreloadActive());
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("V1-ENGINE-2 · reference contracts compile to the artifacts the engine tests use", () => {
  it("RS-1 OwnedCounter: `silver compile` reproduces the fixture artifact byte for byte; one covenant entry (delta, s) for policy bump; no network", async () => {
    const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-ref-sc-"));
    made.push(ws);
    fs.mkdirSync(path.join(ws, ".hardkas"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), 'export default { execution: { default: "localnet", targets: { localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } } } };\n');
    fs.copyFileSync(path.join(EXAMPLE, "owned-counter.sil"), path.join(ws, "owned-counter.sil"));
    fs.copyFileSync(path.join(FIXTURE, "owned-counter.constructor-args.json"), path.join(ws, "ctor.json"));
    // the example's source is the fixture's
    expect(fs.readFileSync(path.join(EXAMPLE, "owned-counter.sil"))).toEqual(fs.readFileSync(path.join(FIXTURE, "owned-counter.sil")));
    const r = await run(["silver", "compile", "owned-counter.sil", "--args", "ctor.json", "--json"], ws);
    expect(r.exit, r.brief).toBe(0);
    expect(r.json.artifactJson).toBe(fs.readFileSync(path.join(FIXTURE, "owned-counter.artifact.json"), "utf8"));
    expect(r.json.contracts).toHaveLength(1);
    expect(r.json.contracts[0]).toMatchObject({ name: "OwnedCounter", covenantPolicies: { bump: "__covenant_entrypoint_auth_bump" } });
    expect(Object.keys(r.json.contracts[0].entries)).toEqual(["__covenant_entrypoint_auth_bump"]);
    expect(r.json.contracts[0].address).toMatch(/^kaspasim:p/);
    expect(r.dialled).toEqual([]);
  });
});
