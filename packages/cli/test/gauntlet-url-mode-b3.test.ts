import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

// -----------------------------------------------------------------------------
// L1-CORE-1 B3 · `pnpm gauntlet:toccata --url`. The gauntlet ran on the canonical localnet only (container check, its
// miner, `localnet status`). With --url it runs on a simnet node HardKAS does not manage: proven by what it reports at
// that URL, the Silver commands run with --url, and the miner joins the caller's own container under its own name and
// labels. The canonical localnet container and its miner are never used in that mode, and an incomplete or canonical
// --url invocation is refused before anything runs (no build, no Docker, no node). Canonical level: nothing is dialled.
// -----------------------------------------------------------------------------

const GAUNTLET = path.join(repoRoot, "scripts", "toccata-gauntlet.mjs");
const REAL_NODE = path.join(repoRoot, "packages", "cli", "test-gauntlet", "real-node", "run-real-node.mjs");
const made: string[] = [];
const logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b3-gauntlet-"));
made.push(logs);

function run(name: string, script: string, args: string[], cwd: string, extra: Record<string, string> = {}) {
  const log = path.join(logs, `${name}.net.log`);
  // DOCKER_HOST points nowhere: a guard that let the run reach Docker would fail differently, not silently pass
  const r = spawnSync(process.execPath, [script, ...args], {
    cwd,
    encoding: "utf8",
    env: hermeticChildEnv(log, { DOCKER_HOST: "tcp://127.0.0.1:9", ...extra }),
    timeout: 60_000,
    windowsHide: true
  });
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  const out = `${r.stdout ?? ""}\n${r.stderr ?? ""}`;
  return { status: r.status, out, dialled, brief: `exit ${r.status}\n${out.slice(0, 2000)}\n${JSON.stringify(dialled)}` };
}
const gauntlet = (name: string, args: string[]) => run(name, GAUNTLET, args, repoRoot);

beforeAll(() => assertHermeticPreloadActive());
afterAll(() => {
  for (const d of made) fs.rmSync(d, { recursive: true, force: true });
});

describe("L1-CORE-1 B3 · the Toccata gauntlet on a node HardKAS does not manage (--url)", () => {
  it("G-1 --help documents --url, --node-container, --grpc-port, --miner-label and --report", () => {
    const r = gauntlet("help", ["--help"]);
    expect(r.status, r.brief).toBe(0);
    for (const flag of ["--url", "--node-container", "--grpc-port", "--miner-label", "--report"]) expect(r.out, flag).toContain(flag);
    expect(r.out).toMatch(/never by the canonical\s+container check/);
    // an idle simnet node that reports only "not synced" is warmed up by the miner, then checked again in full
    expect(r.out).toMatch(/only problem\s+is "not synced"[\s\S]*warmed up/);
  });

  it("G-2 --url without the node's container and gRPC port is refused before anything runs", () => {
    const r = gauntlet("incomplete", ["--url", "ws://127.0.0.1:26210"]);
    expect(r.status, r.brief).not.toBe(0);
    expect(r.out, r.brief).toMatch(/GAUNTLET_URL_MODE_INCOMPLETE/);
    expect(r.out, r.brief).not.toMatch(/package\/build integrity/);
    expect(r.dialled, r.brief).toEqual([]);
  });

  it("G-3 --url naming the canonical localnet container is refused (that mode never touches it or its miner)", async () => {
    const { CANONICAL_LOCALNET } = await import("@hardkas/core");
    const r = gauntlet("canonical", ["--url", "ws://127.0.0.1:26210", "--node-container", CANONICAL_LOCALNET.containerName, "--grpc-port", "16210"]);
    expect(r.status, r.brief).not.toBe(0);
    expect(r.out, r.brief).toMatch(/GAUNTLET_URL_MODE_CANONICAL/);
    expect(r.dialled, r.brief).toEqual([]);
    // L1-CORE-1 B6 (review): a node container whose derived miner name (<name>-miner) is the canonical miner's
    const minerBase = CANONICAL_LOCALNET.minerContainerName.replace(/-miner$/, "");
    const m = gauntlet("canonical-miner", ["--url", "ws://127.0.0.1:26210", "--node-container", minerBase, "--grpc-port", "26212"]);
    expect(m.status, m.brief).not.toBe(0);
    expect(m.out, m.brief).toMatch(/GAUNTLET_URL_MODE_CANONICAL/);
    expect(m.dialled, m.brief).toEqual([]);
  });

  it("G-4 --url that is not a ws:// URL, or a --miner-label that is not key=value, is refused", () => {
    const bad = gauntlet("not-ws", ["--url", "http://127.0.0.1:26210", "--node-container", "own-node", "--grpc-port", "26212"]);
    expect(bad.out, bad.brief).toMatch(/GAUNTLET_URL_INVALID/);
    const label = gauntlet("label", ["--url", "ws://127.0.0.1:26210", "--node-container", "own-node", "--grpc-port", "26212", "--miner-label", "no-equals"]);
    expect(label.out, label.brief).toMatch(/GAUNTLET_LABEL_INVALID/);
    expect([...bad.dialled, ...label.dialled]).toEqual([]);
  });

  it("G-5 the real-node phase in URL mode refuses the canonical miner, and an incomplete URL mode, before any node or command", async () => {
    const { CANONICAL_LOCALNET } = await import("@hardkas/core");
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "hk-b3-realnode-"));
    made.push(cwd);
    const base = { HARDKAS_GAUNTLET_RPC_URL: "ws://127.0.0.1:26210", HARDKAS_GAUNTLET_GRPC_PORT: "26212" };
    const canonical = run("real-node-canonical", REAL_NODE, [], cwd, {
      ...base,
      HARDKAS_GAUNTLET_NODE_CONTAINER: "own-node",
      HARDKAS_GAUNTLET_MINER_CONTAINER: CANONICAL_LOCALNET.minerContainerName
    });
    expect(canonical.status, canonical.brief).not.toBe(0);
    expect(canonical.out, canonical.brief).toMatch(/GAUNTLET_URL_MODE_CANONICAL/);
    const incomplete = run("real-node-incomplete", REAL_NODE, [], cwd, base);
    expect(incomplete.out, incomplete.brief).toMatch(/GAUNTLET_URL_MODE_INCOMPLETE/);
    for (const r of [canonical, incomplete]) {
      expect(r.out, r.brief).not.toMatch(/Running: /);
      expect(r.dialled, r.brief).toEqual([]);
    }
    // the phase names its own release from package.json, never a literal
    expect(canonical.out).toContain(`=== Real Node ${JSON.parse(fs.readFileSync(path.join(repoRoot, "packages", "cli", "package.json"), "utf8")).version} /`);
  });
});
