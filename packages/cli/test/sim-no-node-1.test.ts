import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist } from "./first-contact-helpers.js";
import { hermeticChildEnv, assertHermeticPreloadActive } from "./hermetic-child.js";

vi.setConfig({ testTimeout: 240_000 });

// -----------------------------------------------------------------------------
// SIM-NO-NODE-1 (2026-10-21). Found by the security audit of 2026-10-21 (SA-4): `hardkas rpc … --network simulated` dialled
// ws://127.0.0.1:18210 — the canonical localnet — because the endpoint authority (resolveNodeEndpoint) gives the simulator
// the local default of a node network. The simulated network executes in-process and has no node: a command that asks it
// for a node must say so, typed, and contact nothing (18210 may be another session's node on this machine).
// Each command runs as a real process on the built dist in a simulator workspace; every connection attempt is logged by
// the hermetic preload, and the node ports are denied (a denied attempt is still logged, so "zero attempts" is measured).
// -----------------------------------------------------------------------------

const scaffold =
  'export default { execution: { default: "simulator", targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" } } }, network: { allowPublic: false } };\n';
const NODE_PORTS = /127\.0\.0\.1:(16210|17210|18210)\b/;

let ws: string;
let logs: string;
beforeAll(() => {
  assertHermeticPreloadActive();
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-simnn1-"));
  fs.mkdirSync(path.join(ws, ".hardkas"));
  fs.writeFileSync(path.join(ws, "hardkas.config.ts"), scaffold);
  logs = fs.mkdtempSync(path.join(os.tmpdir(), "hk-simnn1-logs-"));
});
afterAll(() => {
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(logs, { recursive: true, force: true });
});

function run(name: string, args: string[]) {
  const log = path.join(logs, `${name}.net.log`);
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd: ws,
    encoding: "utf8",
    env: hermeticChildEnv(log, { HARDKAS_HERMETIC_DENY_PORTS: "16210,17210,18210" }),
    timeout: 200_000
  });
  const dialled = fs.existsSync(log) ? fs.readFileSync(log, "utf8").split(/\r?\n/).filter(Boolean) : [];
  let json: any;
  try {
    json = JSON.parse((r.stdout ?? "").trim());
  } catch {
    json = undefined;
  }
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", json, dialled, brief: `exit ${r.status}\n${(r.stdout ?? "").slice(0, 1500)}\n${(r.stderr ?? "").slice(0, 900)}` };
}
const codeOf = (r: { json: any; stdout: string; stderr: string }) => r.json?.code ?? r.json?.error?.code ?? /\b([A-Z][A-Z0-9]+(?:_[A-Z0-9]+)+)\b/.exec(`${r.stdout}\n${r.stderr}`)?.[1];

describe("SIM-NO-NODE-1 · node commands on the simulated network contact no node and say why", () => {
  for (const [name, args] of [
    ["rpc-info", ["rpc", "info", "--network", "simulated", "--json"]],
    ["rpc-health", ["rpc", "health", "--network", "simulated", "--json"]],
    ["rpc-dag", ["rpc", "dag", "--network", "simulated", "--json"]],
    ["rpc-mempool", ["rpc", "mempool", "--network", "simulated", "--json"]]
  ] as const) {
    it(`\`hardkas ${args.join(" ")}\`: refused with SIMULATOR_HAS_NO_NODE, zero attempts on a node port`, () => {
      const r = run(name, [...args]);
      const attempts = r.dialled.filter((l) => NODE_PORTS.test(l));
      expect(attempts, `${r.brief}\n${r.dialled.join("\n")}`).toEqual([]);
      expect(r.status, r.brief).not.toBe(0);
      expect(codeOf(r), r.brief).toBe("SIMULATOR_HAS_NO_NODE");
    });
  }

  for (const [name, args] of [
    ["rpc-doctor", ["rpc", "doctor", "--json"]],
    ["doctor", ["doctor", "--json"]]
  ] as const) {
    it(`\`hardkas ${args.join(" ")}\` in a simulator workspace: zero attempts on a node port (it may report that there is no node)`, () => {
      const r = run(name, [...args]);
      expect(r.dialled.filter((l) => NODE_PORTS.test(l)), `${r.brief}\n${r.dialled.join("\n")}`).toEqual([]);
    });
  }

  it("control · an explicit --url on the simulated network is the caller's choice: it is the one dialled (a free loopback port here, nothing listens)", () => {
    const r = run("rpc-info-url", ["rpc", "info", "--network", "simulated", "--url", "ws://127.0.0.1:29999", "--json"]);
    expect(r.dialled.filter((l) => NODE_PORTS.test(l)), r.brief).toEqual([]);
    expect(r.dialled.some((l) => /127\.0\.0\.1:29999/.test(l)), `${r.brief}\n${r.dialled.join("\n")}`).toBe(true);
  });

  it("control · a simulated payment flow (plan → sign → send on the simulator) contacts no node at all", () => {
    const r = run("sim-send", ["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"]);
    expect(r.status, r.brief).toBe(0);
    expect(r.dialled.filter((l) => NODE_PORTS.test(l)), r.brief).toEqual([]);
  });
});
