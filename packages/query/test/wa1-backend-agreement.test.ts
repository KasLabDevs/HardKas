/**
 * WORKSPACE-AUTHORITY-1 (C1/D) · both query backends answer with the same artifacts for the same workspace: one per
 * identity, represented by the same copy. The store holds a receipt twice, its canonical copy in receipts/ and an
 * identical copy at the store root (the shape of the `tx plan` lattice copy); the projection is built from that store.
 * Found by the AFTER probes: with a fresh projection `query artifacts list` said 16 where the filesystem said 19, and the
 * two backends named different files for the same plan.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { HardkasStore, HardkasIndexer, readProjectionStatus } from "@hardkas/query-store";
import { calculateContentHash, CURRENT_HASH_VERSION, countWorkspaceArtifactsSync } from "@hardkas/artifacts";
import { QueryEngine, createQueryRequest } from "../src/engine.js";
import type { QueryRequest } from "../src/types.js";

const txId = "tx-wa1-backend-agreement";
const dirs: string[] = [];

function sealedReceipt() {
  const a: any = {
    schema: "hardkas.txReceipt",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    hardkasVersion: "0.0.0-test",
    networkId: "simnet",
    mode: "rpc",
    createdAt: "2026-01-01T00:00:00.000Z",
    execution: { mode: "rpc", domain: "kaspa-l1", network: "simnet" },
    txId,
    status: "accepted",
    from: { address: "kaspa:123" },
    to: { address: "kaspa:456" },
    amountSompi: "1000",
    feeSompi: "100",
    payload: {}
  };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  return a;
}

/** A workspace whose store holds one receipt at its canonical path and, when asked, an identical store-root copy. */
function workspace(opts: { rootCopy: boolean }) {
  const ws = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-wa1-agree-"));
  dirs.push(ws);
  const store = path.join(ws, ".hardkas", "artifacts");
  fs.mkdirSync(path.join(store, "receipts"), { recursive: true });
  const r = sealedReceipt();
  const json = JSON.stringify(r, null, 2);
  const canonical = path.join(store, "receipts", `txReceipt-${r.contentHash}.json`);
  const rootCopy = path.join(store, `2026-01-01T00-00-00-000Z-receipt-${r.contentHash.slice(0, 16)}.json`);
  if (opts.rootCopy) fs.writeFileSync(rootCopy, json); // written first: neither file order nor age picks the canonical one
  fs.writeFileSync(canonical, json);
  return { ws, canonical: fs.realpathSync(canonical), rootCopy, json };
}

async function index(ws: string, op: "rebuild" | "sync") {
  const store = new HardkasStore({ dbPath: path.join(ws, ".hardkas", "store.db") });
  store.connect({ autoMigrate: true });
  try {
    await new HardkasIndexer(store.getDatabase(), { cwd: ws })[op]();
  } finally {
    store.disconnect();
  }
}

function indexedPaths(ws: string): string[] {
  const store = HardkasStore.openExisting(path.join(ws, ".hardkas", "store.db"))!;
  try {
    return (store.getDatabase().prepare("SELECT file_path FROM artifacts ORDER BY file_path").all() as Array<{ file_path: string }>).map((r) => r.file_path);
  } finally {
    store.disconnect();
  }
}

async function run(ws: string, backendMode: "sqlite" | "filesystem", request: QueryRequest) {
  const engine = await QueryEngine.create({ artifactDir: ws, backendMode });
  try {
    if (backendMode === "sqlite") expect(engine.backendSelection.projection?.state, "the projection is fresh").toBe("fresh");
    return await engine.execute(request);
  } finally {
    (engine.backend as any).store?.disconnect?.();
  }
}

afterAll(() => {
  for (const d of dirs) fs.rmSync(d, { recursive: true, force: true });
});

describe("WORKSPACE-AUTHORITY-1 · the query backends agree", () => {
  let w: ReturnType<typeof workspace>;
  beforeAll(async () => {
    w = workspace({ rootCopy: true });
    await index(w.ws, "rebuild");
  });

  it("the store holds one artifact in two files", () => {
    expect(countWorkspaceArtifactsSync(w.ws)).toEqual({ artifacts: 1, entries: 2, unverified: 0 });
  });

  it("query artifacts list: one item, the canonical copy, on both backends", async () => {
    const request = createQueryRequest({ domain: "artifacts", op: "list" });
    for (const mode of ["sqlite", "filesystem"] as const) {
      const result = await run(w.ws, mode, request);
      expect(result.total, mode).toBe(1);
      expect(result.items.map((i: any) => i.filePath), mode).toEqual([w.canonical]);
    }
  });

  it("query tx: the same artifact, by the same copy, on both backends", async () => {
    const request = createQueryRequest({ domain: "tx", op: "aggregate", params: { txId } });
    const answers: Record<string, string[]> = {};
    for (const mode of ["sqlite", "filesystem"] as const) {
      const agg = (await run(w.ws, mode, request)).items[0] as any;
      answers[mode] = agg.artifacts.map((a: any) => `${a.role}:${a.filePath}`);
    }
    expect(answers.sqlite).toEqual([`receipt:${w.canonical}`]);
    expect(answers.filesystem).toEqual(answers.sqlite);
  });

  it("the projection moves to the canonical copy when the store-root copy was indexed first", async () => {
    const v = workspace({ rootCopy: true });
    fs.rmSync(v.canonical);
    await index(v.ws, "rebuild");
    expect(indexedPaths(v.ws)).toEqual([fs.realpathSync(v.rootCopy)]);
    fs.writeFileSync(v.canonical, v.json);
    await index(v.ws, "sync");
    expect(indexedPaths(v.ws)).toEqual([v.canonical]);
    expect(readProjectionStatus(v.ws).state).toBe("fresh");
  });
});
