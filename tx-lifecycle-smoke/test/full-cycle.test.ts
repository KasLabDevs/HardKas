import { expect, test, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const testDir = path.resolve(__dirname, "..");
const hardkasDir = path.join(testDir, ".hardkas");

beforeAll(() => {
  if (fs.existsSync(hardkasDir)) {
    fs.rmSync(hardkasDir, { recursive: true, force: true });
  }
  fs.mkdirSync(hardkasDir, { recursive: true });
});

test("E2E: Full Cycle - CLI to Artifact to Indexer", async () => {
  const artifactPath = path.join(hardkasDir, "test-plan.json");
  const testArtifact = {
    schema: "hardkas.txPlan.v1",
    version: 1,
    artifactId: "test-plan-123",
    contentHash: "hash-123",
    createdAt: new Date().toISOString(),
    payload: {
      from: "alice",
      to: "bob",
      amountSompi: "100000",
      status: "built"
    }
  };

  fs.writeFileSync(artifactPath, JSON.stringify(testArtifact, null, 2));

  const { HardkasIndexer } = await import("../../packages/query-store/src/indexer.js");
  const { getQueryBackend } = await import("../../packages/dev-server/src/db.js");
  
  const backend = getQueryBackend();
  const indexer = new HardkasIndexer(backend.db, { cwd: testDir });
  
  const syncResult = await indexer.sync();
  expect(syncResult.ok).toBe(true);
  expect(syncResult.artifacts.indexed).toBeGreaterThanOrEqual(1);

  const artifacts = await backend.findArtifacts();
  const found = artifacts.find(a => a.artifactId === "test-plan-123");
  
  expect(found).toBeDefined();
  expect(found?.payload.amountSompi).toBe("100000");
});
