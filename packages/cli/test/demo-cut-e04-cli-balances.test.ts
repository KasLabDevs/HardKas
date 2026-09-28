import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";
import { runCli } from "./first-contact-helpers.js";

// Demo-cut step 2 · E04 through the CLI, exactly as the demo ran it on the
// published rc.23: `tx send alice → bob 25` in the simulator, then balances by name.
// Published rc.23 printed alice 0 KAS and bob 1000 KAS; each account must now show
// its real balance, the same for its name and for its synthetic identity.

const kas = (out: string): string => {
  const m = /Balance:\s+([0-9.]+) KAS/.exec(out);
  if (!m) throw new Error(`no balance in output:\n${out}`);
  return m[1]!;
};

describe("Demo-cut · E04 · CLI balances after a simulated send", () => {
  let ws: string;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-dc-e04-cli-"));
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  });

  afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("alice → bob 25 KAS: bob 1025, alice 1000 − 25 − fee, by name and by synthetic identity", () => {
    const sent = runCli(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "25", "--network", "simulated", "--json"], ws);
    expect(sent.status, sent.out).toBe(0);
    const env = JSON.parse(sent.stdout.trim());
    const fee = BigInt(env.data.receipt.feeSompi);
    const expectedAlice = (1000n * 100_000_000n - 25n * 100_000_000n - fee);

    const bobByName = kas(runCli(["accounts", "balance", "bob", "--network", "simulated"], ws).out);
    const bobByIdentity = kas(runCli(["accounts", "balance", "kaspa:sim_bob", "--network", "simulated"], ws).out);
    const aliceByName = kas(runCli(["accounts", "balance", "alice", "--network", "simulated"], ws).out);

    expect(bobByName).toBe("1025");
    expect(bobByIdentity).toBe("1025");
    const [whole, frac = ""] = aliceByName.split(".");
    expect(BigInt(whole!) * 100_000_000n + BigInt(frac.padEnd(8, "0"))).toBe(expectedAlice);
  });
});
