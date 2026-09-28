import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// Demo-ready · E26 — `accounts balance alice --network simulated` computed the right balance but
// printed `Account: Unknown` and `Address: alice`: the display never used the identity the
// query resolved. It now reports the simulator account and the address its UTXOs are read
// from — the one identity the simulator state holds (E04), not a second one.

const run = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: { ...childEnv(), NO_COLOR: "1" }, encoding: "utf8" });
  return { status: r.status, stdout: r.stdout ?? "", out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

describe("Demo-ready · E26 · simulated balance shows the identity it queried", () => {
  let ws: string;
  let aliceAddress: string;

  beforeAll(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-demo-ready-e26-"));
    expect(run(["init", "."], ws).status).toBe(0);
    const state = JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "localnet.json"), "utf8"));
    aliceAddress = state.accounts.find((a: any) => a.name === "alice").address;
  });
  afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));

  it("by name: the account and the simulator address, never `Unknown`", () => {
    const r = run(["accounts", "balance", "alice", "--network", "simulated"], ws);
    expect(r.status).toBe(0);
    expect(r.out).toMatch(/Account:\s+alice\b/);
    expect(r.out).toContain(`Address:  ${aliceAddress}`);
    expect(r.out).not.toMatch(/Unknown/);
    expect(r.out).toMatch(/Balance:\s+1000 KAS/);
  });

  it("--json carries the same identity; the synthetic kaspa:sim_ form resolves to the same account", () => {
    for (const id of ["alice", "kaspa:sim_alice"]) {
      const r = run(["accounts", "balance", id, "--network", "simulated", "--json"], ws);
      expect(r.status).toBe(0);
      const { result } = JSON.parse(r.stdout.slice(r.stdout.indexOf("{")));
      expect(result.name).toBe("alice");
      expect(result.address).toBe(aliceAddress);
      expect(result.network).toBe("simulated");
    }
  });
});
