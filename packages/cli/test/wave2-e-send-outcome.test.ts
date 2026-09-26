import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

// Wave 2(e) · AUX-11 · T-AUX11 — `tx send` ends in exactly one of three unambiguous outcomes:
//   submitted (exit 0), explicitly NOT executed (exit 3 = POLICY_DENIED, code
//   TX_SEND_CONFIRMATION_REQUIRED, `outcome: "not_executed"` in JSON), or failed (exit ≠ 0).
//   A missing `--yes` on a non-simulated network is a refusal, never a dry-run that looks like
//   success to automation, and it writes nothing.

const cliDist = path.resolve(__dirname, "../dist/index.js");

function run(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", NO_COLOR: "1" }
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

function artifactFiles(ws: string): string[] {
  const root = path.join(ws, ".hardkas", "artifacts");
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else out.push(path.relative(root, p));
    }
  };
  walk(root);
  return out.sort();
}

describe("Wave 2(e) · AUX-11 · tx send outcomes are unambiguous", () => {
  let ws: string;
  let unconfirmedSignedPath: string;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w2e-"));
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    // A well-formed signed artifact for a NON-simulated network (never broadcast by this test).
    const signed: any = {
      schema: "hardkas.signedTx",
      schemaVersion: "hardkas.artifact.v1",
      hardkasVersion: "0.12.0-rc.23",
      version: "1.0.0-alpha",
      hashVersion: CURRENT_HASH_VERSION,
      createdAt: "2026-09-26T00:00:00.000Z",
      networkId: "testnet-10",
      mode: "rpc",
      execution: { mode: "rpc", domain: "kaspa-l1", network: "testnet-10" },
      status: "signed",
      sourcePlanId: "plan-0000000000000000",
      from: { address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e" },
      to: { address: "kaspatest:qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqkx9awp4e" },
      amountSompi: "100000000",
      txId: "f".repeat(64),
      signedTransaction: { format: "hex", payload: "deadbeef" },
      workflowId: "wf_0000000000000000",
      assumptionLevel: "testnet-10",
      lineage: { artifactId: "", parentArtifactId: "a".repeat(64), lineageId: "a".repeat(64), rootArtifactId: "a".repeat(64), sequence: 2 }
    };
    signed.contentHash = calculateContentHash(signed, CURRENT_HASH_VERSION);
    signed.lineage.artifactId = signed.contentHash;
    signed.signedId = `signed-${signed.contentHash.slice(0, 16)}`;
    unconfirmedSignedPath = path.join(ws, "unconfirmed-signed.json");
    fs.writeFileSync(unconfirmedSignedPath, JSON.stringify(signed, null, 2));
  });

  afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("T-AUX11 · shortcut mode without --yes on a non-simulated network: NOT executed, exit 3, nothing written, nothing that reads as success", () => {
    const before = artifactFiles(ws);
    const r = run(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "testnet-10"], ws);
    expect(r.status).toBe(3);
    expect(r.out).toMatch(/NOT EXECUTED/);
    expect(r.out).toMatch(/TX_SEND_CONFIRMATION_REQUIRED/);
    expect(r.out).toMatch(/--yes/);
    expect(r.out).not.toMatch(/successfully|submitted|DRY RUN/i);
    expect(artifactFiles(ws)).toEqual(before);
  });

  it("T-AUX11 · the same refusal is machine-readable in --json: ok:false, outcome:not_executed, the code, exit 3", () => {
    const r = run(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "testnet-10", "--json"], ws);
    expect(r.status).toBe(3);
    const env = JSON.parse(r.stdout.trim());
    expect(env).toMatchObject({ ok: false, command: "tx send", outcome: "not_executed", code: "TX_SEND_CONFIRMATION_REQUIRED", network: "testnet-10" });
    expect(env.nextSteps.join(" ")).toMatch(/--yes/);
    expect(JSON.stringify(env)).not.toMatch(/submitted|dry/i);
  });

  it("T-AUX11 · signed-artifact mode without --yes on a non-simulated network is refused the same way, before any RPC", () => {
    const before = artifactFiles(ws);
    const r = run(["tx", "send", unconfirmedSignedPath, "--json"], ws);
    expect(r.status).toBe(3);
    const env = JSON.parse(r.stdout.trim());
    expect(env).toMatchObject({ ok: false, outcome: "not_executed", code: "TX_SEND_CONFIRMATION_REQUIRED", network: "testnet-10" });
    expect(artifactFiles(ws)).toEqual(before);
  });

  it("control · a simulated shortcut send really runs and is `submitted`: ok:true, outcome:submitted, a receipt, exit 0", () => {
    // BEFORE 2(e) the shortcut path never forwarded the confirmation to the flow, whose send step
    // stayed `blocked`, and the command still printed success with no receipt and exit 0.
    const before = artifactFiles(ws);
    const r = run(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated", "--json"], ws);
    expect(r.status, r.out).toBe(0);
    const env = JSON.parse(r.stdout.trim());
    expect(env.ok).toBe(true);
    expect(env.outcome).toBe("submitted");
    expect(env.data.receipt.txId).toMatch(/^synthetic-[0-9a-f]{64}$/);
    expect(env.data.receipt.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(artifactFiles(ws).length).toBeGreaterThan(before.length);
  });

  it("control · the same send in human mode names the receipt it wrote (no 'unknown' artifact behind a success line)", () => {
    const r = run(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1", "--network", "simulated"], ws);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/Transaction simulated successfully/);
    expect(r.out).toMatch(/Artifact ID\s+[0-9a-f]{64}/);
    expect(r.out).not.toMatch(/Artifact ID\s+unknown/);
    expect(r.out).not.toMatch(/Tx ID\s+unknown/);
  });

  it("T-AUX11 · a shortcut send whose flow fails before broadcasting is `failed`: ok:false, outcome:failed, exit 1, never submitted", () => {
    const before = artifactFiles(ws);
    const r = run(["tx", "send", "--from", "alice", "--to", "bob", "--amount", "1000000000000", "--network", "simulated", "--json"], ws);
    expect(r.status, r.out).toBe(1);
    const env = JSON.parse(r.stdout.trim());
    expect(env).toMatchObject({ ok: false, command: "tx send", outcome: "failed", code: "TX_SEND_FAILED" });
    expect(env.steps.send).not.toBe("ok");
    expect(env.message).toMatch(/^FAILED: 'tx send' did not broadcast \(plan step failed: /);
    expect(JSON.stringify(env)).not.toMatch(/"outcome":"submitted"/);
    // a failed flow may leave no receipt behind; whatever it wrote, nothing is a receipt/submission
    const written = artifactFiles(ws).filter((f) => !before.includes(f));
    expect(written.filter((f) => /receipt|submission/i.test(f))).toEqual([]);
  });
});
