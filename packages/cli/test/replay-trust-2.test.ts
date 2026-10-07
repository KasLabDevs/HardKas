import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { calculateContentHash, CURRENT_HASH_VERSION, enumerateWorkspaceArtifactsSync } from "@hardkas/artifacts";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// REPLAY-TRUST-2 (investigation, 2026-10-05, base 43d30e4f5) · BEFORE on the real CLI (built dist), in a configured
// project with one simulated payment. Each assertion is about what replay decides, records and leaves in the workspace:
// - §4b · after any `replay verify`, `hardkas verify` fails: the persisted report has no lineage (it does not name the
//   receipt it verified), no workflowId and no assumptionLevel;
// - REPLAY-DIVERGENCE-EVENT-1 · the ledger never records a replay outcome;
// - REPLAY-DIFF-SCOPE-1 · a re-sealed receipt with another status replays as reproduced; `replay diff` cannot tell a
//   reproduced report from a diverged one;
// - (new) a receipt that fails integrity after resolution still gets a persisted report saying "reproduced", while the
//   command fails.

const cli = (args: string[], cwd: string) => {
  const r = spawnSync(process.execPath, [cliDist, ...args], { cwd, env: childEnv(), encoding: "utf8", timeout: 120_000 });
  return { status: r.status, stdout: r.stdout ?? "", all: `${r.stdout ?? ""}\n${r.stderr ?? ""}` };
};
const json = (s: string) => {
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};
/** A changed copy of an artifact, re-sealed as any producer seals one (v5 identity, lineage.artifactId = identity). */
const resealed = (a: any, change: (x: any) => void) => {
  const x = structuredClone(a);
  change(x);
  delete x.contentHash;
  if (x.lineage) delete x.lineage.artifactId;
  const h = calculateContentHash(x, CURRENT_HASH_VERSION);
  x.contentHash = h;
  if (x.lineage) x.lineage = { ...x.lineage, artifactId: h };
  return x;
};

describe("REPLAY-TRUST-2 · BEFORE · replay on the real CLI", () => {
  let parent: string;
  let ws: string;
  let store: string;
  let receiptPath: string;
  let receipt: any;
  const reports = () => fs.readdirSync(store).filter((f) => f.endsWith(".replay.json")).sort();
  const readReport = (f: string) => JSON.parse(fs.readFileSync(path.join(store, f), "utf8"));
  const ledger = () => {
    const f = path.join(ws, "events.jsonl");
    return fs.existsSync(f) ? fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l)) : [];
  };
  /** One `replay verify --json`; the reports it added to the store. */
  const replay = (target: string) => {
    const before = reports();
    const r = cli(["replay", "verify", target, "--json"], ws);
    return { ...r, json: json(r.stdout), added: reports().filter((f) => !before.includes(f)) };
  };
  const forge = (name: string, change: (x: any) => void) => {
    const p = path.join(store, "receipts", `forged-${name}.json`);
    fs.writeFileSync(p, JSON.stringify(resealed(receipt, change), null, 2));
    return p;
  };

  beforeAll(async () => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-rt2-"));
    ws = path.join(parent, "project");
    fs.mkdirSync(ws);
    fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};\n");
    await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
    for (const args of [
      ["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "7", "--network", "simulated", "--out", "a-plan.json", "--json"],
      ["tx", "sign", "a-plan.json", "--out", "a-signed.json", "--json"],
      ["tx", "send", "a-signed.json", "--network", "simulated", "--json"]
    ]) {
      const r = cli(args, ws);
      expect(r.status, r.all).toBe(0);
    }
    store = path.join(ws, ".hardkas", "artifacts");
    const entry: any = enumerateWorkspaceArtifactsSync(ws).find((e: any) => e.artifact?.schema === "hardkas.txReceipt");
    receiptPath = entry.path;
    receipt = entry.artifact;
  });

  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  it("control: before any replay, `hardkas verify` passes", () => {
    const r = cli(["verify", "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
  });

  it("control: the genuine receipt replays as reproduced, and its report is persisted", () => {
    const r = replay(receiptPath);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    expect(r.json?.ok).toBe(true);
    expect(r.added.length).toBe(1);
    expect(readReport(r.added[0]!).checks.workflowDeterministic).toBe("reproduced");
  });

  it("§4b · after that replay, `hardkas verify` still passes", () => {
    const r = cli(["verify", "--json"], ws);
    const failed = (json(r.stdout)?.result?.results ?? []).filter((x: any) => !x.result?.ok).map((x: any) => `${x.file}: ${(x.result?.errors ?? []).join("; ")}`);
    expect(r.status, failed.join(" | ") || r.all.slice(0, 600)).toBe(0);
  });

  it("§4b · the persisted report names the receipt it verified", () => {
    const report = readReport(reports()[0]!);
    expect(report.lineage?.parentArtifactId, `report keys: ${Object.keys(report).join(", ")}`).toBe(receipt.contentHash);
  });

  it("control: the replay run wrote events to the ledger (the bus and the appender work)", () => {
    expect(ledger().some((e) => e.kind === "artifact.written")).toBe(true);
  });

  it("REPLAY-DIVERGENCE-EVENT-1 · the ledger records that the genuine replay was verified", () => {
    const kinds = ledger().map((e) => e.kind);
    expect(ledger().some((e) => e.kind === "replay.verified" && JSON.stringify(e).includes(receipt.txId)), JSON.stringify([...new Set(kinds)])).toBe(true);
  });

  it("control: a re-sealed receipt with another amount diverges (REPLAY_DIVERGED)", () => {
    const r = replay(forge("amount", (x) => (x.amountSompi = String(BigInt(x.amountSompi) + 1n))));
    expect(r.status).not.toBe(0);
    expect(r.json?.code).toBe("REPLAY_DIVERGED");
  });

  it("REPLAY-DIVERGENCE-EVENT-1 · the ledger records the divergence of that replay", () => {
    const kinds = ledger().map((e) => e.kind);
    expect(ledger().some((e) => e.kind === "replay.divergence" && JSON.stringify(e).includes("amountSompi")), JSON.stringify([...new Set(kinds)])).toBe(true);
  });

  it("REPLAY-DIFF-SCOPE-1 · a re-sealed receipt that says the transaction failed does not replay as reproduced", () => {
    const r = replay(forge("status", (x) => (x.status = "failed")));
    expect(r.status, `exit ${r.status} · ${JSON.stringify(r.json)?.slice(0, 300)}`).not.toBe(0);
  });

  it("a re-sealed receipt that fails integrity (schema) leaves no persisted report claiming it was reproduced", () => {
    const r = replay(forge("schema", (x) => (x.dagContext = { mode: "dag", sink: "forged-sink" })));
    expect(r.status, "control: the command fails").not.toBe(0);
    const claims = r.added.map(readReport).filter((rep: any) => rep.invariantsOk === true || rep.checks?.workflowDeterministic === "reproduced");
    expect(claims.length, `reports added by this failed run: ${JSON.stringify(r.added.map(readReport).map((x: any) => x.checks))}`).toBe(0);
  });

  it("REPLAY-DIFF-SCOPE-1 · `replay diff` tells a reproduced report from a diverged one", () => {
    const all = reports().map((f) => ({ f, rep: readReport(f) }));
    const reproduced = all.find((x) => x.rep.checks.workflowDeterministic === "reproduced" && x.rep.invariantsOk)!;
    const diverged = all.find((x) => x.rep.checks.workflowDeterministic === "diverged")!;
    expect(reproduced && diverged, "precondition: one reproduced and one diverged report").toBeTruthy();
    const r = cli(["replay", "diff", reproduced.f.replace(/\.json$/, ""), diverged.f.replace(/\.json$/, ""), "--json"], ws);
    const d = json(r.stdout);
    const different =
      d?.deterministic?.stateRootDiverged ||
      d?.deterministic?.lineageDiverged ||
      d?.deterministic?.graphDiverged ||
      (d?.deterministic?.differences?.length ?? 0) > 0;
    expect(different, JSON.stringify(d?.deterministic)).toBe(true);
  });
});
