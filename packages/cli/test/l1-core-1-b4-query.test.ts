// L1-CORE-1 B4 · query dag|lineage|replay|store: what each subcommand answers, through the built CLI, on a simulated
// workspace whose artifacts the CLI itself wrote (`init` + `tx send` payments); exit codes and the --json envelope are
// asserted, and the inputs each command exists to detect (a tampered receipt, a broken lineage, a stale or locked
// projection) are produced on those same artifacts.
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cli, envelope, simulatedWorkspace, pay, removeDir, type Payment } from "./helpers/l1-core-1-b4.js";

vi.setConfig({ testTimeout: 240_000, hookTimeout: 240_000 });

describe("query dag · anomalies | conflicts | displaced | history | sink-path", () => {
  let parent: string;
  let ws: string;
  let p1: Payment;

  beforeAll(() => {
    ({ parent, ws } = simulatedWorkspace("hk-b4-query-dag-"));
    p1 = pay(ws, "1");
  });
  afterAll(() => removeDir(parent));

  const ops = ["anomalies", "conflicts", "displaced", "sink-path"] as const;

  // ESCALÓN 2 · P8: without DAG data (nothing writes .hardkas/state.json) an op used to answer ok:true with an empty
  // result ("No conflicts detected"). It now fails, typed, with an explicit NO_DATA state and nothing "all clear".
  it("--json: each op fails with DAG_DATA_UNAVAILABLE (exit 1, ok:false, status NO_DATA) under its own command name while no DAG data exists", () => {
    const seen = ops.map((op) => {
      const r = cli(["query", "dag", op, "--json"], ws);
      const e = envelope(r.stdout);
      return { op, status: r.status, ok: e?.ok, command: e?.command, code: e?.code, dataStatus: e?.status, hasResult: e?.result !== undefined };
    });
    expect(seen).toEqual(
      ops.map((op) => ({ op, status: 1, ok: false, command: `query dag ${op}`, code: "DAG_DATA_UNAVAILABLE", dataStatus: "NO_DATA", hasResult: false }))
    );
    const one = envelope(cli(["query", "dag", "conflicts", "--json"], ws).stdout);
    expect(String(one?.source)).toMatch(/state\.json$/);
    expect(String(one?.message)).toMatch(/no HardKAS command writes/);
  });

  it("human: each op exits 1 with DAG_DATA_UNAVAILABLE and never prints an all-clear", () => {
    for (const op of ops) {
      const r = cli(["query", "dag", op], ws);
      expect({ op, status: r.status }, r.all.slice(0, 600)).toEqual({ op, status: 1 });
      expect(r.stderr, op).toMatch(/DAG_DATA_UNAVAILABLE/);
      expect(r.all, op).not.toMatch(/No conflicts detected|No displaced transactions|No DAG anomalies detected/);
    }
  });

  it("history <txId> without DAG data fails the same way: exit 1, one error envelope with DAG_DATA_UNAVAILABLE", () => {
    const r = cli(["query", "dag", "history", p1.receipt.txId, "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(1);
    const e = envelope(r.stdout);
    expect(e).toMatchObject({ ok: false, command: "query dag history", code: "DAG_DATA_UNAVAILABLE", status: "NO_DATA" });
  });

  it.skip("[known gap: query dag reads .hardkas/state.json, the simulator keeps its DAG in .hardkas/localnet.json -> L1-CORE-1-B4] after `dag simulate-reorg`, sink-path and history answer from the DAG that `dag status` shows", () => {
    const reorg = cli(["dag", "simulate-reorg", "--depth", "1"], ws);
    expect(reorg.status, reorg.all.slice(0, 600)).toBe(0);
    const dag = JSON.parse(fs.readFileSync(path.join(ws, ".hardkas", "localnet.json"), "utf8")).dag;
    expect(dag?.sink).toBeTruthy();

    const sink = envelope(cli(["query", "dag", "sink-path", "--json"], ws).stdout);
    expect(sink?.result?.items?.[0]?.sink).toBe(dag.sink);
    expect(sink?.result?.items?.[0]?.nodes?.map((n: any) => n.blockId)).toEqual(dag.selectedPathToSink);

    const hist = cli(["query", "dag", "history", p1.receipt.txId, "--json"], ws);
    expect(hist.status, hist.all.slice(0, 600)).toBe(0);
    expect(envelope(hist.stdout)).toMatchObject({ ok: true, command: "query dag history", result: { domain: "dag", op: "history" } });
  });
});

describe("query lineage · chain | orphans | transitions", () => {
  let parent: string;
  let ws: string;
  let p1: Payment;
  let p2: Payment;
  const hashesOf = (p: Payment) => [p.plan.contentHash, p.signed.contentHash, p.receipt.contentHash];

  beforeAll(() => {
    ({ parent, ws } = simulatedWorkspace("hk-b4-query-lineage-"));
    p1 = pay(ws, "1");
    p2 = pay(ws, "2");
  });
  afterAll(() => removeDir(parent));

  it("chain <receipt> (ancestors, the default) is plan -> signed -> receipt of that payment, in order", () => {
    const r = cli(["query", "lineage", "chain", p1.receipt.contentHash, "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const e = envelope(r.stdout);
    expect(e).toMatchObject({ ok: true, command: "query lineage chain", result: { domain: "lineage", op: "chain" } });
    const item = e.result.items[0];
    expect(item).toMatchObject({ anchor: p1.receipt.contentHash, direction: "ancestors" });
    expect(item.nodes.map((n: any) => n.contentHash)).toEqual(hashesOf(p1));
    expect(item.nodes.map((n: any) => n.schema)).toEqual(["hardkas.txPlan", "hardkas.signedTx", "hardkas.txReceipt"]);
  });

  it("chain <plan> --direction descendants reaches that payment's signed tx and receipt, never the other payment's", () => {
    const r = cli(["query", "lineage", "chain", p1.plan.contentHash, "--direction", "descendants", "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const nodes = envelope(r.stdout).result.items[0].nodes.map((n: any) => n.contentHash);
    expect(nodes).toEqual(hashesOf(p1));
    for (const h of hashesOf(p2)) expect(nodes).not.toContain(h);
  });

  it("chain of an anchor the workspace does not hold: exit 1, one error envelope naming it", () => {
    const r = cli(["query", "lineage", "chain", "f".repeat(64), "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(1);
    expect(envelope(r.stdout)).toMatchObject({ ok: false });
    expect(String(envelope(r.stdout).message)).toMatch(/Anchor not found/);
  });

  it("transitions: every plan -> signed -> receipt step of both payments, each valid; --root keeps one payment's", () => {
    const all = cli(["query", "lineage", "transitions", "--json"], ws);
    expect(all.status, all.all.slice(0, 600)).toBe(0);
    const e = envelope(all.stdout);
    expect(e).toMatchObject({ ok: true, command: "query lineage transitions", result: { op: "transitions" } });
    const pairs = e.result.items.map((t: any) => `${t.from.contentHash}>${t.to.contentHash}`);
    for (const p of [p1, p2]) {
      expect(pairs).toContain(`${p.plan.contentHash}>${p.signed.contentHash}`);
      expect(pairs).toContain(`${p.signed.contentHash}>${p.receipt.contentHash}`);
    }
    expect(e.result.items.every((t: any) => t.valid === true)).toBe(true);

    const rooted = envelope(cli(["query", "lineage", "transitions", "--root", p1.plan.contentHash, "--json"], ws).stdout);
    const rootedPairs = rooted.result.items.map((t: any) => `${t.from.contentHash}>${t.to.contentHash}`);
    expect(rootedPairs.sort()).toEqual([`${p1.plan.contentHash}>${p1.signed.contentHash}`, `${p1.signed.contentHash}>${p1.receipt.contentHash}`].sort());
  });

  it("orphans: none while every lineage reference resolves; once a plan is gone, its signed tx is reported with the missing parent", () => {
    const clean = envelope(cli(["query", "lineage", "orphans", "--json"], ws).stdout);
    expect(clean).toMatchObject({ ok: true, command: "query lineage orphans", result: { op: "orphans", items: [], total: 0 } });

    fs.rmSync(p2.planPath);
    const r = cli(["query", "lineage", "orphans", "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const items = envelope(r.stdout).result.items;
    expect(items.map((o: any) => ({ node: o.node.contentHash, missing: o.missingParentId }))).toEqual([
      { node: p2.signed.contentHash, missing: p2.plan.contentHash }
    ]);
  });
});

describe("query replay · divergences | invariants | list | summary", () => {
  let parent: string;
  let ws: string;
  let p1: Payment;
  let p2: Payment;

  beforeAll(() => {
    ({ parent, ws } = simulatedWorkspace("hk-b4-query-replay-"));
    p1 = pay(ws, "1");
    p2 = pay(ws, "2");
  });
  afterAll(() => removeDir(parent));

  it("list: both receipts, newest DAA score first, with what each receipt recorded; --status and --limit filter", () => {
    const r = cli(["query", "replay", "list", "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const e = envelope(r.stdout);
    expect(e).toMatchObject({ ok: true, command: "query replay list", result: { domain: "replay", op: "list", total: 2 } });
    expect(e.result.items.map((i: any) => [i.txId, i.status, i.amountSompi, i.feeSompi])).toEqual([
      [p2.receipt.txId, "accepted", p2.receipt.amountSompi, p2.receipt.feeSompi],
      [p1.receipt.txId, "accepted", p1.receipt.amountSompi, p1.receipt.feeSompi]
    ]);
    expect(envelope(cli(["query", "replay", "list", "--status", "failed", "--json"], ws).stdout).result.items).toEqual([]);
    expect(envelope(cli(["query", "replay", "list", "--limit", "1", "--json"], ws).stdout).result.items).toHaveLength(1);
  });

  it("summary <txId>: the receipt of that transaction, under its own command name", () => {
    const r = cli(["query", "replay", "summary", p1.receipt.txId, "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const e = envelope(r.stdout);
    expect(e).toMatchObject({ ok: true, command: "query replay summary", result: { op: "summary" } });
    expect(e.result.items[0]).toMatchObject({ txId: p1.receipt.txId, amountSompi: p1.receipt.amountSompi, preStateHash: p1.receipt.preStateHash, postStateHash: p1.receipt.postStateHash });
  });

  it("summary of a txId without a receipt: exit 1, one error envelope naming it", () => {
    const r = cli(["query", "replay", "summary", "synthetic-nope", "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(1);
    expect(envelope(r.stdout)?.ok).toBe(false);
    expect(String(envelope(r.stdout)?.message)).toMatch(/Receipt not found for txId: synthetic-nope/);
  });

  // ESCALÓN 2 · P9: static checks, named for what they look at (no "reproducible", no "conservation"); the envelope says
  // it is static analysis
  it("invariants <txId>: an intact, authenticated receipt passes every static check, under its own command name", () => {
    const r = cli(["query", "replay", "invariants", p1.receipt.txId, "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const e = envelope(r.stdout);
    expect(e).toMatchObject({ ok: true, command: "query replay invariants", result: { op: "invariants" } });
    expect(String(e.analysis)).toMatch(/^static: .*nothing was re-executed/);
    expect(e.result.items[0]).toEqual({
      txId: p1.receipt.txId,
      analysis: "static",
      authScope: "FULL",
      contentHashMatches: true,
      stateHashesPresent: true,
      stateChangeMatchesStatus: true,
      utxoCountsNonZero: true,
      issues: []
    });
    const human = cli(["query", "replay", "invariants", p1.receipt.txId], ws);
    expect(human.stdout).toMatch(/Static receipt checks/);
    expect(human.stdout).not.toMatch(/reproducible|conservation|Replay Invariants/i);
  });

  it("divergences: one envelope under its own command name, each item naming tx, kind, field, expected and actual", () => {
    const r = cli(["query", "replay", "divergences", "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const e = envelope(r.stdout);
    expect(e).toMatchObject({ ok: true, command: "query replay divergences", result: { domain: "replay", op: "divergences" } });
    expect(String(e.analysis)).toMatch(/^static: /);
    for (const d of e.result.items) {
      expect(Object.keys(d).sort()).toEqual(["actual", "expected", "field", "kind", "txId"]);
    }
  });

  // ESCALÓN 2 · P9: the former `fee > 10 × mass` rule flagged every payment at the standard rate (100 sompi/gram); the
  // relay-minimum rule flags none of them (this test was skipped as a known gap)
  it("two untouched simulated payments at the standard fee show no finding (relay-minimum rule; was a known gap)", () => {
    const e = envelope(cli(["query", "replay", "divergences", "--json"], ws).stdout);
    expect(e.result.items).toEqual([]);
    const human = cli(["query", "replay", "divergences"], ws);
    expect(human.stdout).toMatch(/Static analysis found no inconsistency/);
    expect(human.stdout).not.toMatch(/No replay divergences/);
  });

  it("a receipt edited after it was written: divergences reports its contentHash mismatch and invariants loses plan integrity", () => {
    const body = JSON.parse(fs.readFileSync(p1.receiptPath, "utf8"));
    body.amountSompi = String(BigInt(body.amountSompi) + 1n);
    fs.writeFileSync(p1.receiptPath, JSON.stringify(body, null, 2));

    const div = envelope(cli(["query", "replay", "divergences", "--json"], ws).stdout);
    expect(div.result.items).toContainEqual(
      expect.objectContaining({ txId: p1.receipt.txId, kind: "state-hash-mismatch", field: "contentHash", expected: p1.receipt.contentHash })
    );
    expect(div.result.items.some((d: any) => d.txId === p2.receipt.txId && d.field === "contentHash")).toBe(false);

    const inv = envelope(cli(["query", "replay", "invariants", p1.receipt.txId, "--json"], ws).stdout).result.items[0];
    expect(inv.contentHashMatches).toBe(false);
    expect(inv.issues.join("\n")).toMatch(/contentHash does not match/);
  });
});

describe("query store · export | migrate | sync", () => {
  let parent: string;
  let ws: string;
  let p1: Payment;
  const db = () => path.join(ws, ".hardkas", "store.db");

  beforeAll(() => {
    ({ parent, ws } = simulatedWorkspace("hk-b4-query-store-"));
    p1 = pay(ws, "1");
  });
  afterAll(() => removeDir(parent));

  it("before any rebuild: export and sync refuse QUERY_STORE_ABSENT (exit 1), migrate has nothing to do (exit 0); none creates the store", () => {
    const exp = cli(["query", "store", "export"], ws);
    expect(exp.status, exp.all.slice(0, 600)).toBe(1);
    expect(exp.all).toMatch(/QUERY_STORE_ABSENT/);

    const sync = cli(["query", "store", "sync", "--json"], ws);
    expect(sync.status, sync.all.slice(0, 600)).toBe(1);
    expect(envelope(sync.stdout)).toMatchObject({ ok: false, code: "QUERY_STORE_ABSENT" });

    const mig = cli(["query", "store", "migrate"], ws);
    expect(mig.status, mig.all.slice(0, 600)).toBe(0);
    expect(mig.stdout).toMatch(/no query store to migrate/i);

    expect(fs.existsSync(db())).toBe(false);
  });

  it("after rebuild: export is one fresh envelope with every indexed artifact and event; --output writes the same dump", () => {
    const rebuild = cli(["query", "store", "rebuild", "--json"], ws);
    expect(rebuild.status, rebuild.all.slice(0, 600)).toBe(0);
    const built = envelope(rebuild.stdout).result;

    const r = cli(["query", "store", "export"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const e = envelope(r.stdout);
    expect(e).toMatchObject({ ok: true, command: "query store export", projection: { state: "fresh" } });
    expect(e.result.artifacts).toHaveLength(built.artifacts.indexed);
    expect(e.result.events).toHaveLength(built.events.indexed);
    const hashes = e.result.artifacts.map((a: any) => a.content_hash);
    for (const h of [p1.plan.contentHash, p1.signed.contentHash, p1.receipt.contentHash]) expect(hashes).toContain(h);

    const out = path.join(ws, "dump.json");
    const file = cli(["query", "store", "export", "--output", out], ws);
    expect(file.status, file.all.slice(0, 600)).toBe(0);
    const dump = JSON.parse(fs.readFileSync(out, "utf8"));
    expect(dump.artifacts.map((a: any) => a.content_hash)).toEqual(hashes);
    expect(dump.events.map((ev: any) => ev.event_id)).toEqual(e.result.events.map((ev: any) => ev.event_id));
  });

  it("migrate on an up-to-date store: no pending migrations, exit 0", () => {
    const r = cli(["query", "store", "migrate"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    expect(r.stdout).toMatch(/No pending migrations/);
  });

  it("sync after a new payment indexes it: the stale projection is fresh again and exports the new receipt", () => {
    const p2 = pay(ws, "2");
    const stale = cli(["query", "store", "doctor"], ws);
    expect(stale.status, stale.all.slice(0, 600)).toBe(1);
    expect(stale.stdout).toMatch(/State:\s+stale/);

    const r = cli(["query", "store", "sync", "--json"], ws);
    expect(r.status, r.all.slice(0, 600)).toBe(0);
    const s = envelope(r.stdout);
    expect(s).toMatchObject({ ok: true, command: "query store sync", result: { ok: true, artifacts: { corrupted: 0 } } });
    expect(s.result.artifacts.indexed).toBeGreaterThanOrEqual(3);

    const fresh = cli(["query", "store", "doctor"], ws);
    expect(fresh.status, fresh.all.slice(0, 600)).toBe(0);
    expect(fresh.stdout).toMatch(/State:\s+fresh/);
    const hashes = envelope(cli(["query", "store", "export"], ws).stdout).result.artifacts.map((a: any) => a.content_hash);
    expect(hashes).toContain(p2.receipt.contentHash);
  });

  it("sync and migrate while a live process holds the query-store lock: refused (LOCK_HELD), the store untouched", () => {
    const lockFile = path.join(ws, ".hardkas", "locks", "query-store.lock");
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(
      lockFile,
      JSON.stringify({ schema: "hardkas.lock.v1", name: "query-store", pid: process.pid, command: "l1-core-1 b4 holder", cwd: ws, hostname: os.hostname(), createdAt: new Date().toISOString(), expiresAt: null })
    );
    const before = fs.readFileSync(db()).toString("hex");
    try {
      const sync = cli(["query", "store", "sync", "--json"], ws);
      expect(sync.status, sync.all.slice(0, 600)).toBe(1);
      expect(envelope(sync.stdout)).toMatchObject({ ok: false, code: "LOCK_HELD" });
      const mig = cli(["query", "store", "migrate"], ws);
      expect(mig.status, mig.all.slice(0, 600)).toBe(1);
      expect(mig.all).toMatch(/locked by another HardKAS process/);
      expect(fs.readFileSync(db()).toString("hex")).toBe(before);
    } finally {
      fs.rmSync(lockFile, { force: true });
    }
  });
});
