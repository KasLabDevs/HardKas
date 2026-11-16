import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// TX-SEND-WAIT-1 / TX-WAIT-URL-1 (2026-11-15) · `tx send --wait [--wait-timeout]` and `tx wait --url`, through the built
// CLI. Here: the options exist, a misuse is a usage error before anything is planned, signed or sent, and a simulator
// send with --wait says there is nothing to wait for. The real-node path (send + wait on a node given by --url, with no
// config) was proven on a simnet node; see the session report. Simulator only: no node, no network.

const run = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: { ...childEnv(), NO_COLOR: "1" }, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}`, stdout: r.stdout ?? "" };
};
const envelope = (stdout: string) => JSON.parse(/^\{[\s\S]*?^\}/m.exec(stdout)?.[0] ?? "null");
const receiptsIn = (ws: string) => {
  const dir = path.join(ws, ".hardkas", "artifacts", "receipts");
  return fs.existsSync(dir) ? fs.readdirSync(dir).length : 0;
};

describe("TX-SEND-WAIT-1 · tx send --wait and tx wait --url", () => {
  let ws: string;
  beforeAll(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-tsw1-"));
    expect(run(["init", ".", "--skip-toolchain"], ws).status).toBe(0);
  });
  afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));

  it("TSW-1 the options are in the help: tx send --wait / --wait-timeout, tx wait --url", () => {
    const send = run(["tx", "send", "--help"], ws);
    // commander wraps descriptions: compare with whitespace collapsed
    const flat = (s: string) => s.replace(/\s+/g, " ");
    expect(flat(send.out)).toMatch(/--wait After the node accepts the send, wait until the transaction is CONFIRMED/);
    expect(flat(send.out)).toMatch(/--wait-timeout <seconds>/);
    const wait = run(["tx", "wait", "--help"], ws);
    expect(flat(wait.out)).toMatch(/--url <url> Node wRPC URL that observes/);
  });

  it("TSW-2 --wait-timeout without --wait is a usage error and nothing is sent", () => {
    const before = receiptsIn(ws);
    const r = run(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--wait-timeout", "5", "--json"], ws);
    expect(r.status, r.out).toBe(2);
    expect(r.out).toMatch(/TX_SEND_USAGE/);
    expect(r.out).toMatch(/--wait-timeout applies with --wait/);
    expect(receiptsIn(ws)).toBe(before);
  });

  it("TSW-3 an invalid --wait-timeout is a usage error and nothing is sent", () => {
    const before = receiptsIn(ws);
    const r = run(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--wait", "--wait-timeout", "abc", "--json"], ws);
    expect(r.status, r.out).toBe(2);
    expect(r.out).toMatch(/--wait-timeout is a non-negative number of seconds/);
    expect(receiptsIn(ws)).toBe(before);
  });

  it("TSW-4 a simulator send with --wait succeeds and says there is no network to wait for", () => {
    const r = run(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--wait", "--json"], ws);
    expect(r.status, r.out).toBe(0);
    const env = envelope(r.stdout);
    expect(env?.ok, r.out).toBe(true);
    expect(env?.wait?.skipped, r.out).toMatch(/no network to wait for/);
  });

  it("TSW-5 a send without --wait carries no wait in its envelope (unchanged contract)", () => {
    const r = run(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], ws);
    expect(r.status, r.out).toBe(0);
    expect(envelope(r.stdout)?.wait).toBeUndefined();
  });
});
