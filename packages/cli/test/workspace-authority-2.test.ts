import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000 });

// WORKSPACE-AUTHORITY-2 · controls at process level (green before and after): the CLI follows the workspace's
// `execution` contract. In a workspace whose default target is the localnet node, `tx plan` goes to the node (which
// the hermetic run refuses) and never answers with a simulator plan; in the scaffold workspace it plans in the
// simulator. The divergence itself — the SDK planning in the simulator in that same localnet-default workspace — is
// pinned in-process in `packages/sdk/test/workspace-authority-2.test.ts` (WA2-A1…A6).

const SCAFFOLD_TARGETS =
  'targets: { simulator: { mode: "simulator", domain: "kaspa-l1", network: "simulated" }, localnet: { mode: "localnet", domain: "kaspa-l1", network: "simnet" } }';
const scaffold = `export default { execution: { default: "simulator", ${SCAFFOLD_TARGETS} }, network: { allowPublic: false } };\n`;
const localnetDefault = `export default { execution: { default: "localnet", ${SCAFFOLD_TARGETS} }, network: { allowPublic: false } };\n`;

const run = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, encoding: "utf8", env: childEnv(), input: "", timeout: 150_000 });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

describe("WORKSPACE-AUTHORITY-2 · controls · the CLI follows the workspace's execution target", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wa2-cli-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("execution.default = localnet: `tx plan` does not plan in the simulator (it asks the node, unreachable here)", () => {
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), localnetDefault);
    const r = run(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--json"], ws);
    expect(r.status, r.all).not.toBe(0);
    expect(r.all, "no simulator plan came out").not.toMatch(/"mode":\s*"simulator"/);
    expect(r.all).not.toMatch(/"networkId":\s*"simulated"/);
  });

  it("the scaffold default (simulator): `tx plan --json` plans in the simulator over synthetic identities", () => {
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), scaffold);
    const r = run(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--json"], ws);
    expect(r.status, r.all).toBe(0);
    expect(r.stdout).toMatch(/"mode":\s*"simulator"/);
    expect(r.stdout).toMatch(/"networkId":\s*"simulated"/);
    expect(r.stdout).toMatch(/kaspa:sim_alice/);
  });
});

// AFTER (C-A): the CLI's tx commands resolve through the same shared resolver as the SDK — the typed refusals are the
// same words on both sides.
describe("WORKSPACE-AUTHORITY-2 · AFTER · the CLI shares the resolver", () => {
  let ws: string;

  beforeEach(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wa2-cli-after-"));
    fs.mkdirSync(path.join(ws, ".hardkas"));
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), localnetDefault);
  });

  afterEach(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  const plan = (extra: string[]) => run(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", ...extra, "--json"], ws);

  it("`--target simulator` in a localnet-default workspace plans in the simulator (the named target wins)", () => {
    const r = plan(["--target", "simulator"]);
    expect(r.status, r.all).toBe(0);
    expect(r.stdout).toMatch(/"mode":\s*"simulator"/);
    expect(r.stdout).toMatch(/kaspa:sim_alice/);
  });

  it("`--target nope` is EXECUTION_TARGET_NOT_FOUND; `--network nonsense` is UNKNOWN_NETWORK; `--target localnet --network simulated` is EXECUTION_NETWORK_MISMATCH", () => {
    const missing = plan(["--target", "nope"]);
    expect({ exit: missing.status, code: /EXECUTION_TARGET_NOT_FOUND/.test(missing.all) }, missing.all).toEqual({ exit: 1, code: true });
    const unknown = plan(["--network", "nonsense"]);
    expect({ exit: unknown.status, code: /UNKNOWN_NETWORK/.test(unknown.all) }, unknown.all).toEqual({ exit: 1, code: true });
    const clash = plan(["--target", "localnet", "--network", "simulated"]);
    expect({ exit: clash.status, code: /EXECUTION_NETWORK_MISMATCH/.test(clash.all) }, clash.all).toEqual({ exit: 1, code: true });
    for (const r of [missing, unknown, clash]) expect(r.all, "no plan came out of a refusal").not.toMatch(/"planId"/);
  });

  it("closeout · the CLI contacts the endpoint the resolved network declares: a custom networks.simnet.rpcUrl under a localnet default is what `tx plan` names, never the canonical substitute", () => {
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), `export default { execution: { default: "localnet", ${SCAFFOLD_TARGETS} }, networks: { simnet: { kind: "kaspa-node", network: "simnet", rpcUrl: "ws://127.0.0.1:1" } } };\n`);
    const r = plan([]);
    expect(r.status, r.all).not.toBe(0);
    expect(r.all, "the declared endpoint").toMatch(/ws:\/\/127\.0\.0\.1:1\b/);
    expect(r.all, "never the canonical substitute").not.toMatch(/18210/);
    expect(r.all).not.toMatch(/"mode":\s*"simulator"/);
  });

  it("`--network simulated` names the simulator's target of the same workspace: a simulator plan; `--network localnet` (a target name) is refused as a network", () => {
    const simulated = plan(["--network", "simulated"]);
    expect(simulated.status, simulated.all).toBe(0);
    expect(simulated.stdout).toMatch(/"mode":\s*"simulator"/);
    const asNetwork = plan(["--network", "localnet"]);
    expect({ exit: asNetwork.status, code: /UNKNOWN_NETWORK/.test(asNetwork.all), hint: /named execution target/.test(asNetwork.all) }, asNetwork.all).toEqual({ exit: 1, code: true, hint: true });
  });
});
