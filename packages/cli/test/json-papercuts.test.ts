import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { Hardkas } from "@hardkas/sdk";

// -----------------------------------------------------------------------------
// JSON-PAPERCUTS (2026-10-04). The contract under test, for `--json`:
//   stdout is EXACTLY ONE JSON document (`JSON.parse(stdout.trim())`), with `ok`;
//   no human rendering of the same information on either stream;
//   the exit code agrees with `ok`, except where AUX-11 fixes it (a broadcast that
//   happened is `submitted`, exit 0, whatever happened to the deployment record).
// Defects: #40 `tx profile`, #5 `artifact lineage`, #39 `deploy track`,
// #19 `tx send --track`, and `replay verify` without `ok`.
// -----------------------------------------------------------------------------

const cliDist = path.resolve(__dirname, "../dist/index.js");

function run(args: string[], cwd: string) {
  const r = spawnSync(process.execPath, [cliDist, ...args], {
    cwd,
    encoding: "utf8",
    env: { ...process.env, HARDKAS_TEST_IGNORE_STALENESS: "1", NO_COLOR: "1" }
  });
  return { status: r.status, stdout: r.stdout ?? "", stderr: r.stderr ?? "", out: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
}

/** The strict contract: one document, parsed as a whole. */
function single(stdout: string): any {
  return JSON.parse(stdout.trim());
}

function planAndSign(ws: string, amount: string, tag: string): { plan: any; signed: any } {
  const p = run(["tx", "plan", "--from", "alice", "--to", "bob", "--amount", amount, "--network", "simulated", "--out", `plan-${tag}.json`, "--json"], ws);
  expect(p.status, p.out).toBe(0);
  const s = run(["tx", "sign", `plan-${tag}.json`, "--account", "alice", "--out", `signed-${tag}.json`, "--json"], ws);
  expect(s.status, s.out).toBe(0);
  return {
    plan: JSON.parse(fs.readFileSync(path.join(ws, `plan-${tag}.json`), "utf8")),
    signed: JSON.parse(fs.readFileSync(path.join(ws, `signed-${tag}.json`), "utf8"))
  };
}

/** The receipts of the workspace's artifact store (a broadcast writes exactly one). */
function receiptFiles(ws: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/receipt/i.test(entry.name)) out.push(p);
    }
  };
  walk(path.join(ws, ".hardkas", "artifacts"));
  return out.sort();
}

describe("JSON-PAPERCUTS · --json is one JSON document with a verdict", () => {
  let ws: string;
  let plan: any;
  let signed: any;
  let recordedReceiptId: string | null = null;

  beforeAll(async () => {
    ws = fs.mkdtempSync(path.join(os.tmpdir(), "hk-json-papercuts-"));
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    ({ plan, signed } = planAndSign(ws, "10", "a"));
  }, 120_000);

  afterAll(() => {
    fs.rmSync(ws, { recursive: true, force: true });
  });

  it("#40 · tx profile --json: the profile is the envelope's result; the text rendering is not printed", () => {
    const r = run(["tx", "profile", "plan-a.json", "--json"], ws);
    expect(r.status, r.out).toBe(0);
    const env = single(r.stdout);
    expect(env).toMatchObject({ ok: true, command: "tx profile", mode: "cli" });
    expect(env.result.planId).toBe(plan.planId);
    expect(env.result.artifactId).toBe(plan.contentHash);
    expect(env.result.networkId).toBe("simulated");
    expect(env.result.amountSompi).toBe(String(plan.amountSompi));
    expect(env.result.mass.total).toMatch(/^\d+$/);
    expect(env.result.mass.base).toMatch(/^\d+$/);
    expect(env.result.structure.inputs).toHaveLength(plan.inputs.length);
    expect(env.result.structure.outputs).toHaveLength(plan.outputs.length);
    expect(Array.isArray(env.result.warnings)).toBe(true);
    expect(r.out).not.toMatch(/Mass Breakdown|Transaction Profile/);

    // human mode is unchanged: text, never JSON
    const h = run(["tx", "profile", "plan-a.json"], ws);
    expect(h.status, h.out).toBe(0);
    expect(h.stdout).toMatch(/Mass Breakdown/);
    expect(() => single(h.stdout)).toThrow();
  });

  it("#5 · artifact lineage --json: lineage, chain and verification in one envelope; the text is not printed", () => {
    const r = run(["artifact", "lineage", "signed-a.json", "--json"], ws);
    expect(r.status, r.out).toBe(0);
    const env = single(r.stdout);
    expect(env).toMatchObject({ ok: true, command: "artifact lineage", mode: "cli" });
    expect(env.result.orphan).toBe(false);
    expect(env.result.lineage.artifactId).toBe(signed.contentHash);
    expect(env.result.lineage.parentArtifactId).toBe(plan.contentHash);
    expect(env.result.lineage.rootArtifactId).toBe(plan.contentHash);
    expect(env.result.chain.map((c: any) => c.role)).toEqual(["root", "parent", "here"]);
    expect(env.result.verification).toEqual({ ok: true, issues: [] });
    expect(r.out).not.toMatch(/PROVENANCE CHAIN|Lineage ID:/);

    // human mode is unchanged
    const h = run(["artifact", "lineage", "signed-a.json"], ws);
    expect(h.status, h.out).toBe(0);
    expect(h.stdout).toMatch(/PROVENANCE CHAIN/);
    expect(() => single(h.stdout)).toThrow();
  });

  it("#5 · an orphan (no lineage block) is ok:true with orphan:true, exit 0", () => {
    fs.writeFileSync(path.join(ws, "orphan.json"), JSON.stringify({ schema: "hardkas.txPlan", planId: "plan-orphan" }));
    const r = run(["artifact", "lineage", "orphan.json", "--json"], ws);
    expect(r.status, r.out).toBe(0);
    const env = single(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.result.orphan).toBe(true);
    expect(env.result.lineage).toBeNull();
    expect(env.result.verification).toBeNull();
    expect(env.result.warnings.join(" ")).toMatch(/orphan/);
  });

  it("#5 · an inconsistent lineage is ONE envelope: ok:false, LINEAGE_VIOLATIONS, the issues, exit 1", () => {
    // A version-5 root that carries a self reference is a lineage violation (IC-1′.5).
    const broken = { ...plan, lineage: { ...plan.lineage, rootArtifactId: plan.contentHash } };
    fs.writeFileSync(path.join(ws, "broken-lineage.json"), JSON.stringify(broken));
    const r = run(["artifact", "lineage", "broken-lineage.json", "--json"], ws);
    expect(r.status, r.out).toBe(1);
    const env = single(r.stdout);
    expect(env).toMatchObject({ ok: false, command: "artifact lineage", mode: "cli", code: "LINEAGE_VIOLATIONS" });
    expect(env.result.verification.ok).toBe(false);
    expect(env.result.verification.issues.map((i: any) => i.code)).toContain("LINEAGE_ROOT_SELF_REFERENCE");
    expect(r.stderr).not.toMatch(/^\s*\{/m);

    // a missing file is still the typed error envelope
    const m = run(["artifact", "lineage", "missing.json", "--json"], ws);
    expect(m.status).toBe(1);
    expect(single(m.stdout)).toMatchObject({ ok: false, code: "FILE_NOT_FOUND" });
  });

  it("#39 · deploy track --json prints the record it wrote; a taken label is DEPLOYMENT_EXISTS", () => {
    const args = ["deploy", "track", "papercut", "--network", "simulated", "--tx-id", signed.txId, "--status", "sent", "--notes", "json papercut", "--json"];
    const r = run(args, ws);
    expect(r.status, r.out).toBe(0);
    const env = single(r.stdout);
    expect(env).toMatchObject({ ok: true, command: "deploy track", mode: "cli" });
    expect(env.result.label).toBe("papercut");
    expect(env.result.networkId).toBe("simulated");
    expect(env.result.txId).toBe(signed.txId);
    expect(env.result.status).toBe("sent");
    expect(env.result.notes).toBe("json papercut");
    expect(env.result.contentHash).toMatch(/^[0-9a-f]{64}$/);
    expect(r.out).not.toMatch(/Tracked deployment/);

    const dup = run(args, ws);
    expect(dup.status).toBe(1);
    expect(single(dup.stdout)).toMatchObject({ ok: false, code: "DEPLOYMENT_EXISTS", mode: "cli" });

    // the record is the one `deploy inspect` reads back
    const i = run(["deploy", "inspect", "papercut", "--network", "simulated", "--json"], ws);
    expect(i.status, i.out).toBe(0);
    expect(single(i.stdout).contentHash).toBe(env.result.contentHash);

    // human mode is unchanged
    const h = run(["deploy", "track", "papercut-human", "--network", "simulated", "--tx-id", signed.txId], ws);
    expect(h.status, h.out).toBe(0);
    expect(h.stdout).toMatch(/Tracked deployment: papercut-human \(simulated\)/);
  });

  it("#19 · a --track label that cannot be recorded is refused BEFORE anything is broadcast: ok:false, not_executed, typed code, no receipt", () => {
    const before = receiptFiles(ws);

    // 'papercut' is already recorded on this network (previous test)
    const taken = run(["tx", "send", "signed-a.json", "--network", "simulated", "--track", "papercut", "--json"], ws);
    expect(taken.status, taken.out).toBe(1);
    const te = single(taken.stdout);
    expect(te).toMatchObject({ ok: false, command: "tx send", mode: "cli", outcome: "not_executed", code: "DEPLOYMENT_EXISTS", network: "simulated", label: "papercut" });
    expect(te.message).toMatch(/^NOT EXECUTED: .*Nothing was broadcast or written/);
    expect(JSON.stringify(te)).not.toMatch(/"outcome":"submitted"/);

    // a label that is not a plain name (DEPLOYMENT-PATH-CONTAINMENT-1) is a usage error, exit 2
    const invalid = run(["tx", "send", "signed-a.json", "--network", "simulated", "--track", "../../artifacts/tracked", "--json"], ws);
    expect(invalid.status, invalid.out).toBe(2);
    expect(single(invalid.stdout)).toMatchObject({ ok: false, outcome: "not_executed", code: "DEPLOYMENT_LABEL_INVALID" });

    // human mode says the same, without JSON
    const human = run(["tx", "send", "signed-a.json", "--network", "simulated", "--track", "papercut"], ws);
    expect(human.status).toBe(1);
    expect(human.out).toMatch(/NOT EXECUTED/);
    expect(human.out).toMatch(/DEPLOYMENT_EXISTS/);
    expect(() => single(human.stdout)).toThrow();

    expect(receiptFiles(ws), "nothing was broadcast").toEqual(before);
    expect(fs.existsSync(path.join(ws, ".hardkas", "artifacts", "tracked.json"))).toBe(false);
  });

  it("#19 · a record that fails AFTER the broadcast is stated in the one envelope; the broadcast stays `submitted`, exit 0", async () => {
    // The network's record directory is blocked by a plain file, which the pre-check cannot see
    // (no record exists), so the broadcast happens and only the record write fails.
    const blocked = fs.mkdtempSync(path.join(os.tmpdir(), "hk-json-papercuts-blocked-"));
    try {
      await Hardkas.create({ cwd: blocked, autoBootstrap: true, network: "simulated" });
      const { signed: s1 } = planAndSign(blocked, "10", "x");
      fs.mkdirSync(path.join(blocked, ".hardkas", "deployments"), { recursive: true });
      fs.writeFileSync(path.join(blocked, ".hardkas", "deployments", "simulated"), "not a directory");

      const r = run(["tx", "send", "signed-x.json", "--network", "simulated", "--track", "late", "--json"], blocked);
      expect(r.status, r.out).toBe(0);
      const env = single(r.stdout);
      expect(env.ok).toBe(true);
      expect(env.outcome).toBe("submitted");
      expect(env.data.receipt.txId).toBe(s1.txId);
      expect(env.tracking).toMatchObject({ requested: true, label: "late", recorded: false });
      expect(typeof env.tracking.code).toBe("string");
      expect(env.tracking.message.length).toBeGreaterThan(0);
      expect(env.tracking.retry).toMatch(/^hardkas deploy track late --network simulated --tx-id /);
      expect(env.data.warnings).toHaveLength(1);
      expect(env.data.warnings[0]).toMatch(/^DEPLOYMENT_TRACK_FAILED: the transaction was broadcast, but the deployment record 'late'/);
      expect(r.stderr).not.toMatch(/^\s*\{/m);
      expect(receiptFiles(blocked)).toHaveLength(1);

      // human mode: the failure is visible after the submission block, exit 0
      const { signed: s2 } = planAndSign(blocked, "11", "y");
      const h = run(["tx", "send", "signed-y.json", "--network", "simulated", "--track", "late"], blocked);
      expect(h.status, h.out).toBe(0);
      expect(h.out).toMatch(/Transaction simulated successfully/);
      expect(h.out).toMatch(/DEPLOYMENT_TRACK_FAILED/);
      expect(h.out).toMatch(/hardkas deploy track late --network simulated/);
      expect(h.out).not.toMatch(/Tracked deployment: late \(simulated\)/);
      expect(h.out).toContain(s2.txId.slice(0, 16));
    } finally {
      fs.rmSync(blocked, { recursive: true, force: true });
    }
  }, 120_000);

  it("#19 · control: a fresh label is recorded, and the envelope says so", () => {
    const { signed: signedB } = planAndSign(ws, "11", "b");
    const r = run(["tx", "send", "signed-b.json", "--network", "simulated", "--track", "fresh", "--json"], ws);
    expect(r.status, r.out).toBe(0);
    const env = single(r.stdout);
    expect(env.ok).toBe(true);
    expect(env.outcome).toBe("submitted");
    expect(env.tracking).toMatchObject({ requested: true, label: "fresh", recorded: true });
    expect(env.tracking.record.txId).toBe(signedB.txId);
    expect(env.tracking.record.status).toBe("sent");
    expect(env.data.warnings).toEqual([]);
    recordedReceiptId = env.data.receipt.contentHash;

    const i = run(["deploy", "inspect", "fresh", "--network", "simulated", "--json"], ws);
    expect(i.status, i.out).toBe(0);
    expect(single(i.stdout).txId).toBe(signedB.txId);

    // human mode names the record it wrote
    const { signed: signedC } = planAndSign(ws, "12", "c");
    const h = run(["tx", "send", "signed-c.json", "--network", "simulated", "--track", "fresh-human"], ws);
    expect(h.status, h.out).toBe(0);
    expect(h.out).toMatch(/Tracked deployment: fresh-human \(simulated\)/);
    expect(single(run(["deploy", "inspect", "fresh-human", "--network", "simulated", "--json"], ws).stdout).txId).toBe(signedC.txId);

    // without --track the envelope carries no tracking block
    const { signed: signedD } = planAndSign(ws, "13", "d");
    const n = run(["tx", "send", "signed-d.json", "--network", "simulated", "--json"], ws);
    expect(n.status, n.out).toBe(0);
    const plain = single(n.stdout);
    expect(plain.ok).toBe(true);
    expect(plain.tracking).toBeUndefined();
    expect(plain.data.receipt.txId).toBe(signedD.txId);
  });

  it("replay verify --json: the success envelope carries ok:true (the failure envelope already did)", () => {
    expect(recordedReceiptId, "a receipt from the control send").toMatch(/^[0-9a-f]{64}$/);
    const r = run(["replay", "verify", recordedReceiptId!, "--json"], ws);
    expect(r.status, r.out).toBe(0);
    const env = single(r.stdout);
    expect(env).toMatchObject({ ok: true, command: "replay verify", mode: "cli", schemaVersion: "hardkas.replayVerify.v1", result: "passed" });
    expect(env.deterministic).toBe(true);

    // the failure envelope is untouched: ok:false with the typed code
    const f = run(["replay", "verify", "f".repeat(64), "--json"], ws);
    expect(f.status).not.toBe(0);
    const fe = single(f.stdout);
    expect(fe.ok).toBe(false);
    expect(typeof fe.code).toBe("string");
  });
});
