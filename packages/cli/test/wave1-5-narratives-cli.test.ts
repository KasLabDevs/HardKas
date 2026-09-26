import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";

// Wave 1.5 · AUD-14 (=SEC-I), simulator part · T-A14a
//   `explain` and `tx send` print only results they computed: the identity check
//   (authScope) is computed, a replay is NOT run by either command, so no replay id
//   and no replay verdict are printed; in a manipulated chain nothing is "successful".

const cliDist = path.resolve(__dirname, "../dist/index.js");

function run(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", NO_COLOR: "1" }
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

describe("Wave 1.5 · AUD-14 · CLI narratives report only computed results (simulator)", () => {
  let ws: string;
  let receiptId: string;
  let txId: string;
  let receiptPath: string;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w15-cli-"));
    const sdk = await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    await sdk.artifacts.write(plan);
    const signed = await sdk.tx.sign(plan, "alice");
    const sent: any = await sdk.tx.send(signed);
    receiptId = sent.receipt.contentHash;
    txId = sent.receipt.txId;
    receiptPath = sent.receiptPath;
    expect(receiptId).toMatch(/^[0-9a-f]{64}$/);
    expect(txId).toMatch(/^synthetic-[0-9a-f]{64}$/);
  });

  afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("T-A14a · `explain` of a simulated receipt: computed identity check, replay stated as not run, nothing 'successful'", () => {
    const r = run(["explain", receiptId], ws);
    expect(r.status, r.out).toBe(0);
    expect(r.out).not.toMatch(/successful/i);
    expect(r.out).not.toMatch(/Replay Result/);
    // UI.causality prints each key on its own line and the value indented on the next one.
    expect(r.out).toMatch(/Authentication Scope\s+FULL/);
    expect(r.out).toMatch(/Integrity\s+verified: the body recomputes to this artifactId/);
    expect(r.out).toMatch(/Replay\s+not run by explain/);
    expect(r.out).toMatch(/hardkas replay verify /);
    expect(r.out).toMatch(/Consensus Validation\s+NOT performed/);
  });

  it("T-A14a · `tx send` in the simulator prints the computed outcome and no replay id or replay verdict", () => {
    const r = run(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated"], ws);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/Transaction simulated successfully/); // the computed outcome of this run
    // Wave 2(e) · AUX-11: the success line must be backed by the receipt this run wrote.
    expect(r.out).not.toMatch(/Artifact ID\s+unknown/);
    expect(r.out).not.toMatch(/Replay ID/);
    expect(r.out).not.toMatch(/deterministic reproducible/);
    expect(r.out).not.toMatch(/deterministic replay/);
    expect(r.out).toMatch(/Replay Status\s+not run/);
    expect(r.out).toMatch(/Consensus Validated\s+NO\b/);
    expect(r.out).not.toMatch(/Consensus Validated\s+YES/);
  });

  it("T-A14a · manipulated chain: a tampered receipt is refused by `explain` (verified lookup) and nothing is called successful", () => {
    const tampered = JSON.parse(fs.readFileSync(receiptPath, "utf8"));
    tampered.amountSompi = "1";
    fs.writeFileSync(receiptPath, JSON.stringify(tampered, null, 2));

    for (const args of [["explain", receiptId], ["explain", "--tx", txId]]) {
      const r = run(args, ws);
      expect(r.status, r.out).not.toBe(0);
      expect(r.out).not.toMatch(/successful/i);
      expect(r.out).not.toMatch(/Integrity\s+verified: the body recomputes to this artifactId/);
      expect(r.out).toMatch(/does not verify|CANDIDATE_INVALID|Not Found|ARTIFACT_NOT_FOUND/i);
    }
  });
});
