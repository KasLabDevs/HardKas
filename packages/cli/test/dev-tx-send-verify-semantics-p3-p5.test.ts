/**
 * ESCALÓN 3 · P3 and P5.
 * - `dev tx send` ran the `tx send` flow without the consent it requires, so it failed on every run
 *   (TX_SEND_NOT_EXECUTED), while `status` and the dev-server banner recommended it. It now applies the confirmation
 *   policy of `tx send`: on the simulated ledger or a local simnet it runs (cli-contract-2a B2 checks the simulated
 *   run end to end); on any other network it refuses before anything is planned and names `tx send … --yes`.
 * - `verify-semantics` already refused (VERIFY_SEMANTICS_UNSUPPORTED), but its help still said it verified "semantic
 *   truth agreement" and `--ci-mode` claimed a cross-OS check. The help says what it does, `--ci-mode` is a named
 *   no-effect option, and the refusal names `hardkas verify`.
 * Every CLI run is the built dist in its own temp workspace; nothing reaches a network (a TN10 target is refused first).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { DEFAULT_HARDKAS_CONFIG } from "@hardkas/config";
import { cliDist, childEnv } from "./first-contact-helpers.js";
import { buildHardkasProgram } from "../src/program.js";
import { devTxSendTarget } from "../src/runners/dev-tx-runners.js";

const TN10_CONFIG =
  'export default { execution: { default: "tn10", targets: { tn10: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } } };\n';

let ws: string;
let home: string;
beforeEach(() => {
  ws = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e3-p3-"));
  home = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-e3-p3-home-"));
  fs.mkdirSync(path.join(ws, ".hardkas"));
});
afterEach(() => {
  fs.rmSync(ws, { recursive: true, force: true });
  fs.rmSync(home, { recursive: true, force: true });
});

function cli(args: string[]) {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd: ws, encoding: "utf8", env: childEnv({ HARDKAS_HOME: home }), timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

const artifactsIn = (dir: string): string[] => {
  const root = path.join(dir, ".hardkas", "artifacts");
  if (!fs.existsSync(root)) return [];
  return fs.readdirSync(root, { recursive: true }).map(String).filter((f) => f.endsWith(".json"));
};

describe("ESCALÓN 3 · P3 · dev tx send", () => {
  it("unit · runs on the simulated ledger and a local simnet, nowhere else", async () => {
    expect(await devTxSendTarget(DEFAULT_HARDKAS_CONFIG)).toEqual({ local: true, networkId: "simulated" });
    const localnet = { ...DEFAULT_HARDKAS_CONFIG, execution: { ...(DEFAULT_HARDKAS_CONFIG.execution as any), default: "localnet" } };
    expect(await devTxSendTarget(localnet as any)).toEqual({ local: true, networkId: "simnet" });
    const tn10 = { ...DEFAULT_HARDKAS_CONFIG, execution: { default: "tn10", targets: { tn10: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" } } } };
    expect(await devTxSendTarget(tn10 as any)).toEqual({ local: false, networkId: "testnet-10" });
  });

  it("a workspace that targets TN10: refused before anything is planned, pointing at `tx send … --yes`", () => {
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), TN10_CONFIG);
    const r = cli(["dev", "tx", "send", "--from", "alice", "--to", "bob", "--amount", "1"]);
    expect(r.status, r.all).toBe(3);
    expect(r.all).toContain("DEV_TX_SEND_NETWORK_NOT_LOCAL");
    expect(r.all).toContain("hardkas tx send --from alice --to bob --amount 1 --yes");
    expect(r.all).not.toMatch(/Transaction (submitted|executed)/);
    expect(artifactsIn(ws)).toEqual([]);
  });

  it("help says where it runs", () => {
    const program = buildHardkasProgram({ forDocs: true });
    const dev = program.commands.find((c) => c.name() === "dev")!;
    const send = dev.commands.find((c) => c.name() === "tx")!.commands.find((c) => c.name() === "send")!;
    expect(send.description()).toMatch(/simulated ledger or a local simnet/);
    expect(send.description()).toMatch(/tx send … --yes/);
  });
});

describe("ESCALÓN 3 · P5 · verify-semantics says it refuses", () => {
  const program = buildHardkasProgram({ forDocs: true });
  const vs = program.commands.find((c) => c.name() === "verify-semantics")!;

  it("help: no verification is claimed; --ci-mode has no effect", () => {
    expect(vs.description()).toMatch(/^Unsupported: always refuses with VERIFY_SEMANTICS_UNSUPPORTED/);
    expect(vs.description()).not.toMatch(/Verify semantic truth agreement/);
    expect(vs.options.find((o) => o.long === "--ci-mode")!.description).toMatch(/^No effect/);
  });

  it("the refusal is typed, names `hardkas verify`, and flags --ci-mode as no effect", () => {
    const r = cli(["verify-semantics", "--ci-mode", "--json"]);
    expect(r.status, r.all).toBe(1);
    const envelope = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
    expect(envelope.code).toBe("VERIFY_SEMANTICS_UNSUPPORTED");
    expect(r.all).toContain("hardkas verify");
    expect(r.all).toContain("OPTION_NO_EFFECT");
  });
});
