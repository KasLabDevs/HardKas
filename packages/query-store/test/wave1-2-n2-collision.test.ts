import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { HardkasIndexer } from "../src/indexer.js";
import { HardkasStore } from "../src/db.js";
import { calculateContentHash, CURRENT_HASH_VERSION } from "@hardkas/artifacts";

// Wave 1.2 · N2 / IC-5′.9: the index key is the RECOMPUTED artifactId; a key collision with
// different content is corruption, never an UPDATE; edges use artifactIds; a file that no
// longer verifies is stored as CORRUPTED under a path-derived key, never under the identity
// it claims.

function receipt(extra: Record<string, unknown> = {}) {
  const a: any = {
    schema: "hardkas.txReceipt",
    version: "1.0.0-alpha",
    hashVersion: CURRENT_HASH_VERSION,
    hardkasVersion: "0.12.0-rc.23",
    networkId: "simnet",
    mode: "simulator",
    execution: { mode: "simulator", domain: "kaspa-l1", network: "simnet" },
    createdAt: "2026-09-25T00:00:00.000Z",
    txId: "simtx_" + "1".repeat(32),
    status: "accepted",
    from: { address: "kaspa:123" },
    to: { address: "kaspa:456" },
    amountSompi: "1000",
    feeSompi: "100",
    ...extra
  };
  a.contentHash = calculateContentHash(a, CURRENT_HASH_VERSION);
  return a;
}

describe("Wave 1.2 · N2 · query-store keys by recomputed identity and never lets an impostor overwrite a row", () => {
  let tempDir: string;
  let hkDir: string;
  let store: HardkasStore;
  let db: DatabaseSync;

  const rows = () =>
    db.prepare("SELECT artifact_id, content_hash, kind, file_path, raw_json FROM artifacts ORDER BY artifact_id").all() as Array<{
      artifact_id: string;
      content_hash: string;
      kind: string;
      file_path: string;
      raw_json: string;
    }>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-w12-n2-"));
    hkDir = path.join(tempDir, ".hardkas", "artifacts", "receipts");
    fs.mkdirSync(hkDir, { recursive: true });
    store = new HardkasStore({ dbPath: path.join(tempDir, ".hardkas", "store.db") });
    store.connect({ autoMigrate: true });
    db = store.getDatabase();
  });

  afterEach(() => {
    store.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("T-N2 · an impostor with artifactId = victim leaves the victim's row intact and is indexed under its own identity", async () => {
    const victim = receipt();
    fs.writeFileSync(path.join(hkDir, "victim.json"), JSON.stringify(victim));
    const indexer = new HardkasIndexer(db, { cwd: tempDir });
    await indexer.sync();

    const impostor = receipt({ amountSompi: "999999", artifactId: victim.contentHash });
    fs.writeFileSync(path.join(hkDir, "impostor.json"), JSON.stringify(impostor));
    const result = await indexer.sync();

    const victimRow = rows().find((r) => r.artifact_id === victim.contentHash);
    expect(victimRow).toBeDefined();
    expect(victimRow!.content_hash).toBe(victim.contentHash);
    expect(JSON.parse(victimRow!.raw_json).amountSompi).toBe("1000");
    expect(victimRow!.file_path).toContain("victim.json");

    const impostorRow = rows().find((r) => r.artifact_id === impostor.contentHash);
    expect(impostorRow).toBeDefined();
    expect(impostorRow!.file_path).toContain("impostor.json");
    expect(rows().filter((r) => r.artifact_id === victim.contentHash)).toHaveLength(1);
    expect(result.issues.some((i) => i.code === "ARTIFACT_ID_COLLISION")).toBe(false);
  });

  it("T-N2b · a file that declares the victim's contentHash with a different body is CORRUPTED under a path key, never under the victim's key", async () => {
    const victim = receipt();
    fs.writeFileSync(path.join(hkDir, "victim.json"), JSON.stringify(victim));
    const indexer = new HardkasIndexer(db, { cwd: tempDir });
    await indexer.sync();

    const forged = { ...receipt({ amountSompi: "888" }), contentHash: victim.contentHash };
    fs.writeFileSync(path.join(hkDir, "forged.json"), JSON.stringify(forged));
    const result = await indexer.sync();

    expect(result.artifacts.corrupted).toBe(1);
    expect(result.issues.some((i) => i.code === "ARTIFACT_HASH_MISMATCH")).toBe(true);
    const victimRows = rows().filter((r) => r.artifact_id === victim.contentHash);
    expect(victimRows).toHaveLength(1);
    expect(victimRows[0]!.file_path).toContain("victim.json");
    expect(JSON.parse(victimRows[0]!.raw_json).amountSompi).toBe("1000");
    const corruptRow = rows().find((r) => r.file_path.endsWith("forged.json"));
    expect(corruptRow).toBeDefined();
    expect(corruptRow!.kind).toBe("CORRUPTED");
    expect(corruptRow!.artifact_id).not.toBe(victim.contentHash);
  });

  it("a rewritten file replaces its previous row: one row per file, keyed by the new identity", async () => {
    const v1 = receipt();
    const file = path.join(hkDir, "r.json");
    fs.writeFileSync(file, JSON.stringify(v1));
    const indexer = new HardkasIndexer(db, { cwd: tempDir });
    await indexer.sync();
    const v2 = receipt({ amountSompi: "2000" });
    fs.writeFileSync(file, JSON.stringify(v2));
    const later = Date.now() + 5000;
    fs.utimesSync(file, later / 1000, later / 1000);
    await indexer.sync();
    const forFile = rows().filter((r) => r.file_path === file);
    expect(forFile).toHaveLength(1);
    expect(forFile[0]!.artifact_id).toBe(v2.contentHash);
    expect(rows().some((r) => r.artifact_id === v1.contentHash)).toBe(false);
  });

  it("lineage edges use recomputed artifactIds, not a declared top-level artifactId", async () => {
    const parent = receipt();
    const child = receipt({
      amountSompi: "5",
      artifactId: "z".repeat(64),
      lineage: { artifactId: "", lineageId: parent.contentHash, parentArtifactId: parent.contentHash, rootArtifactId: parent.contentHash, sequence: 2 }
    });
    child.lineage.artifactId = child.contentHash;
    fs.writeFileSync(path.join(hkDir, "parent.json"), JSON.stringify(parent));
    fs.writeFileSync(path.join(hkDir, "child.json"), JSON.stringify(child));
    const indexer = new HardkasIndexer(db, { cwd: tempDir });
    await indexer.sync();
    const edges = db.prepare("SELECT parent_artifact_id, child_artifact_id FROM lineage_edges").all() as Array<{ parent_artifact_id: string; child_artifact_id: string }>;
    expect(edges).toEqual([{ parent_artifact_id: parent.contentHash, child_artifact_id: child.contentHash }]);
  });
});
