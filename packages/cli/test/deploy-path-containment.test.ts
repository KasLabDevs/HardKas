import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 180_000 });

// DEPLOYMENT-PATH-CONTAINMENT-1 (re-audit 2026-10-04): every CLI entry point into the deployment store — `deploy track`,
// `deploy inspect`, `deploy status`, `deploy list` and `tx send --track` — passed the user's label and network straight
// into the record path. Real processes on the built CLI: an invalid label or network is refused, and nothing is written
// or shown from outside `.hardkas/deployments`.

const cli = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), encoding: "utf8", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

describe("DEPLOYMENT-PATH-CONTAINMENT-1 · CLI entry points", () => {
  let parent: string;
  let ws: string;
  const store = () => path.join(ws, ".hardkas", "artifacts");
  const planted = () => path.join(store(), "plans", "txPlan-1.json");
  /** a file of the artifact store that a traversing label or network would read as a deployment record, in a workspace
   * that already tracks deployments (`deploy list` reads nothing when `.hardkas/deployments` does not exist) */
  const plant = () => {
    fs.mkdirSync(path.join(ws, ".hardkas", "deployments"), { recursive: true });
    fs.mkdirSync(path.dirname(planted()), { recursive: true });
    fs.writeFileSync(planted(), JSON.stringify({ schema: "hardkas.txPlan", label: "STORE-PLAN-MARKER", networkId: "simnet", status: "sent", deployedAt: "2026-10-04T00:00:00.000Z" }));
  };

  beforeEach(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-deploy-cli-"));
    ws = path.join(parent, "ws");
    fs.mkdirSync(ws);
  });

  afterEach(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("deploy track refuses a label that leaves the workspace, and writes nothing there", () => {
    const r = cli(["deploy", "track", "../../../../escaped", "--network", "simnet"], ws);
    expect(r.status, r.all).not.toBe(0);
    expect(r.all).toContain("is not a deployment label");
    expect(fs.existsSync(path.join(parent, "escaped.json")), "nothing written outside the workspace").toBe(false);
    expect(fs.readdirSync(parent)).toEqual(["ws"]);
  });

  it("deploy track refuses a network that reaches into the artifact store, and writes nothing there", () => {
    const r = cli(["deploy", "track", "injected", "--network", "../artifacts"], ws);
    expect(r.status, r.all).not.toBe(0);
    expect(r.all).toContain("is not a deployment network");
    expect(fs.existsSync(path.join(store(), "injected.json")), "nothing written into the artifact store").toBe(false);
  });

  it.each([
    ["deploy inspect", ["deploy", "inspect", "../../artifacts/plans/txPlan-1", "--network", "simnet", "--json"]],
    ["deploy status", ["deploy", "status", "../../artifacts/plans/txPlan-1", "--network", "simnet", "--json"]],
    ["deploy list", ["deploy", "list", "--network", "../artifacts/plans", "--json"]]
  ])("%s refuses a path into the artifact store and shows nothing from it", (_what, args) => {
    plant();
    const before = fs.readFileSync(planted(), "utf8");
    const r = cli(args as string[], ws);
    expect(r.status, r.all).not.toBe(0);
    expect(r.all).not.toContain("STORE-PLAN-MARKER");
    expect(fs.readFileSync(planted(), "utf8")).toBe(before);
  });

  it("tx send --track refuses a label that reaches into the artifact store, and writes no record there", async () => {
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    expect(cli(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--out", "plan.json", "--json"], ws).status).toBe(0);
    expect(cli(["tx", "sign", "plan.json", "--out", "signed.json", "--json"], ws).status).toBe(0);
    const r = cli(["tx", "send", "signed.json", "--network", "simulated", "--track", "../../artifacts/tracked", "--json"], ws);
    expect(r.status, r.all).not.toBe(0);
    expect(fs.existsSync(path.join(store(), "tracked.json")), "no deployment record inside the artifact store").toBe(false);
  });

  it("control: a plain label and network are tracked and inspected as before", () => {
    const t = cli(["deploy", "track", "counter-1.0", "--network", "simnet", "--tx-id", "simtx_1"], ws);
    expect(t.status, t.all).toBe(0);
    expect(fs.existsSync(path.join(ws, ".hardkas", "deployments", "simnet", "counter-1.0.json"))).toBe(true);
    const i = cli(["deploy", "inspect", "counter-1.0", "--network", "simnet", "--json"], ws);
    expect(i.status, i.all).toBe(0);
    expect(JSON.parse(i.stdout).label).toBe("counter-1.0");
  });
});
