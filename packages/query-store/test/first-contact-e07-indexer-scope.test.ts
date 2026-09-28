import { describe, it, beforeEach, afterEach, expect } from "vitest";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { DatabaseSync } = require("node:sqlite");
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { HardkasIndexer } from "../src/indexer.js";
import { HardkasStore } from "../src/db.js";
import { createScenarioResultArtifact } from "@hardkas/artifacts";

// First contact · E07 — the index walked every JSON file under `.hardkas/` and
// reported HardKAS's own operational output as corrupted artifacts; in strict mode
// (`hardkas dev`) the first such file aborted startup. Test-run bookkeeping
// (`runs/`), torture/chaos reports (`reports/`), deployment tracking records
// (`deployments/`) and the managed node's data (`kaspad/`) are not artifacts.
// Tampered canonical artifacts are still reported and still abort strict mode.

const write = (file: string, body: unknown) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, typeof body === "string" ? body : JSON.stringify(body, null, 2));
};

describe("First contact · E07 · the index only treats canonical artifacts as artifacts", () => {
  let tempDir: string;
  let hardkasDir: string;
  let store: HardkasStore;
  let db: InstanceType<typeof DatabaseSync>;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "hk-fc-e07-idx-"));
    hardkasDir = path.join(tempDir, ".hardkas");
    fs.mkdirSync(hardkasDir);
    store = new HardkasStore({ dbPath: path.join(tempDir, "test.db") });
    store.connect({ autoMigrate: true });
    db = store.getDatabase();

    // Operational output exactly as the published CLI leaves it (shapes from a real workspace).
    write(path.join(hardkasDir, "runs", "run_1", "test-results.json"), { passed: 0, failed: 1 });
    write(path.join(hardkasDir, "runs", "run_1", "scenario-results", "payment_flow.json"), { scenarioResultPath: "x" });
    write(path.join(hardkasDir, "reports", "torture-42.json"), { seed: 42, cases: [] });
    write(path.join(hardkasDir, "deployments", "simnet", "pago-demo.json"), { schema: "hardkas.deployment.v1", label: "pago-demo" });
    write(path.join(hardkasDir, "kaspad", "meta.json"), { any: "node data" });
    // One canonical artifact, sealed by the product's producer.
    const result: any = createScenarioResultArtifact({ scenarioName: "payment flow", status: "passed", networkId: "simulated", mode: "simulator" });
    write(path.join(hardkasDir, "artifacts", "misc", `scenarioResult-${result.contentHash}.json`), result);
  });

  afterEach(() => {
    store?.disconnect();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("strict sync does not abort on operational output and reports nothing as corrupted", async () => {
    const indexer = new HardkasIndexer(db, { cwd: tempDir, strict: true });
    const result = await indexer.sync();
    expect(result.issues).toEqual([]);
    expect(result.artifacts.corrupted).toBe(0);
    expect(result.artifacts.indexed).toBeGreaterThanOrEqual(1);
  });

  it("a tampered canonical artifact is still reported, and still aborts strict mode", async () => {
    const dir = path.join(hardkasDir, "artifacts", "misc");
    const file = path.join(dir, fs.readdirSync(dir)[0]!);
    const body = JSON.parse(fs.readFileSync(file, "utf8"));
    body.status = "failed";
    fs.writeFileSync(file, JSON.stringify(body, null, 2));

    const lenient = await new HardkasIndexer(db, { cwd: tempDir }).sync();
    expect(lenient.artifacts.corrupted).toBe(1);
    // A fresh projection: the incremental sync skips files whose mtime it already
    // indexed (pre-existing behaviour, out of scope here), so strict mode is
    // exercised on a store that has not seen the file yet.
    const strictStore = new HardkasStore({ dbPath: path.join(tempDir, "strict.db") });
    strictStore.connect({ autoMigrate: true });
    try {
      await expect(new HardkasIndexer(strictStore.getDatabase(), { cwd: tempDir, strict: true }).sync()).rejects.toThrow(
        /Strict mode: corrupted artifact/
      );
    } finally {
      strictStore.disconnect();
    }
  });
});
