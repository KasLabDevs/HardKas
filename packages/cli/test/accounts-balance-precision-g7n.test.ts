import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { cliDist, childEnv } from "./first-contact-helpers.js";

// G7 n (kaspa-agent-notes cross-check) · `accounts balance` printed `Number(sompi) / 100_000_000`: above 2^53 sompi the
// last digits were rounded (9007199254740993 sompi showed as 90071992.54740992 KAS) and one sompi showed as 1e-8 KAS.
// The display now formats the bigint (core formatSompiToKas). Simulator state only: no node.

const run = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: { ...childEnv(), NO_COLOR: "1" }, encoding: "utf8" });
  return { status: r.status, out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};

describe("G7 n · accounts balance shows sompi exactly", () => {
  let ws: string;
  let state: any;
  let statePath: string;
  let alice: string;

  beforeAll(() => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-g7n-"));
    expect(run(["init", ".", "--skip-toolchain"], ws).status).toBe(0);
    statePath = path.join(ws, ".hardkas", "localnet.json");
    state = JSON.parse(fs.readFileSync(statePath, "utf8"));
    alice = state.accounts.find((a: any) => a.name === "alice").address;
  });
  afterAll(() => fs.rmSync(ws, { recursive: true, force: true }));

  const balanceWith = (amounts: string[]) => {
    const others = state.utxos.filter((u: any) => u.address !== alice);
    const mine = amounts.map((amountSompi, i) => ({ id: `${"e".repeat(63)}${i}:0`, address: alice, amountSompi, spent: false, createdAtDaaScore: "0" }));
    fs.writeFileSync(statePath, JSON.stringify({ ...state, utxos: [...others, ...mine] }, null, 2));
    return run(["accounts", "balance", "alice", "--network", "simulated"], ws);
  };

  it("G7n-1 2^53 + 1 sompi is printed to the last digit (it was rounded to …92)", () => {
    const r = balanceWith(["9007199254740993"]);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/Balance:\s+90071992\.54740993 KAS/);
  });

  it("G7n-2 one sompi is 0.00000001 KAS (it was 1e-8); whole KAS keep their form (1000 KAS)", () => {
    expect(balanceWith(["1"]).out).toMatch(/Balance:\s+0\.00000001 KAS/);
    expect(balanceWith(["100000000000"]).out).toMatch(/Balance:\s+1000 KAS/);
  });
});
