import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Hardkas } from "@hardkas/sdk";
import { enumerateWorkspaceArtifactsSync } from "@hardkas/artifacts";
import { cliDist, childEnv } from "./first-contact-helpers.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

// WORKSPACE-AUTHORITY-1 (2026-10-05) · written as the BEFORE of the investigation (19 defect reproductions + 6 controls,
// all failing/passing as expected on b4c1f0111) and kept unchanged as the regression suite of the fix. Real processes on
// the built CLI. Each assertion is about WHAT the workspace holds, never about WHERE the fix puts it. The defects were:
// - A · the CLI writes `<root>/events.jsonl`, while `query events`, the projection and snapshots read other paths, and
//   the projection keyed events by (correlation, sequence, kind) instead of their identity;
// - B · an observation (`status`) creates `.hardkas/store.db`; the query engine then reads that empty projection instead
//   of the workspace and every query fails; a stale projection is answered as the truth and reported healthy;
//   `query store rebuild` reports success while it indexed nothing;
// - C · `status` and `ci verify` count only the top-level files of the artifact store;
// - D · `query tx` loses the plan, gives the trace role "unknown" and counts a user's `--out` copy as evidence;
// - E · `localnet snapshot verify` cannot find what `localnet snapshot create` just made (two snapshot models);
// - F · read-only commands run from a subdirectory of a workspace bootstrap a second workspace there; in a configured
//   project, `accounts balance` and `tx plan` from a subdirectory read a fresh simulator state there, not the project's.
// The resolver (`enumerateWorkspaceArtifactsSync`) is the reference for which artifacts exist.

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
const filesUnder = (dir: string): string[] => {
  const out: string[] = [];
  const walk = (d: string) => {
    if (!fs.existsSync(d)) return;
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.name === "node_modules") continue;
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else out.push(p);
    }
  };
  walk(dir);
  return out;
};

async function newWorkspace(parent: string, name: string): Promise<string> {
  const ws = path.join(parent, name);
  fs.mkdirSync(ws, { recursive: true });
  await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
  return ws;
}

/** One simulated payment through the real CLI; the receipt as the resolver sees it. */
function pay(ws: string, tag: string, amount = "1") {
  for (const args of [
    ["tx", "plan", "--from", "alice", "--to", "bob", "--amount", amount, "--network", "simulated", "--out", `${tag}-plan.json`, "--json"],
    ["tx", "sign", `${tag}-plan.json`, "--out", `${tag}-signed.json`, "--json"],
    ["tx", "send", `${tag}-signed.json`, "--network", "simulated", "--json"]
  ]) {
    const r = cli(args, ws);
    expect(r.status, r.all).toBe(0);
  }
  const receipts = enumerateWorkspaceArtifactsSync(ws).filter((e: any) => e.artifact?.schema === "hardkas.txReceipt");
  const receipt: any = receipts.sort((a: any, b: any) => String(b.artifact.createdAt).localeCompare(String(a.artifact.createdAt)))[0];
  return { txId: receipt.artifact.txId as string, receiptPath: receipt.path as string, receiptHash: receipt.artifact.contentHash as string };
}

const resolverCount = (ws: string) => enumerateWorkspaceArtifactsSync(ws).length;
/** Distinct identities among the resolver's entries (the `tx plan` lattice copy repeats the plan's identity). */
const distinctIdentities = (ws: string) =>
  new Set(enumerateWorkspaceArtifactsSync(ws).map((e: any) => e.artifact?.contentHash ?? e.path)).size;
const statusArtifacts = (out: string) => Number((out.match(/Artifacts\s+(\d+)/) ?? [])[1]);
/** Whether a count is one of the resolver's two honest answers: its entries, or its distinct identities. */
const countsTheStore = (n: number, ws: string) => n >= distinctIdentities(ws) && n <= resolverCount(ws);

describe("WORKSPACE-AUTHORITY-1 · BEFORE", () => {
  let parent: string;
  beforeAll(() => {
    parent = fs.mkdtempSync(path.join(os.tmpdir(), "hk-wa1-"));
  });
  afterAll(() => {
    fs.rmSync(parent, { recursive: true, force: true });
  });

  describe("A · one event ledger: what the CLI records is what the readers read", () => {
    let ws: string;
    /** The events this workspace recorded, wherever a ledger file is (root or .hardkas). */
    const recorded = (dir: string) =>
      [path.join(dir, "events.jsonl"), path.join(dir, ".hardkas", "events.jsonl")]
        .filter((f) => fs.existsSync(f))
        .reduce((n, f) => n + fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).length, 0);
    beforeAll(async () => {
      ws = await newWorkspace(parent, "a");
      pay(ws, "a");
    });

    it("control: the workspace recorded events", () => {
      expect(recorded(ws)).toBeGreaterThan(0);
    });

    it("`query events` returns the events the workspace recorded", () => {
      const before = recorded(ws);
      const r = cli(["query", "events", "--json"], ws);
      expect(json(r.stdout)?.result?.total ?? 0, `recorded: ${before} · ${r.all.slice(0, 300)}`).toBeGreaterThanOrEqual(before);
    });

    it("`query store rebuild --backend sqlite` indexes the events the workspace recorded", () => {
      const copy = path.join(parent, "a-rebuild");
      fs.cpSync(ws, copy, { recursive: true });
      const before = recorded(copy);
      const r = cli(["query", "store", "rebuild", "--backend", "sqlite", "--json"], copy);
      expect(json(r.stdout)?.result?.events?.indexed ?? 0, r.all.slice(0, 300)).toBeGreaterThanOrEqual(before);
    });

    it("the projection holds every event of the ledger (two distinct events are two rows)", () => {
      // Path-neutral: the same recorded ledger is placed at both candidate paths, so whichever one the indexer reads
      // it sees these events; the index must then hold each of them.
      const copy = path.join(parent, "a-index");
      fs.cpSync(ws, copy, { recursive: true });
      const ledger = [path.join(copy, "events.jsonl"), path.join(copy, ".hardkas", "events.jsonl")].find((f) => fs.existsSync(f))!;
      const content = fs.readFileSync(ledger, "utf8");
      const distinct = new Set(content.split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l).eventId)).size;
      fs.writeFileSync(path.join(copy, "events.jsonl"), content);
      fs.writeFileSync(path.join(copy, ".hardkas", "events.jsonl"), content);
      expect(distinct, "precondition: the ledger holds distinct events").toBeGreaterThan(1);
      expect(cli(["query", "store", "rebuild", "--backend", "sqlite", "--json"], copy).status).toBe(0);
      const r = cli(["query", "events", "--json"], copy);
      expect(json(r.stdout)?.result?.total, r.all.slice(0, 300)).toBe(distinct);
    });

    it("`localnet snapshot create` captures the events the workspace recorded", () => {
      const copy = path.join(parent, "a-snapshot");
      fs.cpSync(ws, copy, { recursive: true });
      const before = recorded(copy);
      expect(cli(["localnet", "snapshot", "create", "s1", "--json"], copy).status).toBe(0);
      const captured = filesUnder(path.join(copy, "snapshots", "s1"))
        .filter((f) => path.basename(f) === "events.jsonl")
        .reduce((n, f) => n + fs.readFileSync(f, "utf8").split(/\r?\n/).filter(Boolean).length, 0);
      expect(captured, `recorded before the snapshot: ${before}`).toBeGreaterThanOrEqual(before);
    });
  });

  describe("B · the query store is derived from the workspace, never its authority", () => {
    it("control: with no store.db the query commands answer from the workspace", async () => {
      const ws = await newWorkspace(parent, "b-control");
      const p = pay(ws, "a");
      const r = cli(["query", "tx", p.txId, "--json"], ws);
      expect(r.status, r.all).toBe(0);
      expect(json(r.stdout).result.items[0].artifacts.length).toBeGreaterThan(0);
    });

    it("`status` (an observation) creates nothing in the workspace", async () => {
      const ws = await newWorkspace(parent, "b-status");
      pay(ws, "a");
      const before = filesUnder(ws).sort();
      const r = cli(["status"], ws);
      expect(r.status, r.all).toBe(0);
      expect(filesUnder(ws).sort().filter((f) => !before.includes(f)).map((f) => path.relative(ws, f))).toEqual([]);
    });

    it("the query commands still answer after `status` ran", async () => {
      const ws = await newWorkspace(parent, "b-after-status");
      const p = pay(ws, "a");
      cli(["status"], ws);
      for (const args of [["query", "tx", p.txId, "--json"], ["query", "artifacts", "list", "--json"], ["query", "events", "--json"]]) {
        const r = cli(args, ws);
        expect(r.status, `${args.join(" ")}: ${r.all.slice(0, 400)}`).toBe(0);
      }
    });

    it("`query store rebuild` does not report success while it indexed nothing and the workspace holds artifacts", async () => {
      const ws = await newWorkspace(parent, "b-rebuild");
      pay(ws, "a");
      const r = cli(["query", "store", "rebuild", "--json"], ws);
      const env = json(r.stdout);
      const result = env?.result ?? {};
      const claimsSuccess = r.status === 0 && env?.ok === true && result.ok === true;
      expect(
        claimsSuccess && (result.artifacts?.indexed ?? 0) === 0,
        `ok ${env?.ok}, indexed ${result.artifacts?.indexed}, artifacts in the workspace ${resolverCount(ws)}`
      ).toBe(false);
    });

    it("a projection that misses the workspace's newer artifacts is not answered as the truth, nor reported healthy", async () => {
      const ws = await newWorkspace(parent, "b-stale");
      pay(ws, "a");
      expect(cli(["query", "store", "rebuild", "--backend", "sqlite", "--json"], ws).status).toBe(0);
      const p2 = pay(ws, "b", "2");
      const tx = json(cli(["query", "tx", p2.txId, "--json"], ws).stdout);
      const found = (tx?.result?.items?.[0]?.artifacts ?? []).some((a: any) => a.contentHash === p2.receiptHash);
      expect(found, `query tx for a tx whose receipt is in the workspace: ${JSON.stringify(tx?.result?.items?.[0]?.warnings)}`).toBe(true);
      const doctor = cli(["query", "store", "doctor"], ws);
      // "HEALTHY" as a verdict, not inside the typed code QUERY_STORE_UNHEALTHY that reports the opposite
      expect(doctor.all, "query store doctor").not.toMatch(/(?<!UN)HEALTHY|Everything looks good/);
      expect(cli(["status"], ws).all, "status").not.toMatch(/Projection\s+healthy/);
    });
  });

  describe("C · counters see the artifacts the workspace holds", () => {
    let ws: string;
    beforeAll(async () => {
      ws = await newWorkspace(parent, "c");
      pay(ws, "a");
    });

    it("control: `hardkas verify` scans every artifact the resolver holds", () => {
      const r = cli(["verify", "--json"], ws);
      expect(json(r.stdout).result.scanned).toBe(resolverCount(ws));
    });

    // Whether a counter should report files or distinct identities is a contract decision; either honest answer passes.
    it("`status` counts the artifacts the resolver holds", () => {
      const r = cli(["status"], ws);
      const n = statusArtifacts(r.stdout);
      expect(countsTheStore(n, ws), `status says ${n}; resolver: ${resolverCount(ws)} entries, ${distinctIdentities(ws)} identities`).toBe(true);
    });

    it("`ci verify` scans the artifacts the resolver holds", () => {
      const r = cli(["ci", "verify"], ws);
      const n = Number((r.all.match(/Scanned (\d+) artifacts/) ?? [])[1]);
      expect(countsTheStore(n, ws), `ci verify scanned ${n}; resolver: ${resolverCount(ws)} entries, ${distinctIdentities(ws)} identities`).toBe(true);
    });
  });

  describe("D · `query tx` reports the transaction's evidence from the store", () => {
    let ws: string;
    let p: ReturnType<typeof pay>;
    let items: any[];
    beforeAll(async () => {
      ws = await newWorkspace(parent, "d");
      p = pay(ws, "a");
      items = json(cli(["query", "tx", p.txId, "--json"], ws).stdout).result.items[0].artifacts;
    });

    it("control: the receipt and the signed artifact are found", () => {
      expect(items.map((a) => a.role)).toEqual(expect.arrayContaining(["receipt", "signed"]));
    });

    it("the plan of the transaction is found", () => {
      expect(items.map((a) => a.role), JSON.stringify(items.map((a) => [a.role, a.schema]))).toContain("plan");
    });

    it("no artifact of the transaction has the role 'unknown'", () => {
      expect(items.filter((a) => a.role === "unknown").map((a) => a.schema)).toEqual([]);
    });

    it("only the workspace's artifact store is evidence (a user's --out copy is not a second artifact)", () => {
      const outside = items.filter((a) => !path.resolve(a.filePath).startsWith(path.join(ws, ".hardkas", "artifacts")));
      expect(outside.map((a) => path.relative(ws, a.filePath))).toEqual([]);
    });
  });

  describe("E · one snapshot model", () => {
    it("`localnet snapshot verify` finds the snapshot `localnet snapshot create` just made", async () => {
      const ws = await newWorkspace(parent, "e");
      pay(ws, "a");
      const c = cli(["localnet", "snapshot", "create", "s1", "--json"], ws);
      expect(c.status, c.all).toBe(0);
      const v = cli(["localnet", "snapshot", "verify", "s1", "--json"], ws);
      expect(v.status, v.all.slice(0, 400)).toBe(0);
    });
  });

  describe("F · a read-only command never creates a workspace", () => {
    let ws: string;
    let p: ReturnType<typeof pay>;
    beforeAll(async () => {
      ws = await newWorkspace(parent, "f");
      p = pay(ws, "a");
    });

    it.each([
      ["verify --json", (_p: any) => ["verify", "--json"]],
      ["artifact explain", (q: any) => ["artifact", "explain", q.receiptPath]],
      ["artifact lineage --json", (q: any) => ["artifact", "lineage", q.receiptPath, "--json"]]
    ])("`%s` run from a subdirectory of a workspace creates no .hardkas there", (what, argsOf) => {
      const sub = path.join(ws, `sub-${String(what).replace(/\W+/g, "-")}`);
      fs.mkdirSync(sub, { recursive: true });
      cli(argsOf(p), sub);
      expect(filesUnder(sub).map((f) => path.relative(ws, f))).toEqual([]);
    });

    it("control: `status` from a subdirectory creates nothing", () => {
      const sub = path.join(ws, "sub-status");
      fs.mkdirSync(sub, { recursive: true });
      cli(["status"], sub);
      expect(filesUnder(sub)).toEqual([]);
    });
  });

  // The shape `hardkas init` produces: a project with hardkas.config.ts. Its simulator state is one, whichever
  // directory of the project a command runs from.
  describe("F · a configured project has one simulator state, wherever a command runs from", () => {
    let ws: string;
    let sub: string;
    const balanceOf = (who: string, cwd: string) => {
      const r = cli(["accounts", "balance", who, "--network", "simulated", "--json"], cwd);
      expect(r.status, r.all).toBe(0);
      const sompi = String(json(r.stdout)?.result?.balanceSompi);
      // A balance is a decimal sompi amount; anything else would make the comparisons below vacuous.
      expect(sompi, r.stdout.slice(0, 300)).toMatch(/^\d+$/);
      return sompi;
    };
    beforeAll(async () => {
      ws = path.join(parent, "f-project");
      fs.mkdirSync(ws, { recursive: true });
      fs.writeFileSync(path.join(ws, "hardkas.config.ts"), "export default {};\n");
      await Hardkas.create({ cwd: ws, autoBootstrap: true, network: "simulated" });
      sub = path.join(ws, "src");
      fs.mkdirSync(sub);
      pay(ws, "a", "7");
    });

    it("control: the balance read at the project root reflects the payment", () => {
      expect(BigInt(balanceOf("alice", ws))).toBeLessThan(100_000_000_000n);
    });

    it("`accounts balance` from a subdirectory reports the project's balance", () => {
      expect(balanceOf("alice", sub)).toBe(balanceOf("alice", ws));
      expect(balanceOf("bob", sub)).toBe(balanceOf("bob", ws));
    });

    it("a payment run from a subdirectory spends from the project's state", () => {
      const steps = [
        ["tx", "plan", "--from", "alice", "--to", "bob", "--amount", "3", "--network", "simulated", "--out", "b-plan.json", "--json"],
        ["tx", "sign", "b-plan.json", "--out", "b-signed.json", "--json"],
        ["tx", "send", "b-signed.json", "--network", "simulated", "--json"]
      ].map((args) => ({ step: args.slice(0, 2).join(" "), ...cli(args, sub) }));
      const failed = steps.filter((s) => s.status !== 0).map((s) => `${s.step} exit ${s.status}: ${s.all.replace(/\s+/g, " ").slice(0, 200)}`);
      expect(failed.join(" | ")).toBe("");
    });
  });
});
