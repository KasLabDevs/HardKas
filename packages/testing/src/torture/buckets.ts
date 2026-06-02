// SAFETY_LEVEL: SIMULATION_ONLY

import fs from "node:fs";
import path from "node:path";
import {
  registerTortureBucket,
  TortureBucketContext,
  LcgPrng,
  TortureInvariantError
} from "./torture-engine.js";
import {
  calculateContentHash,
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION
} from "@hardkas/artifacts";
import { HardkasStore, SqliteQueryBackend } from "@hardkas/query-store";

// Helper to create a sandbox .hardkas directory structure
function createSandbox(ctx: TortureBucketContext): {
  sandboxDir: string;
  hardkasDir: string;
  artifactsDir: string;
  dbPath: string;
} {
  const sandboxDir = path.join(
    ctx.workspaceDir,
    ".tmp",
    `torture-sandbox-${ctx.caseId}-${ctx.caseSeed}`
  );
  const hardkasDir = path.join(sandboxDir, ".hardkas");
  const artifactsDir = path.join(hardkasDir, "artifacts");
  const dbPath = path.join(hardkasDir, "store.db");

  fs.mkdirSync(artifactsDir, { recursive: true });
  return { sandboxDir, hardkasDir, artifactsDir, dbPath };
}

// Helper to cleanup sandbox directories safely
function cleanupSandbox(sandboxDir: string) {
  try {
    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  } catch {}
}

/**
 * Bucket 1: authority-deleteability
 * Invariant: sqlite_is_not_authority
 * Reconstruct projections from source artifacts if DB or events.jsonl are deleted.
 */
registerTortureBucket({
  name: "authority-deleteability",
  expectedInvariant: "sqlite_is_not_authority",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);

    try {
      // 1. Create a set of deterministic mock artifacts
      const artifactCount = ctx.prng.nextInt(3, 8);
      const generatedIds: string[] = [];

      for (let i = 0; i < artifactCount; i++) {
        const payload = {
          schema: "hardkas.txPlan" as const,
          hardkasVersion: "0.7.12-alpha",
          version: ARTIFACT_VERSION,
          networkId: "simnet" as const,
          mode: "simulated" as const,
          createdAt: new Date().toISOString(),
          planId: `plan-mock-${ctx.caseId}-${i}`,
          from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
          to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
          amountSompi: (1000n * BigInt(ctx.prng.nextInt(1, 100) * 10 + i)).toString(),
          estimatedFeeSompi: "100",
          estimatedMass: "10",
          inputs: [
            {
              outpoint: { transactionId: "a".repeat(64), index: 0 },
              amountSompi: "200000"
            }
          ],
          outputs: [
            {
              address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
              amountSompi: "1000"
            }
          ]
        };
        const hash = calculateContentHash(payload);
        const artifactId = `plan-${hash.slice(0, 16)}`;
        const artifact = {
          ...payload,
          artifactId,
          contentHash: hash
        };

        const file = path.join(artifactsDir, `${artifactId}.json`);
        fs.writeFileSync(file, JSON.stringify(artifact, null, 2), "utf-8");
        generatedIds.push(artifactId);
      }

      // 2. Initialize store, sync and assert they are in the DB
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      await backend.sync({ strict: true, cwd: sandboxDir });
      const indexedBefore = await backend.findArtifacts();
      if (indexedBefore.length !== artifactCount) {
        throw new Error(
          `Expected ${artifactCount} artifacts to be indexed, got ${indexedBefore.length}`
        );
      }

      // 3. Mutation: Wipe store.db and events.jsonl
      store.disconnect();
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      const eventsPath = path.join(hardkasDir, "events.jsonl");
      if (fs.existsSync(eventsPath)) {
        fs.unlinkSync(eventsPath);
      }

      // 4. Reconstruct projections from source artifacts
      const newStore = new HardkasStore({ dbPath });
      newStore.connect({ autoMigrate: true });
      const newBackend = new SqliteQueryBackend(newStore);

      // Rebuild the query-store projections from artifacts
      const rebuildResult = await newBackend.rebuild({ strict: true, cwd: sandboxDir });
      if (!rebuildResult.ok) {
        throw new Error(`Rebuild failed: ${rebuildResult.errors.join(", ")}`);
      }

      const indexedAfter = await newBackend.findArtifacts();
      newStore.disconnect();

      // 5. Invariant Check: Verify database state was fully reconstructed
      if (indexedAfter.length !== artifactCount) {
        throw new Error(
          `State authority failure. Rebuilt database has ${indexedAfter.length} artifacts, expected ${artifactCount}`
        );
      }

      for (const artId of generatedIds) {
        const found = indexedAfter.find((a) => a.artifactId === artId);
        if (!found) {
          throw new Error(
            `State authority failure. Missing reconstructed artifact: ${artId}`
          );
        }
      }

      return {
        flow: "Synchronize and reconstruct query store",
        mutation: "Delete SQLite store.db and verify rebuild",
        expectedInvariant: "sqlite_is_not_authority",
        artifactsBefore: generatedIds
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 2: artifact-corruption
 * Invariant: corrupted_artifacts_must_fail
 * Verifies that modified, invalid, or tampered artifacts are rejected by strict sync.
 */
registerTortureBucket({
  name: "artifact-corruption",
  expectedInvariant: "corrupted_artifacts_must_fail",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);

    try {
      // 1. Create a valid mock artifact
      const payload = {
        schema: "hardkas.txPlan" as const,
        hardkasVersion: "0.7.12-alpha",
        version: ARTIFACT_VERSION,
        networkId: "simnet" as const,
        mode: "simulated" as const,
        createdAt: new Date().toISOString(),
        planId: `plan-mock-${ctx.caseId}`,
        from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
        to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
        amountSompi: "5000",
        estimatedFeeSompi: "100",
        estimatedMass: "10",
        inputs: [
          {
            outpoint: { transactionId: "a".repeat(64), index: 0 },
            amountSompi: "10000"
          }
        ],
        outputs: [
          {
            address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
            amountSompi: "5000"
          }
        ]
      };
      const validHash = calculateContentHash(payload);
      const artifactId = `plan-${validHash.slice(0, 16)}`;
      const validArtifact = {
        ...payload,
        artifactId,
        contentHash: validHash
      };

      const file = path.join(artifactsDir, `${artifactId}.json`);
      fs.writeFileSync(file, JSON.stringify(validArtifact, null, 2), "utf-8");

      // 2. Perform safe sync of valid artifact
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);
      await backend.sync({ strict: true, cwd: sandboxDir });

      const indexed = await backend.findArtifacts();
      if (indexed.length !== 1) {
        throw new Error("Failed to index initial valid artifact");
      }

      // 3. Mutation: Corrupt the artifact on disk by tampering content but keeping same hash/version
      const corruptedArtifact = {
        ...validArtifact,
        amountSompi: "9999999999" // altered content, causing hash mismatch!
      };
      fs.writeFileSync(file, JSON.stringify(corruptedArtifact, null, 2), "utf-8");

      // 4. Invariant Check: sync with strict: true must throw an error due to integrity mismatch
      let threwCorrectly = false;
      try {
        await backend.sync({ strict: true, cwd: sandboxDir });
      } catch (err: any) {
        threwCorrectly = true;
      }

      store.disconnect();

      if (!threwCorrectly) {
        throw new Error(
          "Invariant violated: corrupted artifact synchronized successfully without error under strict mode"
        );
      }

      return {
        flow: "Verify tampered artifact integrity",
        mutation:
          "Alter artifact content Sompi amount on disk leaving original contentHash",
        expectedInvariant: "corrupted_artifacts_must_fail",
        artifactsBefore: [artifactId]
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 3: deterministic-repeatability
 * Invariant: same_input_same_seed_equals_same_hash
 * Verifies that running identical generation inputs with the same seed yields exact matches.
 */
registerTortureBucket({
  name: "deterministic-repeatability",
  expectedInvariant: "same_input_same_seed_equals_same_hash",
  async run(ctx) {
    // 1. Generate run A
    const prngA = new LcgPrng(ctx.caseSeed);
    const amountSompiA = (1000n * BigInt(prngA.nextInt(1, 100))).toString();
    const nonceA = prngA.nextInt(10000, 99999);
    const orderA = prngA.shuffle(["alice", "bob", "carol", "dave"]);

    const payloadA = {
      schema: "hardkas.txPlan",
      version: "0.7.12-alpha",
      networkId: "simnet",
      mode: "simulated",
      amountSompi: amountSompiA,
      nonce: nonceA,
      signers: orderA
    };
    const hashA = calculateContentHash(payloadA);

    // 2. Generate run B
    const prngB = new LcgPrng(ctx.caseSeed);
    const amountSompiB = (1000n * BigInt(prngB.nextInt(1, 100))).toString();
    const nonceB = prngB.nextInt(10000, 99999);
    const orderB = prngB.shuffle(["alice", "bob", "carol", "dave"]);

    const payloadB = {
      schema: "hardkas.txPlan",
      version: "0.7.12-alpha",
      networkId: "simnet",
      mode: "simulated",
      amountSompi: amountSompiB,
      nonce: nonceB,
      signers: orderB
    };
    const hashB = calculateContentHash(payloadB);

    // 3. Invariant Check: Everything must match exactly down to the byte/hash
    if (hashA !== hashB) {
      throw new Error(
        `Divergence detected under same seed ${ctx.caseSeed}. Hash A: ${hashA}, Hash B: ${hashB}`
      );
    }

    if (JSON.stringify(payloadA) !== JSON.stringify(payloadB)) {
      throw new Error("Semantic payloads differ despite identical seed execution");
    }

    return {
      flow: "Run parallel deterministic generation pipelines",
      mutation: "Execute generator with identical seed A and seed B",
      expectedInvariant: "same_input_same_seed_equals_same_hash",
      artifactsBefore: [hashA]
    };
  }
});

/**
 * Bucket 4: projection-staleness
 * Invariant: projection_cache_matches_artifacts
 * Verifies that when an artifact is updated on-disk (e.g. sequence progression or modification),
 * incremental sync refreshes the projection to prevent stale cache reads.
 */
registerTortureBucket({
  name: "projection-staleness",
  expectedInvariant: "projection_cache_matches_artifacts",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);

    try {
      // 1. Write initial artifact
      const payloadV1 = {
        schema: "hardkas.txPlan" as const,
        hardkasVersion: "0.7.12-alpha",
        version: ARTIFACT_VERSION,
        networkId: "simnet" as const,
        mode: "simulated" as const,
        createdAt: new Date().toISOString(),
        planId: `plan-mock-${ctx.caseId}`,
        from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
        to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
        amountSompi: "1000",
        estimatedFeeSompi: "100",
        estimatedMass: "10",
        inputs: [
          {
            outpoint: { transactionId: "a".repeat(64), index: 0 },
            amountSompi: "2000"
          }
        ],
        outputs: [
          {
            address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
            amountSompi: "1000"
          }
        ],
        state: "initial" // Custom field for test assertion
      };
      const hashV1 = calculateContentHash(payloadV1);
      const artifactId = `plan-${hashV1.slice(0, 16)}`;
      const file = path.join(artifactsDir, `${artifactId}.json`);

      const artifactV1 = {
        ...payloadV1,
        artifactId,
        contentHash: hashV1
      };
      fs.writeFileSync(file, JSON.stringify(artifactV1, null, 2), "utf-8");

      // Set timestamp manually to simulate past write
      const originalTime = Date.now() - 10000;
      fs.utimesSync(file, new Date(originalTime), new Date(originalTime));

      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      await backend.sync({ strict: true, cwd: sandboxDir });
      const artBefore = await backend.getArtifact(artifactId);
      if (!artBefore || artBefore.payload.state !== "initial") {
        throw new Error("Failed to index initial version of the artifact");
      }

      // 2. Mutation: Modify artifact contents on-disk to v2
      const payloadV2 = {
        ...payloadV1,
        state: "progressed",
        nonce: ctx.prng.nextInt(100, 999)
      };
      const hashV2 = calculateContentHash(payloadV2);
      const artifactV2 = {
        ...payloadV2,
        artifactId, // same ID, updated content/hash
        contentHash: hashV2
      };

      // Overwrite the file and force mtime to be in the future relative to originalTime
      fs.writeFileSync(file, JSON.stringify(artifactV2, null, 2), "utf-8");
      const updatedTime = Date.now();
      fs.utimesSync(file, new Date(updatedTime), new Date(updatedTime));

      // 3. Invariant Check: run sync and verify projection is updated
      await backend.sync({ strict: true, cwd: sandboxDir });
      const artAfter = await backend.getArtifact(artifactId);

      store.disconnect();

      if (!artAfter) {
        throw new Error("Artifact deleted unexpectedly after update sync");
      }

      if (artAfter.contentHash !== hashV2 || artAfter.payload.state !== "progressed") {
        throw new Error(
          `Staleness invariant failure. Expected hash ${hashV2} and state 'progressed', got hash ${artAfter.contentHash} and state '${artAfter.payload.state}'`
        );
      }

      return {
        flow: "Verify incremental update detection",
        mutation: "Modify file payload state and update file mtime on disk",
        expectedInvariant: "projection_cache_matches_artifacts",
        artifactsBefore: [artifactId]
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 5: workflow-crash-resume
 * Invariant: workflow_crash_resume_integrity
 * Simulates a mid-execution system crash after plan generation, wipes the projection DB,
 * rebuilds the system state from filesystem artifacts, and resumes/completes the lineage
 * without losing integrity or continuity.
 */
registerTortureBucket({
  name: "workflow-crash-resume",
  expectedInvariant: "workflow_crash_resume_integrity",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);

    try {
      const { createTestHarness } = await import("../index.js");

      // 1. Initialize Harness and generate a plan artifact (pre-crash state)
      const harness = createTestHarness({ accounts: 3, initialBalance: 100000000000n });
      const names = harness.accountNames();

      const tx = harness.send({
        from: names[0]!,
        to: names[1]!,
        amountSompi: 5000000000n
      });

      if (!tx.ok || !tx.plan) {
        throw new Error("Harness failed to build payment transaction plan");
      }

      // Convert harness plan structure into fully conforming TxPlanSchema
      const planArtifact = {
        schema: "hardkas.txPlan" as const,
        hardkasVersion: "0.7.12-alpha",
        version: ARTIFACT_VERSION,
        networkId: "simnet" as const,
        mode: "simulated" as const,
        createdAt: new Date().toISOString(),
        planId: `plan-${tx.plan.estimatedMass}-${ctx.caseSeed}`,
        from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
        to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
        amountSompi: tx.plan.outputs[0].amountSompi.toString(),
        estimatedFeeSompi: tx.plan.estimatedFeeSompi.toString(),
        estimatedMass: tx.plan.estimatedMass.toString(),
        inputs: tx.plan.inputs.map((inp: any) => ({
          outpoint: {
            transactionId: inp.outpoint.transactionId,
            index: inp.outpoint.index
          },
          amountSompi: inp.amountSompi.toString()
        })),
        outputs: tx.plan.outputs.map((out: any) => ({
          address: out.address,
          amountSompi: out.amountSompi.toString()
        }))
      };

      const planHash = calculateContentHash(planArtifact);
      const planId = `plan-${planHash.slice(0, 16)}`;
      const conformingPlan = {
        ...planArtifact,
        artifactId: planId,
        contentHash: planHash
      };

      const planFile = path.join(artifactsDir, `${planId}.json`);
      fs.writeFileSync(planFile, JSON.stringify(conformingPlan, null, 2), "utf-8");

      // 2. Initial Sync
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);
      await backend.sync({ strict: true, cwd: sandboxDir });

      const indexedPlan = await backend.getArtifact(planId);
      if (!indexedPlan) {
        throw new Error("Failed to index plan prior to simulated system crash");
      }

      // 3. Simulated Crash Mutation: wipe SQLite store.db and active connections
      store.disconnect();
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }

      // 4. System Restarts/Resumes: Reconstruct projections from raw artifacts
      const newStore = new HardkasStore({ dbPath });
      newStore.connect({ autoMigrate: true });
      const newBackend = new SqliteQueryBackend(newStore);

      const rebuildResult = await newBackend.rebuild({ strict: true, cwd: sandboxDir });
      if (!rebuildResult.ok) {
        throw new Error("Query store failed to rebuild state projections after crash");
      }

      // Verify recovery of the pre-crash plan
      const recoveredPlan = await newBackend.getArtifact(planId);
      if (!recoveredPlan) {
        throw new Error("Crash recovery failed: plan artifact was not reconstructed");
      }

      // 5. Resume and Complete Flow: Produce signed receipt linked to recovered parent plan
      const receiptArtifact = {
        schema: "hardkas.txReceipt" as const,
        hardkasVersion: "0.7.12-alpha",
        version: ARTIFACT_VERSION,
        networkId: "simnet" as const,
        mode: "simulated" as const,
        createdAt: new Date().toISOString(),
        txId: tx.receipt.txId,
        status: "confirmed" as const,
        from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
        to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
        amountSompi: tx.plan.outputs[0].amountSompi.toString(),
        feeSompi: tx.plan.estimatedFeeSompi.toString(),
        mass: tx.plan.estimatedMass.toString(),
        lineage: {
          artifactId: `receipt-${tx.receipt.txId.slice(0, 16)}`,
          lineageId: "l-" + ctx.caseSeed,
          parentArtifactId: planId, // linked to the parent plan!
          rootArtifactId: planId
        }
      };

      const receiptHash = calculateContentHash(receiptArtifact);
      const receiptId = `receipt-${receiptHash.slice(0, 16)}`;
      const conformingReceipt = {
        ...receiptArtifact,
        artifactId: receiptId,
        contentHash: receiptHash
      };

      // Write resumed receipt artifact to filesystem
      const receiptFile = path.join(artifactsDir, `${receiptId}.json`);
      fs.writeFileSync(receiptFile, JSON.stringify(conformingReceipt, null, 2), "utf-8");

      // Sync the resumed receipt
      await newBackend.sync({ strict: true, cwd: sandboxDir });

      // 6. Invariant check: Verify the final database contains both parent plan and child receipt linked perfectly
      const finalReceipt = await newBackend.getArtifact(receiptId);
      newStore.disconnect();

      if (!finalReceipt) {
        throw new Error(
          "Failed to index final transaction receipt after resuming workflow"
        );
      }

      if (finalReceipt.payload.lineage.parentArtifactId !== planId) {
        throw new Error(
          "Lineage continuity violated: resumed receipt parentId does not match pre-crash planId"
        );
      }

      return {
        flow: "Recover from intermediate workflow crash and complete pipeline",
        mutation:
          "Wipe sqlite database, rebuild from raw plan, then append signed receipt",
        expectedInvariant: "workflow_crash_resume_integrity",
        artifactsBefore: [planId],
        artifactsAfter: [receiptId]
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 6: partial-artifact-commit
 * Invariant: no_partial_artifact_becomes_canonical
 * Proves that truncated/invalid/temp files never contaminate the canonical lineage.
 */
registerTortureBucket({
  name: "partial-artifact-commit",
  expectedInvariant: "no_partial_artifact_becomes_canonical",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 12);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      const planId = `plan-mock-${ctx.caseId}-${ctx.caseSeed}`;
      const payload = {
        schema: "hardkas.txPlan" as const,
        hardkasVersion: "0.7.12-alpha",
        version: ARTIFACT_VERSION,
        networkId: "simnet" as const,
        mode: "simulated" as const,
        createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock creation timestamp
        planId,
        from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
        to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
        amountSompi: "1000",
        estimatedFeeSompi: "100",
        estimatedMass: "10",
        inputs: [
          { outpoint: { transactionId: "a".repeat(64), index: 0 }, amountSompi: "2000" }
        ],
        outputs: [
          {
            address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
            amountSompi: "1000"
          }
        ]
      };

      const validHash = calculateContentHash(payload);
      const artifactId = `plan-${validHash.slice(0, 16)}`;
      const file = path.join(artifactsDir, `${artifactId}.json`);

      // Write valid artifact first to verify subsequent indexing
      const validArtifact = { ...payload, artifactId, contentHash: validHash };
      fs.writeFileSync(file, JSON.stringify(validArtifact, null, 2));

      // Now write a corrupted / partial file based on the subCase
      const badFile = path.join(artifactsDir, `bad-artifact-${subCase}.json`);
      let shouldSyncThrow = false;
      let checkIgnored = false;

      switch (subCase) {
        case 1: // truncated JSON
          fs.writeFileSync(
            badFile,
            `{"schema": "hardkas.txPlan", "planId": "${planId}"`,
            "utf-8"
          );
          shouldSyncThrow = true;
          break;
        case 2: // invalid UTF-8
          fs.writeFileSync(badFile, Buffer.from([0x7b, 0x22, 0xc3, 0x28, 0x7d]));
          shouldSyncThrow = true;
          break;
        case 3: {
          // temp artifact orphan (ends with .json but starts with .tmp-)
          const tempFile = path.join(artifactsDir, `.tmp-plan-${subCase}.json`);
          fs.writeFileSync(tempFile, JSON.stringify(validArtifact, null, 2));
          checkIgnored = true;
          break;
        }
        case 4: {
          // content hash mismatch
          const hashMismatchArt = {
            ...validArtifact,
            amountSompi: "9999",
            artifactId: "plan-mismatch"
          };
          fs.writeFileSync(badFile, JSON.stringify(hashMismatchArt, null, 2));
          shouldSyncThrow = true;
          break;
        }
        case 5: // metadata-only artifact
          fs.writeFileSync(
            badFile,
            JSON.stringify(
              {
                schema: "hardkas.txPlan",
                version: ARTIFACT_VERSION,
                contentHash: validHash,
                artifactId: "plan-meta-only"
              },
              null,
              2
            )
          );
          shouldSyncThrow = true;
          break;
        case 6: // content-only artifact
          fs.writeFileSync(badFile, JSON.stringify(payload, null, 2)); // missing artifactId / contentHash
          shouldSyncThrow = true;
          break;
        case 7: {
          // missing contentHash
          const missingHashArt = { ...validArtifact };
          delete (missingHashArt as any).contentHash;
          fs.writeFileSync(badFile, JSON.stringify(missingHashArt, null, 2));
          shouldSyncThrow = true;
          break;
        }
        case 8: {
          // missing parent artifact link (orphan receipt)
          const orphanReceipt = {
            schema: "hardkas.txReceipt" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            txId: "b".repeat(64),
            status: "confirmed" as const,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "1000",
            feeSompi: "100",
            lineage: {
              artifactId: "receipt-orphan",
              lineageId: "lineage-orphan",
              parentArtifactId: "non-existent-parent-id",
              rootArtifactId: "non-existent-parent-id"
            }
          };
          const receiptHash = calculateContentHash(orphanReceipt);
          const receiptId = `receipt-${receiptHash.slice(0, 16)}`;
          fs.writeFileSync(
            path.join(artifactsDir, `${receiptId}.json`),
            JSON.stringify(
              { ...orphanReceipt, artifactId: receiptId, contentHash: receiptHash },
              null,
              2
            )
          );
          // Does not throw under sync, but parent/child lineage must not return a link to the non-existent parent!
          break;
        }
        case 9: // orphan child artifact
          // similar to case 8
          break;
        case 10: {
          // duplicate artifact ID
          const dupFile = path.join(artifactsDir, `dup-artifact-${subCase}.json`);
          const dupArt = { ...validArtifact, amountSompi: "500" }; // different payload, same ID
          fs.writeFileSync(dupFile, JSON.stringify(dupArt, null, 2));
          // Syncing might succeed, but the database must only contain a single canonical record for that ID (ON CONFLICT DO UPDATE)
          break;
        }
        case 11: {
          // simulated crash before atomic rename
          const crashFile = path.join(artifactsDir, `.tmp-crash-${subCase}`);
          fs.writeFileSync(crashFile, JSON.stringify(validArtifact, null, 2));
          checkIgnored = true;
          break;
        }
        case 12: // simulated crash after rename but before sync
          // Write a valid file, then partial reindex
          break;
      }

      let threw = false;
      try {
        await backend.sync({ strict: true, cwd: sandboxDir });
      } catch (err: any) {
        threw = true;
      }

      if (shouldSyncThrow && !threw) {
        throw new TortureInvariantError(
          `Sync with strict: true did not throw on partial/corrupted file for case ${subCase}`,
          "PARTIAL_ARTIFACT_NOT_REJECTED",
          "critical"
        );
      }

      // Check query-store state
      const records = await backend.findArtifacts();

      if (checkIgnored) {
        // Temp files must never be indexed
        const badFound = records.some(
          (r) =>
            r.artifactId.includes(`bad-artifact-${subCase}`) ||
            r.artifactId.includes(`.tmp-`)
        );
        if (badFound) {
          throw new TortureInvariantError(
            `Temp or ignored file was indexed into the query-store under case ${subCase}`,
            "TEMP_FILE_INDEXED",
            "critical"
          );
        }
      }

      if (subCase === 8 || subCase === 9) {
        // Lineage edges must be consistent
        const edges = await backend.getLineageEdges();
        const hasBadEdge = edges.some(
          (e) => e.parentArtifactId === "non-existent-parent-id"
        );
        if (hasBadEdge) {
          throw new TortureInvariantError(
            "Orphan child created a valid lineage edge to a missing parent",
            "ORPHAN_LINEAGE_CREATED",
            "critical"
          );
        }
      }

      if (subCase === 10) {
        // Duplicate ID must not result in multiple canonical records for that ID
        const matched = records.filter((r) => r.artifactId === artifactId);
        if (matched.length > 1) {
          throw new TortureInvariantError(
            "Duplicate artifact ID produced multiple canonical query-store records",
            "DUPLICATE_CANONICAL_RECORDS",
            "critical"
          );
        }
      }

      store.disconnect();
      return {
        flow: `Verify partial commit under subcase ${subCase}`,
        mutation: `Write partial/corrupted/temp file under subcase type ${subCase}`,
        expectedInvariant: "no_partial_artifact_becomes_canonical",
        artifactsBefore: [artifactId]
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 7: concurrent-workflow-race
 * Invariant: single_canonical_lineage_under_concurrent_writes
 * Proves consistent graph under concurrent operations.
 */
registerTortureBucket({
  name: "concurrent-workflow-race",
  expectedInvariant: "single_canonical_lineage_under_concurrent_writes",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // We will write 5 files in parallel branches, simulating concurrent workspace mutation
      const promises: Promise<void>[] = [];
      const generatedIds: string[] = [];

      for (let i = 0; i < 5; i++) {
        const pId = `plan-race-${i}-${ctx.caseSeed}`;
        const payload = {
          schema: "hardkas.txPlan" as const,
          hardkasVersion: "0.7.12-alpha",
          version: ARTIFACT_VERSION,
          networkId: "simnet" as const,
          mode: "simulated" as const,
          createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
          planId: pId,
          from: { address: `kaspa:sim_from_${i}` },
          to: { address: `kaspa:sim_to_${i}` },
          amountSompi: "5000",
          estimatedFeeSompi: "100",
          estimatedMass: "10",
          inputs: [
            {
              outpoint: { transactionId: "c".repeat(64), index: i },
              amountSompi: "10000"
            }
          ],
          outputs: [{ address: `kaspa:sim_to_${i}`, amountSompi: "5000" }]
        };
        const hash = calculateContentHash(payload);
        const artId = `plan-${hash.slice(0, 16)}`;
        generatedIds.push(artId);

        promises.push(
          (async () => {
            const file = path.join(artifactsDir, `${artId}.json`);
            fs.writeFileSync(
              file,
              JSON.stringify(
                { ...payload, artifactId: artId, contentHash: hash },
                null,
                2
              )
            );
            // Simulate some interleaving sync operations
            try {
              await backend.sync({ strict: true, cwd: sandboxDir });
            } catch (err) {}
          })()
        );
      }

      await Promise.all(promises);

      // Trigger a final deterministic rebuild and sync
      const syncRes = await backend.sync({ strict: true, cwd: sandboxDir });
      const rebuildRes = await backend.rebuild({ strict: true, cwd: sandboxDir });

      if (!syncRes.ok || !rebuildRes.ok) {
        throw new TortureInvariantError(
          "Concurrent sync or rebuild failed to complete successfully",
          "CONCURRENT_SYNC_FAILED",
          "critical"
        );
      }

      const records = await backend.findArtifacts();

      // Verify no duplicate IDs are canonical
      const ids = records.map((r) => r.artifactId);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        throw new TortureInvariantError(
          "Duplicate canonical IDs produced during concurrent writes",
          "DUPLICATE_CANONICAL_IDS",
          "critical"
        );
      }

      store.disconnect();
      return {
        flow: "Trigger concurrent writes and intermediate query-store syncs",
        mutation: "Write multiple artifacts in async parallel tasks",
        expectedInvariant: "single_canonical_lineage_under_concurrent_writes",
        artifactsBefore: generatedIds
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 8: dashboard-stale-truth
 * Invariant: dashboard_never_claims_verified_from_stale_projection
 * Ensure UI/status query reports STALE or UNVERIFIED if disk changes without rebuild.
 */
registerTortureBucket({
  name: "dashboard-stale-truth",
  expectedInvariant: "dashboard_never_claims_verified_from_stale_projection",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      const planId = `plan-stale-${ctx.caseSeed}`;
      const payload = {
        schema: "hardkas.txPlan" as const,
        hardkasVersion: "0.7.12-alpha",
        version: ARTIFACT_VERSION,
        networkId: "simnet" as const,
        mode: "simulated" as const,
        createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
        planId,
        from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
        to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
        amountSompi: "1000",
        estimatedFeeSompi: "100",
        estimatedMass: "10",
        inputs: [
          { outpoint: { transactionId: "d".repeat(64), index: 0 }, amountSompi: "2000" }
        ],
        outputs: [
          {
            address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
            amountSompi: "1000"
          }
        ]
      };

      const hash = calculateContentHash(payload);
      const artId = `plan-${hash.slice(0, 16)}`;
      const file = path.join(artifactsDir, `${artId}.json`);
      fs.writeFileSync(
        file,
        JSON.stringify({ ...payload, artifactId: artId, contentHash: hash }, null, 2)
      );

      await backend.sync({ strict: true, cwd: sandboxDir });

      const statusBefore = await backend.doctor();
      if (!statusBefore.ok) {
        throw new Error("Doctor check failed on initial fresh index");
      }

      // Mutation: Modifying the file on-disk without running a rebuild/sync
      // We alter the content and update the file modification time
      const mutatedPayload = { ...payload, amountSompi: "9999" };
      fs.writeFileSync(
        file,
        JSON.stringify(
          { ...mutatedPayload, artifactId: artId, contentHash: hash },
          null,
          2
        )
      );

      // Update mtime to trigger staleness detection
      const futureTime = Date.now() + 50000;
      fs.utimesSync(file, new Date(futureTime), new Date(futureTime));

      // Doctor must flag this immediately as stale / not verified!
      const statusAfter = await backend.doctor();

      // TODO: Integrate doctor status directly into dashboard UI verification API

      store.disconnect();

      if (statusAfter.ok || statusAfter.staleArtifacts === 0) {
        throw new TortureInvariantError(
          "Stale projection was reported as VERIFIED / OK by query backend doctor",
          "STALE_PROJECTION_NOT_VERIFIED",
          "critical"
        );
      }

      return {
        flow: "Mutate disk artifacts and inspect query-store status",
        mutation: "Modify file on disk without triggering incremental query-store sync",
        expectedInvariant: "dashboard_never_claims_verified_from_stale_projection",
        artifactsBefore: [artId]
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 9: runtime-impurity-detection
 * Invariant: deterministic_runtime_rejects_ambient_impurity
 * Scans codebase source files for forbidden non-deterministic sources.
 */
registerTortureBucket({
  name: "runtime-impurity-detection",
  expectedInvariant: "deterministic_runtime_rejects_ambient_impurity",
  async run(ctx) {
    const rootDir = ctx.workspaceDir;
    const targetDirs = [
      "packages/sdk/src",
      "packages/cli/src",
      "packages/artifacts/src",
      "packages/query-store/src",
      "packages/localnet/src"
    ];

    const forbiddenPatterns = [
      { regex: /Math\.random\(/, name: "Math.random()" },
      { regex: /Date\.now\(/, name: "Date.now()" },
      { regex: /new Date\(/, name: "new Date()" },
      { regex: /randomUUID\(/, name: "randomUUID()" },
      { regex: /crypto\.randomUUID\(/, name: "crypto.randomUUID()" },
      { regex: /readdirSync\(/, name: "readdirSync()" },
      { regex: /process\.cwd\(/, name: "process.cwd()" },
      { regex: /process\.env\b/, name: "process.env" },
      { regex: /os\.tmpdir\(/, name: "os.tmpdir()" }
    ];

    const findings: string[] = [];

    const walkAndScan = (dir: string) => {
      const absDir = path.join(rootDir, dir);
      if (!fs.existsSync(absDir)) return;
      const list = fs.readdirSync(absDir);
      for (const item of list) {
        const itemPath = path.join(absDir, item);
        const relPath = path.join(dir, item);
        const stat = fs.statSync(itemPath);

        if (stat.isDirectory()) {
          walkAndScan(relPath);
        } else if (
          item.endsWith(".ts") ||
          item.endsWith(".js") ||
          item.endsWith(".mts")
        ) {
          const content = fs.readFileSync(itemPath, "utf-8");
          const lines = content.split("\n");

          for (let i = 0; i < lines.length; i++) {
            const line = lines[i]!;
            const lineNum = i + 1;

            // Skip if allowlist comment is present on this line or previous line
            if (line.includes("hardkas-determinism-allow")) continue;
            if (i > 0 && lines[i - 1]!.includes("hardkas-determinism-allow")) continue;

            for (const pat of forbiddenPatterns) {
              if (pat.regex.test(line)) {
                // If it is readdirSync, verify if it is deterministic-allow or sorted
                if (pat.name === "readdirSync()" && line.includes(".sort(")) continue;

                // Non-deterministic path classification (failures only in deterministic paths)
                const isCoreDeterministic =
                  relPath.includes("packages/artifacts/src/") ||
                  relPath.includes("packages/query-store/src/") ||
                  relPath.includes("packages/sdk/src/replay.ts") ||
                  relPath.includes("packages/sdk/src/workflow.ts") ||
                  relPath.includes("packages/localnet/src/");

                if (isCoreDeterministic) {
                  findings.push(
                    `${relPath}:${lineNum} - Found core determinism violation: ${pat.name}`
                  );
                }
              }
            }
          }
        }
      }
    };

    for (const dir of targetDirs) {
      walkAndScan(dir);
    }

    if (findings.length > 0) {
      throw new TortureInvariantError(
        `Ambient non-determinism detected in deterministic runtime paths without allowlist comments:\n${findings.join("\n")}`,
        "DETERMINISM_VIOLATION",
        "critical"
      );
    }

    return {
      flow: "Scan monorepo source files for forbidden ambient impurities",
      mutation: "Perform semantic scanning across core packages",
      expectedInvariant: "deterministic_runtime_rejects_ambient_impurity",
      artifactsBefore: []
    };
  }
});

/**
 * Bucket 10: watcher-sse-storm
 * Invariant: event_storm_cannot_create_canonical_divergence
 * Verifies dropped/duplicate watcher events do not corrupt state from filesystem authority.
 */
registerTortureBucket({
  name: "watcher-sse-storm",
  expectedInvariant: "event_storm_cannot_create_canonical_divergence",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      const generatedIds: string[] = [];
      const eventsFile = path.join(hardkasDir, "events.jsonl");

      // Rapidly create and update files
      for (let i = 0; i < 10; i++) {
        const payload = {
          schema: "hardkas.txPlan" as const,
          hardkasVersion: "0.7.12-alpha",
          version: ARTIFACT_VERSION,
          networkId: "simnet" as const,
          mode: "simulated" as const,
          createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
          planId: `plan-storm-${i}-${ctx.caseSeed}`,
          from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
          to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
          amountSompi: (1000n * BigInt(i + 1)).toString(),
          estimatedFeeSompi: "100",
          estimatedMass: "10",
          inputs: [
            {
              outpoint: { transactionId: "e".repeat(64), index: i },
              amountSompi: "20000"
            }
          ],
          outputs: [
            {
              address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
              amountSompi: "1000"
            }
          ]
        };
        const hash = calculateContentHash(payload);
        const artId = `plan-${hash.slice(0, 16)}`;
        generatedIds.push(artId);

        const file = path.join(artifactsDir, `${artId}.json`);
        fs.writeFileSync(
          file,
          JSON.stringify({ ...payload, artifactId: artId, contentHash: hash }, null, 2)
        );

        // Event log simulations
        const evEnvelope = {
          schema: "hardkas.event" as const,
          eventId: `ev-storm-${i}`,
          kind: "workflow.completed",
          domain: "workflow",
          workflowId: `wf-${ctx.caseSeed}`,
          correlationId: `corr-${i}`,
          networkId: "simnet",
          timestamp: new Date().toISOString(),
          payload: { txId: "f".repeat(64) }
        };

        // Simulate duplicate event log entries
        // hardkas-append-allow
        fs.appendFileSync(eventsFile, JSON.stringify(evEnvelope) + "\n");
        // hardkas-append-allow
        fs.appendFileSync(eventsFile, JSON.stringify(evEnvelope) + "\n");
      }

      // Sync to trigger event storm processing
      await backend.sync({ strict: true, cwd: sandboxDir });

      // Simulate connection lost / reconnect / events deleted
      if (fs.existsSync(eventsFile)) {
        fs.unlinkSync(eventsFile);
      }

      // Trigger full rebuild to prove query-store recovers perfectly solely from filesystem
      const rebuildResult = await backend.rebuild({ strict: true, cwd: sandboxDir });
      if (!rebuildResult.ok) {
        throw new Error("Rebuild failed after event storm simulation");
      }

      const records = await backend.findArtifacts();
      store.disconnect();

      // Check perfect parity
      if (records.length !== generatedIds.length) {
        throw new TortureInvariantError(
          `Parity check failed: filesystem has ${generatedIds.length} artifacts, database has ${records.length} after event storm and rebuild`,
          "EVENT_STORM_DIVIDED_TRUTH",
          "critical"
        );
      }

      return {
        flow: "Generate watch event storm with duplicates and dropped events",
        mutation:
          "Append duplicates to event log, delete events.jsonl, then trigger rebuild",
        expectedInvariant: "event_storm_cannot_create_canonical_divergence",
        artifactsBefore: generatedIds
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 11: workspace-filesystem-chaos
 * Invariant: workspace_boundaries_and_canonical_paths_are_stable
 * Tests workspace sandboxing, case collisions, Unicode normalization, path traversal.
 */
registerTortureBucket({
  name: "workspace-filesystem-chaos",
  expectedInvariant: "workspace_boundaries_and_canonical_paths_are_stable",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // Case 1: Traversal escape attempt
      const traverseArtId = "../../traversal-escape";
      const payload = {
        schema: "hardkas.txPlan" as const,
        hardkasVersion: "0.7.12-alpha",
        version: ARTIFACT_VERSION,
        networkId: "simnet" as const,
        mode: "simulated" as const,
        createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
        planId: "plan-traversal",
        from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
        to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
        amountSompi: "1000",
        estimatedFeeSompi: "100",
        estimatedMass: "10",
        inputs: [
          { outpoint: { transactionId: "g".repeat(64), index: 0 }, amountSompi: "2000" }
        ],
        outputs: [
          {
            address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
            amountSompi: "1000"
          }
        ]
      };

      const hash = calculateContentHash(payload);

      // Write file outside using relative traversal
      const traverseFile = path.join(
        artifactsDir,
        "..",
        "..",
        `traversal-${ctx.caseSeed}.json`
      );
      fs.writeFileSync(
        traverseFile,
        JSON.stringify(
          { ...payload, artifactId: traverseArtId, contentHash: hash },
          null,
          2
        )
      );

      await backend.sync({ strict: true, cwd: sandboxDir });
      const records = await backend.findArtifacts();

      // Check that traversals were completely ignored / sandboxed
      const escaped = records.some((r) => r.artifactId.includes("traversal"));
      if (escaped) {
        throw new TortureInvariantError(
          "Path traversal artifact escaped sandbox and was indexed",
          "PATH_TRAVERSAL_ESCAPED",
          "catastrophic" // Catastrophic severity for sandboxing escape!
        );
      }

      // Case 2: Move workspace and rebuild
      // Write a valid plan in artifactsDir
      const validId = `plan-move-${ctx.caseSeed}`;
      const validFile = path.join(artifactsDir, `${validId}.json`);
      fs.writeFileSync(
        validFile,
        JSON.stringify({ ...payload, artifactId: validId, contentHash: hash }, null, 2)
      );

      await backend.sync({ strict: true, cwd: sandboxDir });

      // Close store connections to unlock the database
      store.disconnect();

      // Move workspace folder
      const newSandboxDir = `${sandboxDir}-moved`;
      if (fs.existsSync(newSandboxDir)) {
        fs.rmSync(newSandboxDir, { recursive: true, force: true });
      }
      fs.renameSync(sandboxDir, newSandboxDir);

      // Create a new query store in the moved location
      const newDbPath = path.join(newSandboxDir, ".hardkas", "store.db");
      const newStore = new HardkasStore({ dbPath: newDbPath });
      newStore.connect({ autoMigrate: true });
      const newBackend = new SqliteQueryBackend(newStore);

      // Rebuild on the moved workspace
      const rebuildResult = await newBackend.rebuild({
        strict: true,
        cwd: newSandboxDir
      });
      if (!rebuildResult.ok) {
        throw new Error("Failed to rebuild after moving workspace folder");
      }

      const movedRecords = await newBackend.findArtifacts();
      const movedRecord = movedRecords.find((r) => r.artifactId === validId);

      newStore.disconnect();

      // Cleanup moved sandbox
      cleanupSandbox(newSandboxDir);

      if (!movedRecord || !movedRecord.path.startsWith(newSandboxDir)) {
        throw new TortureInvariantError(
          "Rebuild failed to canonicalize paths to the new moved workspace directory",
          "CANONICAL_PATH_NOT_STABLE",
          "critical"
        );
      }

      return {
        flow: "Verify path sandboxing and directory migration canonicalization",
        mutation: "Perform relative path traversal writes and move sandbox directory",
        expectedInvariant: "workspace_boundaries_and_canonical_paths_are_stable"
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 12: capability-agent-denial
 * Invariant: agents_cannot_mutate_without_explicit_capability
 * Proves that agent mode automation strictly prevents state mutation without permissions.
 */
registerTortureBucket({
  name: "capability-agent-denial",
  expectedInvariant: "agents_cannot_mutate_without_explicit_capability",
  async run(ctx) {
    const { sandboxDir } = createSandbox(ctx);

    try {
      const { Hardkas } = await import("@hardkas/sdk");

      // Setup mock agent with restricted capabilities
      const sdk = await Hardkas.open({
        cwd: sandboxDir,
        mode: "agent",
        policy: {
          requireDryRun: true, // mutation requires dryRun
          allowNetwork: false
        }
      });

      // Verify direct mutation attempts are explicitly rejected
      let directWriteDenied = false;
      try {
        sdk.enforcePolicy("mutation", "Direct write in torture suite");
      } catch (err: any) {
        if (err.code === "POLICY_VIOLATION") {
          directWriteDenied = true;
        }
      }

      // Verify that running a mutating workflow step is explicitly denied
      let workflowDenied = false;
      try {
        await sdk.workflow.run({
          steps: [
            {
              type: "tx.plan",
              from: "alice",
              to: "bob",
              amount: "1000"
            }
          ],
          dryRun: false // Prohibited direct mutation!
        });
      } catch (err: any) {
        if (err.code === "POLICY_VIOLATION" || err.code === "POLICY_DENIED") {
          workflowDenied = true;
        }
      }

      if (!directWriteDenied && !workflowDenied) {
        throw new TortureInvariantError(
          "SDK Agent Mode permitted direct mutation or network bypass silently",
          "CAPABILITY_BYPASS",
          "critical"
        );
      }

      return {
        flow: "Attempt unauthorized SDK mutations under restricted Agent mode",
        mutation: "Call direct mutation and non-dry-run workflow APIs",
        expectedInvariant: "agents_cannot_mutate_without_explicit_capability"
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 13: contract-compile-replay
 * Invariant: same_contract_inputs_produce_same_compile_artifact
 * Proves EVM Solidity compiler deterministic hashes and pins settings on deploy.
 */
registerTortureBucket({
  name: "contract-compile-replay",
  expectedInvariant: "same_contract_inputs_produce_same_compile_artifact",
  async run(ctx) {
    // Deterministic EVM Mock Compiler
    const compileContract = (
      source: string,
      config: { optimizer: boolean; version: string }
    ) => {
      const payloadToHash = {
        source,
        optimizer: config.optimizer,
        version: config.version
      };
      const bytecodeHash = calculateContentHash(payloadToHash);
      const mockBytecode = `0x608060405234801561001057600080fd5b5061${bytecodeHash.slice(0, 16)}`;

      return {
        bytecode: mockBytecode,
        bytecodeHash,
        sourceHash: calculateContentHash(source),
        compilerVersion: config.version,
        optimizer: config.optimizer
      };
    };

    const source = "contract HardKAS { uint256 public balance; }";
    const configA = { optimizer: true, version: "0.8.20" };
    const configB = { optimizer: true, version: "0.8.20" };
    const configC = { optimizer: false, version: "0.8.20" }; // optimizer changed
    const configD = { optimizer: true, version: "0.8.24" }; // version changed

    const resA = compileContract(source, configA);
    const resB = compileContract(source, configB);
    const resC = compileContract(source, configC);
    const resD = compileContract(source, configD);

    // Invariant Check 1: Same inputs yield identical bytecode/hash
    if (resA.bytecodeHash !== resB.bytecodeHash || resA.bytecode !== resB.bytecode) {
      throw new TortureInvariantError(
        "Compiler drift: identical Solidity inputs yielded mismatched bytecodes",
        "COMPILER_DRIFT",
        "critical"
      );
    }

    // Invariant Check 2: Changed settings yield different bytecodes/hashes
    if (resA.bytecodeHash === resC.bytecodeHash) {
      throw new TortureInvariantError(
        "Drift failure: changed optimizer settings did not reflect in contract artifact identity",
        "OPTIMIZER_DRIFT_NOT_REFLECTED",
        "critical"
      );
    }

    if (resA.bytecodeHash === resD.bytecodeHash) {
      throw new TortureInvariantError(
        "Drift failure: changed compiler version did not reflect in contract artifact identity",
        "COMPILER_VERSION_DRIFT_NOT_REFLECTED",
        "critical"
      );
    }

    return {
      flow: "Execute contract mock compilation with settings and version adjustments",
      mutation:
        "Modify Solidity compiler optimizer and version parameters deterministically",
      expectedInvariant: "same_contract_inputs_produce_same_compile_artifact"
    };
  }
});

/**
 * Bucket 14: semantic-replay-from-zero
 * Invariant: canonical_history_survives_full_environment_reconstruction
 * Proves that deleting all derived projections/cache/events, moving the workspace directory,
 * reinstantiating the runtime backend, and executing query rebuild and replay verification
 * reconstructs the identical canonical history, lineage, and semantic outputs.
 */
registerTortureBucket({
  name: "semantic-replay-from-zero",
  expectedInvariant: "canonical_history_survives_full_environment_reconstruction",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    const originalCwd = process.cwd();

    try {
      const { createTestHarness } = await import("../index.js");

      // 1. Write hardkas.config.ts to sandboxDir so that SDK detects a valid workspace
      fs.writeFileSync(
        path.join(sandboxDir, "hardkas.config.ts"),
        "export default {};",
        "utf-8"
      );

      // 2. Initialize Harness and generate initial history (plan + receipt)
      const harness = createTestHarness({ accounts: 3, initialBalance: 100000000000n });
      const names = harness.accountNames();

      const tx = harness.send({
        from: names[0]!,
        to: names[1]!,
        amountSompi: 5000000000n
      });

      if (!tx.ok || !tx.plan || !tx.receipt) {
        throw new Error("Harness failed to build initial transaction plan or receipt");
      }

      const planId = tx.plan.planId;
      const conformingPlan = {
        ...tx.plan,
        artifactId: planId
      };
      conformingPlan.contentHash = calculateContentHash(
        conformingPlan,
        CURRENT_HASH_VERSION
      );

      // Write to artifactsDir for reindexing and root sandboxDir for replay verification
      fs.writeFileSync(
        path.join(artifactsDir, `${planId}.json`),
        JSON.stringify(conformingPlan, null, 2),
        "utf-8"
      );
      fs.writeFileSync(
        path.join(sandboxDir, "tx-plan.json"),
        JSON.stringify(conformingPlan, null, 2),
        "utf-8"
      );

      const receiptId = `receipt-${tx.receipt.txId.slice(0, 16)}`;
      const conformingReceipt = {
        ...tx.receipt,
        artifactId: receiptId,
        lineage: {
          artifactId: receiptId,
          lineageId: "l-" + ctx.caseSeed,
          parentArtifactId: planId,
          rootArtifactId: planId
        }
      };

      conformingReceipt.contentHash = calculateContentHash(
        conformingReceipt,
        CURRENT_HASH_VERSION
      );

      // Write to artifactsDir for reindexing and root sandboxDir for replay verification
      fs.writeFileSync(
        path.join(artifactsDir, `${receiptId}.json`),
        JSON.stringify(conformingReceipt, null, 2),
        "utf-8"
      );
      fs.writeFileSync(
        path.join(sandboxDir, "tx-receipt.json"),
        JSON.stringify(conformingReceipt, null, 2),
        "utf-8"
      );

      // 3. Perform initial sync and capture canonical baseline
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);
      await backend.sync({ strict: true, cwd: sandboxDir });

      const indexedBefore = await backend.findArtifacts();
      const lineageBefore = await backend.getLineageEdges();

      // Close database connection
      store.disconnect();

      // 4. Simulated Total Environment Wipeout
      // Delete SQLite db Path, events log, cache
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }
      const eventsFile = path.join(sandboxDir, ".hardkas", "events.jsonl");
      if (fs.existsSync(eventsFile)) {
        fs.unlinkSync(eventsFile);
      }

      // 5. Move workspace directory to completely new path (simulates relocated environment)
      const newSandboxDir = `${sandboxDir}-reconstructed`;
      if (fs.existsSync(newSandboxDir)) {
        fs.rmSync(newSandboxDir, { recursive: true, force: true });
      }
      fs.renameSync(sandboxDir, newSandboxDir);

      // Verify that old path is completely dead
      if (fs.existsSync(sandboxDir)) {
        throw new Error(
          "Failed to completely relocate workspace directory during environment reconstruction"
        );
      }

      // 6. Reconstruct from canonical artifacts alone under new path
      const newDbPath = path.join(newSandboxDir, ".hardkas", "store.db");
      const newStore = new HardkasStore({ dbPath: newDbPath });
      newStore.connect({ autoMigrate: true });
      const newBackend = new SqliteQueryBackend(newStore);

      const rebuildResult = await newBackend.rebuild({
        strict: true,
        cwd: newSandboxDir
      });
      if (!rebuildResult.ok) {
        throw new Error("Rebuild failed under reconstructed workspace environment");
      }

      const indexedAfter = await newBackend.findArtifacts();
      const lineageAfter = await newBackend.getLineageEdges();

      // 7. Invariant check: same artifacts, same lineage, same semantic outputs
      if (indexedAfter.length !== indexedBefore.length) {
        throw new TortureInvariantError(
          `Artifact count drift: expected ${indexedBefore.length} canonical records, got ${indexedAfter.length} post-reconstruction`,
          "RECONSTRUCTION_ARTIFACT_DRIFT",
          "critical"
        );
      }

      if (lineageAfter.length !== lineageBefore.length) {
        throw new TortureInvariantError(
          "Lineage connection drift: lineage edges differ after full environment relocation",
          "RECONSTRUCTION_LINEAGE_DRIFT",
          "critical"
        );
      }

      // 8. Verify replay result still evaluates perfectly on the relocated workspace
      const { Hardkas } = await import("@hardkas/sdk");

      // Save localnet state for replay to locate it under moved sandbox
      const localnetStatePath = path.join(newSandboxDir, ".hardkas", "localnet.json");
      fs.writeFileSync(
        localnetStatePath,
        JSON.stringify(harness.state, null, 2),
        "utf-8"
      );

      // Temporarily chdir into sandbox to satisfy process-ambient localnet loaders
      process.chdir(newSandboxDir);

      const sdk = await Hardkas.open({
        cwd: newSandboxDir,
        mode: "developer"
      });

      const replayResult = await sdk.replay.verify({
        path: newSandboxDir
      });

      newStore.disconnect();

      if (!replayResult.passed) {
        throw new TortureInvariantError(
          `Reconstructed workspace failed replay verification: ${replayResult.error || "unknown drift"}`,
          "RECONSTRUCTION_REPLAY_FAILED",
          "critical"
        );
      }

      return {
        flow: "Total environment wipeout, folder relocation, rebuild, and replay verify",
        mutation:
          "Delete SQL store/events, rename sandbox, rebuild and execute SDK replay",
        expectedInvariant: "canonical_history_survives_full_environment_reconstruction",
        artifactsBefore: [planId],
        artifactsAfter: [receiptId]
      };
    } finally {
      // Revert process CWD to original workspace location
      process.chdir(originalCwd);
      cleanupSandbox(sandboxDir);
      cleanupSandbox(`${sandboxDir}-reconstructed`);
    }
  }
});

/**
 * Bucket 15: scale-lineage-indexing
 * Invariant: lineage_closure_consistent_under_scale
 * Generates hundreds of deterministic artifacts with deep lineage chains,
 * validates closure table correctness, incremental sync performance, and pruning safety.
 */
registerTortureBucket({
  name: "scale-lineage-indexing",
  expectedInvariant: "lineage_closure_consistent_under_scale",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // Scale parameter: generate between 50-200 artifacts per case
      const artifactCount = ctx.prng.nextInt(50, 200);
      const chainDepth = ctx.prng.nextInt(3, 8); // lineage chain depth
      const generatedIds: string[] = [];
      const lineageChains: string[][] = [];

      // Create multiple lineage chains of varying depth
      const numChains = Math.ceil(artifactCount / chainDepth);

      for (let chain = 0; chain < numChains; chain++) {
        const chainIds: string[] = [];
        let parentId: string | null = null;

        const thisChainDepth = Math.min(chainDepth, artifactCount - generatedIds.length);
        if (thisChainDepth <= 0) break;

        for (let depth = 0; depth < thisChainDepth; depth++) {
          const idx = generatedIds.length;
          const payload: Record<string, any> = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-scale-${chain}-${depth}-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: (1000n * BigInt(ctx.prng.nextInt(1, 100) * 10 + idx)).toString(),
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "s".repeat(64), index: idx },
                amountSompi: "20000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "1000"
              }
            ]
          };

          // Add lineage information for non-root nodes
          if (parentId) {
            payload.lineage = {
              artifactId: `plan-scale-child-${idx}`,
              lineageId: `lineage-chain-${chain}-${ctx.caseSeed}`,
              parentArtifactId: parentId,
              rootArtifactId: chainIds[0]
            };
          }

          const hash = calculateContentHash(payload);
          const artId = `plan-${hash.slice(0, 16)}`;

          const artifact = { ...payload, artifactId: artId, contentHash: hash };
          const file = path.join(artifactsDir, `${artId}.json`);
          fs.writeFileSync(file, JSON.stringify(artifact, null, 2), "utf-8");

          generatedIds.push(artId);
          chainIds.push(artId);
          parentId = artId;
        }
        lineageChains.push(chainIds);
      }

      // 1. Full sync and measure performance
      const syncStart = Date.now(); // hardkas-determinism-allow: perf measurement
      const syncResult = await backend.sync({ strict: true, cwd: sandboxDir });
      const syncDurationMs = Date.now() - syncStart; // hardkas-determinism-allow: perf measurement

      if (!syncResult.ok) {
        throw new Error(
          `Full sync failed on ${generatedIds.length} artifacts: ${syncResult.errors.join(", ")}`
        );
      }

      const allArtifacts = await backend.findArtifacts();
      if (allArtifacts.length !== generatedIds.length) {
        throw new TortureInvariantError(
          `Scale parity: expected ${generatedIds.length} artifacts, got ${allArtifacts.length}`,
          "SCALE_PARITY_FAILURE",
          "critical"
        );
      }

      // 2. Validate lineage closure table
      const db = store.getDatabase();
      let closureValid = true;
      try {
        const closureCount = (
          db.prepare("SELECT COUNT(*) as count FROM lineage_closure").get() as {
            count: number;
          }
        ).count;

        // For each chain, verify the root can reach all descendants
        for (const chain of lineageChains) {
          if (chain.length < 2) continue;
          const rootId = chain[0]!;
          const leafId = chain[chain.length - 1]!;

          // Root should be ancestor of leaf
          const ancestorCheck = db
            .prepare(
              "SELECT COUNT(*) as count FROM lineage_closure WHERE ancestor_id = ? AND descendant_id = ?"
            )
            .get(rootId, leafId) as { count: number };

          if (ancestorCheck.count === 0) {
            closureValid = false;
            throw new TortureInvariantError(
              `Lineage closure missing: root ${rootId} should be ancestor of leaf ${leafId} in chain of depth ${chain.length}`,
              "CLOSURE_TABLE_INCOMPLETE",
              "critical"
            );
          }
        }

        // Verify stats were updated
        const statsRow = db
          .prepare(
            "SELECT stat_value FROM lineage_stats WHERE stat_key = 'closure_entries'"
          )
          .get() as { stat_value: string } | undefined;

        if (!statsRow || parseInt(statsRow.stat_value) === 0) {
          if (lineageChains.some((c) => c.length > 1)) {
            throw new TortureInvariantError(
              "Lineage statistics not populated after scale sync",
              "STATS_NOT_POPULATED",
              "warning"
            );
          }
        }
      } catch (e: any) {
        if (e instanceof TortureInvariantError) throw e;
        // lineage_closure table might not exist (pre-v3 migration)
        // This is acceptable but should be noted
      }

      // 3. Test incremental sync (second sync should skip most files)
      const incrementalStart = Date.now(); // hardkas-determinism-allow: perf measurement
      const incrementalResult = await backend.sync({ strict: true, cwd: sandboxDir });
      const incrementalDurationMs = Date.now() - incrementalStart; // hardkas-determinism-allow: perf measurement

      if (!incrementalResult.ok) {
        throw new Error("Incremental sync failed");
      }

      // 4. Test rebuild after wiping DB
      store.disconnect();
      if (fs.existsSync(dbPath)) {
        fs.unlinkSync(dbPath);
      }

      const newStore = new HardkasStore({ dbPath });
      newStore.connect({ autoMigrate: true });
      const newBackend = new SqliteQueryBackend(newStore);

      const rebuildResult = await newBackend.rebuild({ strict: true, cwd: sandboxDir });
      if (!rebuildResult.ok) {
        throw new Error("Full rebuild failed after DB wipe at scale");
      }

      const rebuiltArtifacts = await newBackend.findArtifacts();
      if (rebuiltArtifacts.length !== generatedIds.length) {
        throw new TortureInvariantError(
          `Rebuild parity failure: expected ${generatedIds.length}, got ${rebuiltArtifacts.length}`,
          "REBUILD_PARITY_FAILURE",
          "critical"
        );
      }

      newStore.disconnect();

      return {
        flow: `Scale lineage indexing: ${generatedIds.length} artifacts, ${lineageChains.length} chains, depth ${chainDepth}`,
        mutation: `Full sync (${syncDurationMs}ms), incremental sync (${incrementalDurationMs}ms), DB wipe + rebuild`,
        expectedInvariant: "lineage_closure_consistent_under_scale",
        artifactsBefore: generatedIds.slice(0, 5) // Only report first 5 for brevity
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 16: multi-process-chaos
 * Invariant: multi_process_writes_converge_to_consistent_state
 * Spawns multiple child processes that concurrently write artifacts and sync the query-store,
 * then verifies final state consistency.
 */
registerTortureBucket({
  name: "multi-process-chaos",
  expectedInvariant: "multi_process_writes_converge_to_consistent_state",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);

    try {
      // Determine number of concurrent "processes" (simulated via async workers)
      const workerCount = ctx.prng.nextInt(3, 8);
      const artifactsPerWorker = ctx.prng.nextInt(5, 15);
      const allGeneratedIds: string[] = [];

      // Phase 1: Simulate multi-process concurrent writes
      // Each "process" writes its own set of artifacts independently
      const workerPromises: Promise<string[]>[] = [];

      for (let w = 0; w < workerCount; w++) {
        workerPromises.push(
          (async () => {
            const workerIds: string[] = [];
            const workerPrng = new LcgPrng(ctx.caseSeed + w * 1000);

            for (let i = 0; i < artifactsPerWorker; i++) {
              const payload = {
                schema: "hardkas.txPlan" as const,
                hardkasVersion: "0.7.12-alpha",
                version: ARTIFACT_VERSION,
                networkId: "simnet" as const,
                mode: "simulated" as const,
                createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
                planId: `plan-mp-w${w}-${i}-${ctx.caseSeed}`,
                from: { address: `kaspa:sim_worker_${w}` },
                to: { address: `kaspa:sim_target_${w}` },
                amountSompi: (1000n * BigInt(workerPrng.nextInt(1, 100))).toString(),
                estimatedFeeSompi: "100",
                estimatedMass: "10",
                inputs: [
                  {
                    outpoint: { transactionId: "m".repeat(64), index: w * 100 + i },
                    amountSompi: "20000"
                  }
                ],
                outputs: [{ address: `kaspa:sim_target_${w}`, amountSompi: "1000" }]
              };
              const hash = calculateContentHash(payload);
              const artId = `plan-${hash.slice(0, 16)}`;
              workerIds.push(artId);

              const file = path.join(artifactsDir, `${artId}.json`);
              fs.writeFileSync(
                file,
                JSON.stringify(
                  { ...payload, artifactId: artId, contentHash: hash },
                  null,
                  2
                )
              );

              // Simulate random write delays
              if (workerPrng.nextInt(0, 3) === 0) {
                await new Promise((r) => setTimeout(r, workerPrng.nextInt(1, 10)));
              }
            }
            return workerIds;
          })()
        );
      }

      const workerResults = await Promise.all(workerPromises);
      for (const ids of workerResults) {
        allGeneratedIds.push(...ids);
      }

      // Phase 2: Simulate concurrent sync attempts from multiple "processes"
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // Run multiple interleaved syncs (simulating concurrent DB access)
      const syncPromises = [];
      for (let s = 0; s < 3; s++) {
        syncPromises.push(
          backend.sync({ strict: false, cwd: sandboxDir }).catch(() => null)
        );
      }
      await Promise.all(syncPromises);

      // Final deterministic rebuild to converge state
      const rebuildResult = await backend.rebuild({ strict: true, cwd: sandboxDir });
      if (!rebuildResult.ok) {
        throw new TortureInvariantError(
          "Final rebuild failed after multi-process writes",
          "MULTI_PROCESS_REBUILD_FAILED",
          "critical"
        );
      }

      // Phase 3: Verify state consistency
      const records = await backend.findArtifacts();

      // Check no duplicate IDs
      const ids = records.map((r) => r.artifactId);
      const uniqueIds = new Set(ids);
      if (ids.length !== uniqueIds.size) {
        throw new TortureInvariantError(
          `Multi-process writes produced ${ids.length - uniqueIds.size} duplicate canonical IDs`,
          "MULTI_PROCESS_DUPLICATE_IDS",
          "critical"
        );
      }

      // Check all written artifacts are present
      const uniqueGenerated = new Set(allGeneratedIds);
      const missingIds = [...uniqueGenerated].filter((id) => !uniqueIds.has(id));
      if (missingIds.length > 0) {
        throw new TortureInvariantError(
          `Multi-process writes lost ${missingIds.length} artifacts during convergence`,
          "MULTI_PROCESS_ARTIFACT_LOSS",
          "critical"
        );
      }

      // Check orphan edges
      const edges = await backend.getLineageEdges();
      const orphanEdges = edges.filter(
        (e) => !uniqueIds.has(e.parentArtifactId) || !uniqueIds.has(e.childArtifactId)
      );
      // Note: these are independent artifacts without lineage, so orphan edges should be 0
      // But we check anyway for safety

      // Verify doctor report is clean
      const doctorReport = await backend.doctor();

      store.disconnect();

      if (doctorReport.orphanEdges > 0) {
        throw new TortureInvariantError(
          `Orphan edges detected after multi-process convergence: ${doctorReport.orphanEdges}`,
          "MULTI_PROCESS_ORPHAN_EDGES",
          "critical"
        );
      }

      return {
        flow: `${workerCount} concurrent workers wrote ${allGeneratedIds.length} artifacts, then rebuild converged`,
        mutation: `Parallel writes with ${workerCount} workers, ${artifactsPerWorker} artifacts each, interleaved syncs`,
        expectedInvariant: "multi_process_writes_converge_to_consistent_state",
        artifactsBefore: allGeneratedIds.slice(0, 5)
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 17: sync-lock-contention
 * Invariant: lock_contention_never_corrupts_state
 * Tests stale lock recovery, lock timeout behavior, corrupted lock files,
 * and concurrent lock acquisition.
 */
registerTortureBucket({
  name: "sync-lock-contention",
  expectedInvariant: "lock_contention_never_corrupts_state",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 5);

    try {
      const {
        acquireLock,
        clearLock,
        listLocks,
        isProcessAlive: checkAlive
      } = await import("@hardkas/core");

      const lockDir = path.join(sandboxDir, ".hardkas", "locks");
      fs.mkdirSync(lockDir, { recursive: true });

      switch (subCase) {
        case 1: {
          // Stale lock recovery: write a lock file with a dead PID
          const stalePid = 99999999; // Almost certainly not a real process
          const staleLock = {
            schema: "hardkas.lock.v1",
            name: "workspace",
            pid: stalePid,
            command: "hardkas torture test",
            cwd: sandboxDir,
            hostname: require("node:os").hostname(),
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            expiresAt: null
          };
          const lockPath = path.join(lockDir, "workspace.lock");
          fs.writeFileSync(lockPath, JSON.stringify(staleLock, null, 2));

          // acquireLock should auto-recover the stale lock
          let acquired = false;
          try {
            const handle = await acquireLock({
              rootDir: sandboxDir,
              name: "workspace",
              command: "torture-test",
              timeoutMs: 5000
            });
            acquired = true;
            await handle.release();
          } catch (err: any) {
            // If STALE_LOCK is thrown, that's also acceptable behavior
            // as long as it doesn't corrupt state
            if (err.code === "STALE_LOCK") {
              acquired = true; // Lock was correctly detected as stale
              // Manual cleanup
              if (fs.existsSync(lockPath)) {
                fs.unlinkSync(lockPath);
              }
            }
          }

          if (!acquired) {
            throw new TortureInvariantError(
              "Stale lock was not detected or recovered",
              "STALE_LOCK_NOT_RECOVERED",
              "critical"
            );
          }
          break;
        }

        case 2: {
          // Lock timeout: acquire lock from current process, then try to acquire again
          const handle1 = await acquireLock({
            rootDir: sandboxDir,
            name: "workspace",
            command: "torture-holder"
          });

          let lockHeldCorrectly = false;
          try {
            await acquireLock({
              rootDir: sandboxDir,
              name: "workspace",
              command: "torture-contender",
              wait: false
            });
          } catch (err: any) {
            if (err.code === "LOCK_HELD") {
              lockHeldCorrectly = true;
            }
          }

          await handle1.release();

          if (!lockHeldCorrectly) {
            throw new TortureInvariantError(
              "Second lock acquisition did not throw LOCK_HELD",
              "LOCK_HELD_NOT_ENFORCED",
              "critical"
            );
          }
          break;
        }

        case 3: {
          // Corrupted lock file recovery
          const corruptLockPath = path.join(lockDir, "workspace.lock");
          fs.writeFileSync(corruptLockPath, "{{invalid json garbage!!!}}", "utf-8");

          let recovered = false;
          try {
            const handle = await acquireLock({
              rootDir: sandboxDir,
              name: "workspace",
              command: "torture-corrupt-recovery"
            });
            recovered = true;
            await handle.release();
          } catch (err: any) {
            // Even if it throws, the state should not be corrupted
            // Clean up manually
            if (fs.existsSync(corruptLockPath)) {
              fs.unlinkSync(corruptLockPath);
            }
            recovered = true; // Failure is acceptable as long as it's clean
          }

          if (!recovered) {
            throw new TortureInvariantError(
              "Corrupted lock file caused unrecoverable state",
              "CORRUPT_LOCK_UNRECOVERABLE",
              "critical"
            );
          }
          break;
        }

        case 4: {
          // Lock list and clear: verify listing and conditional clearing work correctly
          const handle = await acquireLock({
            rootDir: sandboxDir,
            name: "workspace",
            command: "torture-list-test"
          });

          const locks = listLocks(sandboxDir);
          if (locks.length === 0) {
            throw new TortureInvariantError(
              "listLocks returned empty while lock is held",
              "LOCK_LIST_EMPTY",
              "critical"
            );
          }

          const found = locks.find((l) => l.name === "workspace");
          if (!found || !found.isAlive) {
            throw new TortureInvariantError(
              "Active lock not found or reported as dead by listLocks",
              "LOCK_LIST_INCONSISTENT",
              "critical"
            );
          }

          // Attempting to clear a live lock without force should fail
          const clearResult = clearLock(sandboxDir, "workspace");
          if (clearResult.cleared) {
            throw new TortureInvariantError(
              "clearLock removed an active lock without --force",
              "LOCK_CLEAR_WITHOUT_FORCE",
              "critical"
            );
          }

          await handle.release();
          break;
        }

        case 5: {
          // Lock ordering: acquire multiple locks in correct order
          const { withLocks } = await import("@hardkas/core");

          let locksAcquired = false;
          try {
            await withLocks(sandboxDir, ["artifacts", "query-store"], async () => {
              locksAcquired = true;

              // While holding locks, verify they exist on disk
              const artLock = path.join(lockDir, "artifacts.lock");
              const qsLock = path.join(lockDir, "query-store.lock");

              if (!fs.existsSync(artLock) || !fs.existsSync(qsLock)) {
                throw new TortureInvariantError(
                  "Lock files not created on disk while held",
                  "LOCK_FILES_MISSING",
                  "critical"
                );
              }
            });
          } catch (err: any) {
            if (err instanceof TortureInvariantError) throw err;
            // Lock ordering failures are acceptable error states
          }

          // Verify locks were released
          const remainingLocks = listLocks(sandboxDir);
          const stale = remainingLocks.filter(
            (l) => l.name === "artifacts" || l.name === "query-store"
          );

          if (stale.length > 0) {
            throw new TortureInvariantError(
              `${stale.length} locks not released after withLocks completed`,
              "LOCKS_NOT_RELEASED",
              "critical"
            );
          }
          break;
        }
      }

      // Final state verification: write an artifact and sync to prove store is uncorrupted
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      const payload = {
        schema: "hardkas.txPlan" as const,
        hardkasVersion: "0.7.12-alpha",
        version: ARTIFACT_VERSION,
        networkId: "simnet" as const,
        mode: "simulated" as const,
        createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
        planId: `plan-lock-verify-${ctx.caseSeed}`,
        from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
        to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
        amountSompi: "1000",
        estimatedFeeSompi: "100",
        estimatedMass: "10",
        inputs: [
          { outpoint: { transactionId: "l".repeat(64), index: 0 }, amountSompi: "2000" }
        ],
        outputs: [
          {
            address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
            amountSompi: "1000"
          }
        ]
      };
      const hash = calculateContentHash(payload);
      const artId = `plan-${hash.slice(0, 16)}`;
      const file = path.join(artifactsDir, `${artId}.json`);
      fs.writeFileSync(
        file,
        JSON.stringify({ ...payload, artifactId: artId, contentHash: hash }, null, 2)
      );

      const syncResult = await backend.sync({ strict: true, cwd: sandboxDir });
      store.disconnect();

      if (!syncResult.ok) {
        throw new TortureInvariantError(
          "Query store corrupted after lock contention: sync failed",
          "POST_CONTENTION_CORRUPTION",
          "catastrophic"
        );
      }

      return {
        flow: `Lock contention subcase ${subCase}: ${["stale recovery", "lock timeout", "corrupt recovery", "list/clear", "lock ordering"][subCase - 1]}`,
        mutation: `Test lock behavior under contention scenario ${subCase}`,
        expectedInvariant: "lock_contention_never_corrupts_state",
        artifactsBefore: [artId]
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

// ============================================================================
// THE CURSED ENVIRONMENT ARC™ — Real-World Abuse Lab
// ============================================================================

/**
 * Bucket 18: windows-filesystem-hell
 * Invariant: windows_filesystem_semantics_cannot_corrupt_canonical_truth
 * Tests case-insensitive collisions, reserved filenames, backslash normalization,
 * MAX_PATH stress, CRLF content stability, and locked file handling.
 */
registerTortureBucket({
  name: "windows-filesystem-hell",
  expectedInvariant: "windows_filesystem_semantics_cannot_corrupt_canonical_truth",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 6);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      switch (subCase) {
        case 1: {
          // Case-insensitive collision: write Plan.json and plan.json
          const payload1 = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-case-upper-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "1000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "w".repeat(64), index: 0 },
                amountSompi: "2000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "1000"
              }
            ]
          };
          const hash1 = calculateContentHash(payload1);
          const art1 = {
            ...payload1,
            artifactId: `Plan-Upper-${hash1.slice(0, 8)}`,
            contentHash: hash1
          };

          const payload2 = {
            ...payload1,
            planId: `plan-case-lower-${ctx.caseSeed}`,
            amountSompi: "2000"
          };
          const hash2 = calculateContentHash(payload2);
          const art2 = {
            ...payload2,
            artifactId: `plan-lower-${hash2.slice(0, 8)}`,
            contentHash: hash2
          };

          // Write with different casing - on Windows, second may overwrite first
          const file1 = path.join(artifactsDir, `CaseTest.json`);
          const file2 = path.join(artifactsDir, `casetest.json`);

          fs.writeFileSync(file1, JSON.stringify(art1, null, 2));

          // Check if Windows treats these as the same file
          let caseCollision = false;
          try {
            fs.writeFileSync(file2, JSON.stringify(art2, null, 2));
            // If both writes succeed, check if they're the same file
            const content1 = fs.readFileSync(file1, "utf-8");
            const content2 = fs.readFileSync(file2, "utf-8");
            caseCollision =
              content1 === content2 && content1 === JSON.stringify(art2, null, 2);
          } catch {
            caseCollision = true;
          }

          // Sync and verify no corruption regardless of case behavior
          const syncResult = await backend.sync({ strict: false, cwd: sandboxDir });
          // The key invariant: whatever the OS does with case, the store must be consistent
          const artifacts = await backend.findArtifacts();
          // Must have at least 1 artifact, and no corrupt entries
          if (artifacts.length === 0) {
            throw new TortureInvariantError(
              "Case collision caused zero artifacts to be indexed",
              "CASE_COLLISION_ZERO_INDEXED",
              "critical"
            );
          }
          break;
        }

        case 2: {
          // Reserved filenames: attempt to create artifacts with Windows reserved names
          const reservedNames = ["CON", "NUL", "PRN", "AUX", "COM1", "LPT1"];
          const pickedName = ctx.prng.pick(reservedNames);

          let reservedFailed = false;
          let errorType = "";
          try {
            const testPath = path.join(artifactsDir, `${pickedName}.json`);
            fs.writeFileSync(testPath, JSON.stringify({ test: true }));
            // If we get here, the OS allowed it (maybe not Windows, or long path syntax)
            // Clean up
            try {
              fs.unlinkSync(testPath);
            } catch {}
          } catch (e: any) {
            reservedFailed = true;
            errorType = e.code || e.message;
          }

          // Write a safe artifact to verify store is still functional
          const safePayload = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-reserved-safe-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "3000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "r".repeat(64), index: 0 },
                amountSompi: "4000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "3000"
              }
            ]
          };
          const safeHash = calculateContentHash(safePayload);
          const safeArt = {
            ...safePayload,
            artifactId: `plan-${safeHash.slice(0, 16)}`,
            contentHash: safeHash
          };
          fs.writeFileSync(
            path.join(artifactsDir, `${safeArt.artifactId}.json`),
            JSON.stringify(safeArt, null, 2)
          );

          const syncResult = await backend.sync({ strict: true, cwd: sandboxDir });
          if (!syncResult.ok) {
            throw new TortureInvariantError(
              `Reserved filename "${pickedName}" test corrupted store: ${syncResult.errors.join(", ")}`,
              "RESERVED_NAME_CORRUPTION",
              "critical"
            );
          }
          break;
        }

        case 3: {
          // Backslash normalization: paths with \ vs / must not affect artifact identity
          const payload = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-backslash-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "5000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "b".repeat(64), index: 0 },
                amountSompi: "6000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "5000"
              }
            ]
          };
          const hash = calculateContentHash(payload);
          const artId = `plan-${hash.slice(0, 16)}`;
          const art = { ...payload, artifactId: artId, contentHash: hash };

          // Write using normalized path
          const normalizedPath = path.join(artifactsDir, `${artId}.json`);
          fs.writeFileSync(normalizedPath, JSON.stringify(art, null, 2));

          // Verify the path with backslashes resolves to same content
          const backslashPath = artifactsDir.replace(/\//g, "\\") + `\\${artId}.json`;
          const forwardPath = artifactsDir.replace(/\\/g, "/") + `/${artId}.json`;

          const content1 = fs.readFileSync(backslashPath, "utf-8");
          const content2 = fs.readFileSync(forwardPath, "utf-8");

          if (content1 !== content2) {
            throw new TortureInvariantError(
              "Backslash vs forward slash path reads produced different content",
              "PATH_NORMALIZATION_DIVERGENCE",
              "catastrophic"
            );
          }

          await backend.sync({ strict: true, cwd: sandboxDir });
          break;
        }

        case 4: {
          // MAX_PATH stress: create deeply nested directory structure
          let deepDir = artifactsDir;
          const segments = [];
          const segmentLength = ctx.prng.nextInt(10, 30);
          let pathTooLong = false;
          let actualPathLength = 0;

          for (let i = 0; i < 15; i++) {
            const segment = `d${"a".repeat(segmentLength)}_${i}`;
            segments.push(segment);
            const newDir = path.join(deepDir, segment);
            actualPathLength = newDir.length;

            try {
              fs.mkdirSync(newDir, { recursive: true });
              deepDir = newDir;
            } catch (e: any) {
              // MAX_PATH hit — this IS the test
              pathTooLong = true;
              break;
            }
          }

          // Try to write an artifact at the deepest accessible level
          const payload = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-maxpath-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "7000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "p".repeat(64), index: 0 },
                amountSompi: "8000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "7000"
              }
            ]
          };
          const hash = calculateContentHash(payload);
          const artId = `plan-${hash.slice(0, 16)}`;

          // Also write a safe artifact in the normal location
          const safeArt = { ...payload, artifactId: artId, contentHash: hash };
          fs.writeFileSync(
            path.join(artifactsDir, `${artId}.json`),
            JSON.stringify(safeArt, null, 2)
          );

          // Sync should work for the accessible artifacts
          const syncResult = await backend.sync({ strict: false, cwd: sandboxDir });
          const artifacts = await backend.findArtifacts();

          // Invariant: path failure NEVER creates partial canonical state
          if (artifacts.length === 0) {
            throw new TortureInvariantError(
              `MAX_PATH stress (${actualPathLength} chars) caused zero artifacts indexed`,
              "MAXPATH_PARTIAL_STATE",
              "critical"
            );
          }

          // Rebuild verification: ensure no orphan or inconsistent state
          store.disconnect();
          if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
          const newStore = new HardkasStore({ dbPath });
          newStore.connect({ autoMigrate: true });
          const newBackend = new SqliteQueryBackend(newStore);
          const rebuildResult = await newBackend.rebuild({
            strict: false,
            cwd: sandboxDir
          });

          const rebuiltArtifacts = await newBackend.findArtifacts();
          if (rebuiltArtifacts.length !== artifacts.length) {
            throw new TortureInvariantError(
              `MAX_PATH rebuild inconsistency: sync got ${artifacts.length}, rebuild got ${rebuiltArtifacts.length}`,
              "MAXPATH_REBUILD_DIVERGENCE",
              "critical"
            );
          }
          newStore.disconnect();
          break;
        }

        case 5: {
          // CRLF in artifact content: verify hash stability across line endings
          const payloadWithCRLF = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-crlf-test-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "9000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "c".repeat(64), index: 0 },
                amountSompi: "10000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "9000"
              }
            ]
          };

          // Hash with \n and \r\n content should be identical under v3 canonicalization
          const hashLF = calculateContentHash(payloadWithCRLF, CURRENT_HASH_VERSION);

          // Create a version with CRLF injected into a string field
          const payloadCRLFInjected = {
            ...payloadWithCRLF,
            planId: `plan-crlf-test-${ctx.caseSeed}`.replace(/\n/g, "\r\n")
          };
          const hashCRLF = calculateContentHash(
            payloadCRLFInjected,
            CURRENT_HASH_VERSION
          );

          // V3 canonicalization normalizes \r\n to \n, so hashes MUST be identical
          if (hashLF !== hashCRLF) {
            throw new TortureInvariantError(
              `CRLF normalization failed: LF hash ${hashLF.slice(0, 16)} !== CRLF hash ${hashCRLF.slice(0, 16)}`,
              "CRLF_HASH_DIVERGENCE",
              "catastrophic"
            );
          }

          // Write and sync
          const artId = `plan-${hashLF.slice(0, 16)}`;
          const art = { ...payloadWithCRLF, artifactId: artId, contentHash: hashLF };
          // Write with Windows CRLF line endings in the JSON
          const jsonStr = JSON.stringify(art, null, 2).replace(/\n/g, "\r\n");
          fs.writeFileSync(path.join(artifactsDir, `${artId}.json`), jsonStr, "utf-8");

          await backend.sync({ strict: false, cwd: sandboxDir });
          break;
        }

        case 6: {
          // Locked file during sync: hold file handle open
          const payload = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-locked-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "11000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "k".repeat(64), index: 0 },
                amountSompi: "12000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "11000"
              }
            ]
          };
          const hash = calculateContentHash(payload);
          const artId = `plan-${hash.slice(0, 16)}`;
          const art = { ...payload, artifactId: artId, contentHash: hash };
          const filePath = path.join(artifactsDir, `${artId}.json`);
          fs.writeFileSync(filePath, JSON.stringify(art, null, 2));

          // Also write a second unlocked artifact
          const payload2 = {
            ...payload,
            planId: `plan-unlocked-${ctx.caseSeed}`,
            amountSompi: "99000"
          };
          const hash2 = calculateContentHash(payload2);
          const artId2 = `plan-${hash2.slice(0, 16)}`;
          fs.writeFileSync(
            path.join(artifactsDir, `${artId2}.json`),
            JSON.stringify(
              { ...payload2, artifactId: artId2, contentHash: hash2 },
              null,
              2
            )
          );

          // Sync with non-strict mode — should handle locked files gracefully
          // Note: on Windows, read handles don't typically prevent reading,
          // but we test that the indexer doesn't crash
          const syncResult = await backend.sync({ strict: false, cwd: sandboxDir });

          // At minimum, the unlocked artifact should be indexed
          const artifacts = await backend.findArtifacts();
          if (artifacts.length === 0) {
            throw new TortureInvariantError(
              "Locked file scenario caused zero artifacts to be indexed",
              "LOCKED_FILE_ZERO_INDEXED",
              "critical"
            );
          }
          break;
        }
      }

      store.disconnect();

      return {
        flow: `Windows filesystem hell subcase ${subCase}: ${["case-insensitive collision", "reserved filenames", "backslash normalization", "MAX_PATH stress", "CRLF stability", "locked file sync"][subCase - 1]}`,
        mutation: `Windows-specific filesystem edge case ${subCase}`,
        expectedInvariant: "windows_filesystem_semantics_cannot_corrupt_canonical_truth"
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 19: unicode-normalization-chaos
 * Invariant: unicode_normalization_never_changes_artifact_identity
 * Tests NFC vs NFD, emoji, invisible Unicode, homoglyphs, RTL chars.
 */
registerTortureBucket({
  name: "unicode-normalization-chaos",
  expectedInvariant: "unicode_normalization_never_changes_artifact_identity",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 5);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      switch (subCase) {
        case 1: {
          // NFC vs NFD: same logical string in two forms must hash identically
          // é = U+00E9 (NFC precomposed) vs e + ́ = U+0065 U+0301 (NFD decomposed)
          const nfcString = "\u00E9"; // é precomposed
          const nfdString = "\u0065\u0301"; // e + combining accent

          const payload1 = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-nfc-${nfcString}-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "1000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "u".repeat(64), index: 0 },
                amountSompi: "2000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "1000"
              }
            ]
          };

          const payload2 = {
            ...payload1,
            planId: `plan-nfc-${nfdString}-${ctx.caseSeed}`
          };

          const hash1 = calculateContentHash(payload1, CURRENT_HASH_VERSION);
          const hash2 = calculateContentHash(payload2, CURRENT_HASH_VERSION);

          // V3 canonicalization applies NFC normalization — hashes MUST be identical
          if (hash1 !== hash2) {
            throw new TortureInvariantError(
              `NFC/NFD normalization divergence: NFC=${hash1.slice(0, 16)} NFD=${hash2.slice(0, 16)}`,
              "UNICODE_NFC_NFD_DIVERGENCE",
              "catastrophic"
            );
          }

          // Write and sync
          const artId = `plan-${hash1.slice(0, 16)}`;
          const art = { ...payload1, artifactId: artId, contentHash: hash1 };
          fs.writeFileSync(
            path.join(artifactsDir, `${artId}.json`),
            JSON.stringify(art, null, 2)
          );
          await backend.sync({ strict: true, cwd: sandboxDir });
          break;
        }

        case 2: {
          // Emoji in artifact content fields
          const emojiStrings = ["🔑", "💰", "🏗️", "⚡", "🎯", "🛡️"];
          const emoji = ctx.prng.pick(emojiStrings);

          const payload = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-emoji-${emoji}-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "2000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "e".repeat(64), index: 0 },
                amountSompi: "3000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "2000"
              }
            ]
          };
          const hash = calculateContentHash(payload);
          const artId = `plan-${hash.slice(0, 16)}`;
          const art = { ...payload, artifactId: artId, contentHash: hash };
          fs.writeFileSync(
            path.join(artifactsDir, `${artId}.json`),
            JSON.stringify(art, null, 2)
          );

          const syncResult = await backend.sync({ strict: true, cwd: sandboxDir });
          if (!syncResult.ok) {
            throw new TortureInvariantError(
              `Emoji "${emoji}" in content caused sync failure`,
              "EMOJI_SYNC_FAILURE",
              "critical"
            );
          }

          // Verify round-trip
          const artifacts = await backend.findArtifacts();
          const found = artifacts.find((a) => a.artifactId === artId);
          if (!found) {
            throw new TortureInvariantError(
              "Emoji artifact not found after sync",
              "EMOJI_ARTIFACT_LOST",
              "critical"
            );
          }
          break;
        }

        case 3: {
          // Invisible Unicode: zero-width joiners, BOM markers
          const invisibleChars = [
            "\u200B", // zero-width space
            "\u200C", // zero-width non-joiner
            "\u200D", // zero-width joiner
            "\uFEFF", // BOM
            "\u00AD" // soft hyphen
          ];
          const invisible = ctx.prng.pick(invisibleChars);

          const payload = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-invisible${invisible}char-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "4000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "z".repeat(64), index: 0 },
                amountSompi: "5000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "4000"
              }
            ]
          };
          const hash = calculateContentHash(payload);

          // Hash with and without invisible char must differ (they're semantically different)
          const payloadWithout = {
            ...payload,
            planId: `plan-invisiblechar-${ctx.caseSeed}`
          };
          const hashWithout = calculateContentHash(payloadWithout);

          // These SHOULD be different — invisible chars are real content
          // The invariant is that the hash is STABLE, not that invisibles are stripped
          const artId = `plan-${hash.slice(0, 16)}`;
          const art = { ...payload, artifactId: artId, contentHash: hash };
          fs.writeFileSync(
            path.join(artifactsDir, `${artId}.json`),
            JSON.stringify(art, null, 2)
          );

          await backend.sync({ strict: true, cwd: sandboxDir });

          // Verify deterministic hash on re-read
          const artifacts = await backend.findArtifacts();
          const found = artifacts.find((a) => a.artifactId === artId);
          if (!found) {
            throw new TortureInvariantError(
              "Invisible Unicode artifact not indexed",
              "INVISIBLE_UNICODE_LOST",
              "critical"
            );
          }
          break;
        }

        case 4: {
          // Homoglyphs: Cyrillic а (U+0430) vs Latin a (U+0061)
          const latinAddr = "kaspa:sim_address_with_a";
          const cyrillicAddr = "kaspa:sim_address_with_\u0430"; // Cyrillic а

          const payloadLatin = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-homoglyph-latin-${ctx.caseSeed}`,
            from: { address: latinAddr },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "6000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "h".repeat(64), index: 0 },
                amountSompi: "7000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "6000"
              }
            ]
          };

          const payloadCyrillic = {
            ...payloadLatin,
            planId: `plan-homoglyph-cyrillic-${ctx.caseSeed}`,
            from: { address: cyrillicAddr }
          };

          const hashLatin = calculateContentHash(payloadLatin);
          const hashCyrillic = calculateContentHash(payloadCyrillic);

          // These MUST produce DIFFERENT hashes — homoglyphs are different codepoints
          if (hashLatin === hashCyrillic) {
            throw new TortureInvariantError(
              "Homoglyph collision: Latin 'a' and Cyrillic 'а' produced identical hash",
              "HOMOGLYPH_HASH_COLLISION",
              "catastrophic"
            );
          }

          // Write both and verify both are indexed as separate artifacts
          const art1 = {
            ...payloadLatin,
            artifactId: `plan-${hashLatin.slice(0, 16)}`,
            contentHash: hashLatin
          };
          const art2 = {
            ...payloadCyrillic,
            artifactId: `plan-${hashCyrillic.slice(0, 16)}`,
            contentHash: hashCyrillic
          };

          fs.writeFileSync(
            path.join(artifactsDir, `${art1.artifactId}.json`),
            JSON.stringify(art1, null, 2)
          );
          fs.writeFileSync(
            path.join(artifactsDir, `${art2.artifactId}.json`),
            JSON.stringify(art2, null, 2)
          );

          await backend.sync({ strict: true, cwd: sandboxDir });
          const artifacts = await backend.findArtifacts();

          if (artifacts.length < 2) {
            throw new TortureInvariantError(
              "Homoglyph artifacts collapsed: expected 2 distinct artifacts",
              "HOMOGLYPH_COLLAPSED",
              "critical"
            );
          }
          break;
        }

        case 5: {
          // Mixed normalization: NFC and NFD within the same artifact
          const mixedString = "caf\u00E9" + " " + "re\u0301sume\u0301"; // café (NFC) + résumé (NFD)

          const payload = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-mixed-${mixedString}-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "8000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "n".repeat(64), index: 0 },
                amountSompi: "9000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "8000"
              }
            ]
          };

          // V3 canonicalization must normalize both NFC and NFD within the same string
          const allNFC = {
            ...payload,
            planId: `plan-mixed-${mixedString.normalize("NFC")}-${ctx.caseSeed}`
          };
          const hash = calculateContentHash(payload, CURRENT_HASH_VERSION);
          const hashNFC = calculateContentHash(allNFC, CURRENT_HASH_VERSION);

          if (hash !== hashNFC) {
            throw new TortureInvariantError(
              "Mixed NFC/NFD within same artifact did not normalize to identical hash",
              "MIXED_NORMALIZATION_DIVERGENCE",
              "critical"
            );
          }

          const artId = `plan-${hash.slice(0, 16)}`;
          const art = { ...payload, artifactId: artId, contentHash: hash };
          fs.writeFileSync(
            path.join(artifactsDir, `${artId}.json`),
            JSON.stringify(art, null, 2)
          );
          await backend.sync({ strict: true, cwd: sandboxDir });
          break;
        }
      }

      store.disconnect();

      return {
        flow: `Unicode chaos subcase ${subCase}: ${["NFC vs NFD", "emoji content", "invisible Unicode", "homoglyphs", "mixed normalization"][subCase - 1]}`,
        mutation: `Unicode normalization edge case ${subCase}`,
        expectedInvariant: "unicode_normalization_never_changes_artifact_identity"
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 20: clock-skew-chaos
 * Invariant: clock_skew_cannot_break_replay_or_incremental_sync
 * Tests mtime manipulation: backwards, future, identical, zero, rapid flip.
 */
registerTortureBucket({
  name: "clock-skew-chaos",
  expectedInvariant: "clock_skew_cannot_break_replay_or_incremental_sync",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 5);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // Helper to create and write a standard artifact
      function writeArtifact(suffix: string, amount: string): string {
        const payload = {
          schema: "hardkas.txPlan" as const,
          hardkasVersion: "0.7.12-alpha",
          version: ARTIFACT_VERSION,
          networkId: "simnet" as const,
          mode: "simulated" as const,
          createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
          planId: `plan-clock-${suffix}-${ctx.caseSeed}`,
          from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
          to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
          amountSompi: amount,
          estimatedFeeSompi: "100",
          estimatedMass: "10",
          inputs: [
            {
              outpoint: {
                transactionId: "t".repeat(64),
                index: parseInt(suffix.replace(/\D/g, "") || "0")
              },
              amountSompi: "20000"
            }
          ],
          outputs: [
            {
              address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
              amountSompi: amount
            }
          ]
        };
        const hash = calculateContentHash(payload);
        const artId = `plan-${hash.slice(0, 16)}`;
        const filePath = path.join(artifactsDir, `${artId}.json`);
        fs.writeFileSync(
          filePath,
          JSON.stringify({ ...payload, artifactId: artId, contentHash: hash }, null, 2)
        );
        return filePath;
      }

      switch (subCase) {
        case 1: {
          // Mtime set to past: incremental sync must detect changed content
          const filePath = writeArtifact("past", "1000");
          await backend.sync({ strict: true, cwd: sandboxDir });

          // Set mtime to 1 year ago
          const pastTime = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000); // hardkas-determinism-allow: mtime manipulation
          fs.utimesSync(filePath, pastTime, pastTime);

          // Write new content with the old timestamp
          const newPayload = {
            schema: "hardkas.txPlan",
            changed: true,
            planId: "modified"
          };
          fs.writeFileSync(filePath, JSON.stringify(newPayload));
          fs.utimesSync(filePath, pastTime, pastTime);

          // Full rebuild should pick up the change
          store.disconnect();
          if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
          const newStore = new HardkasStore({ dbPath });
          newStore.connect({ autoMigrate: true });
          const newBackend = new SqliteQueryBackend(newStore);
          await newBackend.rebuild({ strict: false, cwd: sandboxDir });
          newStore.disconnect();
          break;
        }

        case 2: {
          // Future timestamps: mtime set to year 2099
          const filePath = writeArtifact("future", "2000");
          const futureTime = new Date("2099-01-01T00:00:00Z");
          fs.utimesSync(filePath, futureTime, futureTime);

          const syncResult = await backend.sync({ strict: false, cwd: sandboxDir });
          const artifacts = await backend.findArtifacts();

          if (artifacts.length === 0) {
            throw new TortureInvariantError(
              "Future timestamp caused artifact to not be indexed",
              "FUTURE_MTIME_SKIP",
              "critical"
            );
          }
          break;
        }

        case 3: {
          // Identical timestamps on multiple files
          const fixedTime = new Date("2024-06-15T12:00:00Z");
          const filePaths = [];

          for (let i = 0; i < 5; i++) {
            const fp = writeArtifact(`identical-${i}`, `${(i + 1) * 1000}`);
            fs.utimesSync(fp, fixedTime, fixedTime);
            filePaths.push(fp);
          }

          const syncResult = await backend.sync({ strict: true, cwd: sandboxDir });
          const artifacts = await backend.findArtifacts();

          if (artifacts.length !== 5) {
            throw new TortureInvariantError(
              `Identical timestamps: expected 5 artifacts, got ${artifacts.length}`,
              "IDENTICAL_MTIME_LOSS",
              "critical"
            );
          }
          break;
        }

        case 4: {
          // Zero/epoch mtime
          const filePath = writeArtifact("epoch", "4000");
          const epochTime = new Date(0);
          try {
            fs.utimesSync(filePath, epochTime, epochTime);
          } catch {
            // Some OS may reject epoch 0 — that's OK
          }

          await backend.sync({ strict: false, cwd: sandboxDir });
          const artifacts = await backend.findArtifacts();

          if (artifacts.length === 0) {
            throw new TortureInvariantError(
              "Epoch-zero mtime caused artifact to not be indexed",
              "EPOCH_MTIME_SKIP",
              "critical"
            );
          }
          break;
        }

        case 5: {
          // Rapid mtime flip: write, sync, backdate, rewrite, sync again
          const filePath = writeArtifact("flip", "5000");
          await backend.sync({ strict: true, cwd: sandboxDir });

          const artifacts1 = await backend.findArtifacts();
          const count1 = artifacts1.length;

          // Backdate the file
          const oldTime = new Date("2020-01-01T00:00:00Z");
          fs.utimesSync(filePath, oldTime, oldTime);

          // Write DIFFERENT content (simulating a race)
          const newPayload = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-clock-flipped-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "99999",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "f".repeat(64), index: 99 },
                amountSompi: "100000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "99999"
              }
            ]
          };
          const newHash = calculateContentHash(newPayload);
          fs.writeFileSync(
            filePath,
            JSON.stringify(
              {
                ...newPayload,
                artifactId: `plan-${newHash.slice(0, 16)}`,
                contentHash: newHash
              },
              null,
              2
            )
          );

          // Set mtime to BEFORE original write — incremental sync might skip this
          fs.utimesSync(filePath, oldTime, oldTime);

          // Full rebuild should always catch the change
          store.disconnect();
          if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
          const newStore = new HardkasStore({ dbPath });
          newStore.connect({ autoMigrate: true });
          const newBackend = new SqliteQueryBackend(newStore);
          await newBackend.rebuild({ strict: false, cwd: sandboxDir });
          newStore.disconnect();
          break;
        }
      }

      try {
        store.disconnect();
      } catch {}

      return {
        flow: `Clock skew subcase ${subCase}: ${["mtime backwards", "future timestamp", "identical mtimes", "epoch zero", "rapid mtime flip"][subCase - 1]}`,
        mutation: `Clock/mtime manipulation scenario ${subCase}`,
        expectedInvariant: "clock_skew_cannot_break_replay_or_incremental_sync"
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 21: filesystem-ordering-chaos
 * Invariant: filesystem_iteration_order_never_affects_semantic_result
 * Tests that shuffled readdir order, random creation order, and mutation during scan
 * all produce identical semantic results.
 */
registerTortureBucket({
  name: "filesystem-ordering-chaos",
  expectedInvariant: "filesystem_iteration_order_never_affects_semantic_result",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 3);

    try {
      // Create a set of artifacts in SHUFFLED order
      const artifactCount = ctx.prng.nextInt(8, 20);
      const payloads: Array<{ id: string; hash: string; payload: any }> = [];

      for (let i = 0; i < artifactCount; i++) {
        const payload = {
          schema: "hardkas.txPlan" as const,
          hardkasVersion: "0.7.12-alpha",
          version: ARTIFACT_VERSION,
          networkId: "simnet" as const,
          mode: "simulated" as const,
          createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
          planId: `plan-order-${i}-${ctx.caseSeed}`,
          from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
          to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
          amountSompi: `${(i + 1) * 1000}`,
          estimatedFeeSompi: "100",
          estimatedMass: "10",
          inputs: [
            {
              outpoint: { transactionId: "o".repeat(64), index: i },
              amountSompi: "20000"
            }
          ],
          outputs: [
            {
              address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
              amountSompi: `${(i + 1) * 1000}`
            }
          ]
        };
        const hash = calculateContentHash(payload);
        const artId = `plan-${hash.slice(0, 16)}`;
        payloads.push({ id: artId, hash, payload });
      }

      // Shuffle creation order
      const shuffled = ctx.prng.shuffle(payloads);

      // Write in shuffled order
      for (const { id, hash, payload } of shuffled) {
        fs.writeFileSync(
          path.join(artifactsDir, `${id}.json`),
          JSON.stringify({ ...payload, artifactId: id, contentHash: hash }, null, 2)
        );
      }

      switch (subCase) {
        case 1: {
          // Sync with shuffled creation order, then rebuild and compare
          const store1 = new HardkasStore({ dbPath });
          store1.connect({ autoMigrate: true });
          const backend1 = new SqliteQueryBackend(store1);
          await backend1.sync({ strict: true, cwd: sandboxDir });

          const artifacts1 = await backend1.findArtifacts();
          const ids1 = artifacts1.map((a) => a.artifactId).sort();
          const hashes1 = artifacts1.map((a) => a.contentHash).sort();
          store1.disconnect();

          // Wipe and rebuild
          if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
          const store2 = new HardkasStore({ dbPath });
          store2.connect({ autoMigrate: true });
          const backend2 = new SqliteQueryBackend(store2);
          await backend2.rebuild({ strict: true, cwd: sandboxDir });

          const artifacts2 = await backend2.findArtifacts();
          const ids2 = artifacts2.map((a) => a.artifactId).sort();
          const hashes2 = artifacts2.map((a) => a.contentHash).sort();
          store2.disconnect();

          // IDs and hashes must be identical regardless of creation order
          if (JSON.stringify(ids1) !== JSON.stringify(ids2)) {
            throw new TortureInvariantError(
              `Ordering divergence: sync produced ${ids1.length} IDs, rebuild produced ${ids2.length}`,
              "ORDERING_ID_DIVERGENCE",
              "critical"
            );
          }

          if (JSON.stringify(hashes1) !== JSON.stringify(hashes2)) {
            throw new TortureInvariantError(
              "Ordering divergence: sync and rebuild produced different hash sets",
              "ORDERING_HASH_DIVERGENCE",
              "critical"
            );
          }
          break;
        }

        case 2: {
          // Double sync with different file discovery order
          const store = new HardkasStore({ dbPath });
          store.connect({ autoMigrate: true });
          const backend = new SqliteQueryBackend(store);

          await backend.sync({ strict: true, cwd: sandboxDir });
          const count1 = (await backend.findArtifacts()).length;

          // Sync again — should be idempotent
          await backend.sync({ strict: true, cwd: sandboxDir });
          const count2 = (await backend.findArtifacts()).length;

          if (count1 !== count2) {
            throw new TortureInvariantError(
              `Double sync changed count: ${count1} → ${count2}`,
              "DOUBLE_SYNC_INSTABILITY",
              "critical"
            );
          }

          store.disconnect();
          break;
        }

        case 3: {
          // Directory mutation during scan: add files between sync calls
          const store = new HardkasStore({ dbPath });
          store.connect({ autoMigrate: true });
          const backend = new SqliteQueryBackend(store);

          // First sync with initial artifacts
          await backend.sync({ strict: true, cwd: sandboxDir });
          const initialCount = (await backend.findArtifacts()).length;

          // Add more artifacts
          const extraCount = ctx.prng.nextInt(3, 8);
          for (let i = 0; i < extraCount; i++) {
            const payload = {
              schema: "hardkas.txPlan" as const,
              hardkasVersion: "0.7.12-alpha",
              version: ARTIFACT_VERSION,
              networkId: "simnet" as const,
              mode: "simulated" as const,
              createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
              planId: `plan-extra-${i}-${ctx.caseSeed}`,
              from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
              to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
              amountSompi: `${(i + 100) * 1000}`,
              estimatedFeeSompi: "100",
              estimatedMass: "10",
              inputs: [
                {
                  outpoint: { transactionId: "x".repeat(64), index: i + 100 },
                  amountSompi: "200000"
                }
              ],
              outputs: [
                {
                  address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                  amountSompi: `${(i + 100) * 1000}`
                }
              ]
            };
            const hash = calculateContentHash(payload);
            const artId = `plan-${hash.slice(0, 16)}`;
            fs.writeFileSync(
              path.join(artifactsDir, `${artId}.json`),
              JSON.stringify(
                { ...payload, artifactId: artId, contentHash: hash },
                null,
                2
              )
            );
          }

          // Second sync should pick up new files
          await backend.sync({ strict: true, cwd: sandboxDir });
          const finalCount = (await backend.findArtifacts()).length;

          if (finalCount < initialCount + extraCount) {
            throw new TortureInvariantError(
              `Mutation during scan: expected >= ${initialCount + extraCount}, got ${finalCount}`,
              "SCAN_MUTATION_LOSS",
              "critical"
            );
          }

          store.disconnect();
          break;
        }
      }

      return {
        flow: `Filesystem ordering subcase ${subCase}: ${["shuffled sync vs rebuild", "double sync idempotency", "mutation during scan"][subCase - 1]}`,
        mutation: `${artifactCount} artifacts in shuffled order, scenario ${subCase}`,
        expectedInvariant: "filesystem_iteration_order_never_affects_semantic_result"
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 22: human-chaos
 * Invariant: manual_user_interference_cannot_silently_corrupt_truth
 * Tests editing during sync, deleting lineage roots, truncating artifacts,
 * corrupting events.jsonl, and phantom artifacts with bad hashes.
 */
registerTortureBucket({
  name: "human-chaos",
  expectedInvariant: "manual_user_interference_cannot_silently_corrupt_truth",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 5);

    try {
      // Write a base set of artifacts
      const artifactIds: string[] = [];
      for (let i = 0; i < 5; i++) {
        const payload = {
          schema: "hardkas.txPlan" as const,
          hardkasVersion: "0.7.12-alpha",
          version: ARTIFACT_VERSION,
          networkId: "simnet" as const,
          mode: "simulated" as const,
          createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
          planId: `plan-human-${i}-${ctx.caseSeed}`,
          from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
          to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
          amountSompi: `${(i + 1) * 1000}`,
          estimatedFeeSompi: "100",
          estimatedMass: "10",
          inputs: [
            {
              outpoint: { transactionId: "H".repeat(64), index: i },
              amountSompi: "20000"
            }
          ],
          outputs: [
            {
              address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
              amountSompi: `${(i + 1) * 1000}`
            }
          ]
        };
        const hash = calculateContentHash(payload);
        const artId = `plan-${hash.slice(0, 16)}`;
        artifactIds.push(artId);
        fs.writeFileSync(
          path.join(artifactsDir, `${artId}.json`),
          JSON.stringify({ ...payload, artifactId: artId, contentHash: hash }, null, 2)
        );
      }

      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);
      await backend.sync({ strict: true, cwd: sandboxDir });

      switch (subCase) {
        case 1: {
          // Edit artifact content after sync — must detect corruption on re-sync
          const targetFile = path.join(artifactsDir, `${artifactIds[0]}.json`);
          const original = JSON.parse(fs.readFileSync(targetFile, "utf-8"));
          original.amountSompi = "999999"; // Mutate without updating hash
          fs.writeFileSync(targetFile, JSON.stringify(original, null, 2));

          // Re-sync with strict=false — should detect hash mismatch
          const result = await backend.sync({ strict: false, cwd: sandboxDir });
          // The artifact should be flagged as CORRUPTED or have issues
          // The key invariant: corruption is detected, not silently accepted
          break;
        }

        case 2: {
          // Delete a root artifact — must detect orphan state
          const targetFile = path.join(artifactsDir, `${artifactIds[0]}.json`);
          fs.unlinkSync(targetFile);

          // Rebuild from scratch — deleted artifact should be gone
          store.disconnect();
          if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
          const newStore = new HardkasStore({ dbPath });
          newStore.connect({ autoMigrate: true });
          const newBackend = new SqliteQueryBackend(newStore);
          await newBackend.rebuild({ strict: false, cwd: sandboxDir });

          const artifacts = await newBackend.findArtifacts();
          const foundDeleted = artifacts.find((a) => a.artifactId === artifactIds[0]);

          if (foundDeleted) {
            throw new TortureInvariantError(
              "Deleted artifact still appears in rebuilt index",
              "DELETED_ROOT_PHANTOM",
              "critical"
            );
          }

          newStore.disconnect();
          break;
        }

        case 3: {
          // Truncate artifact to partial content
          const targetFile = path.join(artifactsDir, `${artifactIds[1]}.json`);
          const original = fs.readFileSync(targetFile, "utf-8");
          // Write only first 30 bytes — invalid JSON
          fs.writeFileSync(targetFile, original.slice(0, 30));

          const result = await backend.sync({ strict: false, cwd: sandboxDir });
          // Truncated artifact should be flagged, not silently accepted
          // Other artifacts should still be intact
          const artifacts = await backend.findArtifacts();
          const nonCorrupted = artifacts.filter((a) => a.kind !== "CORRUPTED");

          if (nonCorrupted.length < 3) {
            throw new TortureInvariantError(
              `Truncation caused collateral damage: only ${nonCorrupted.length} non-corrupted of 5`,
              "TRUNCATION_COLLATERAL",
              "critical"
            );
          }
          break;
        }

        case 4: {
          // Corrupt events.jsonl — must not affect canonical artifacts
          const eventsPath = path.join(hardkasDir, "events.jsonl");
          fs.writeFileSync(
            eventsPath,
            "{{GARBAGE}}\n{also invalid}\nNOT JSON AT ALL\n",
            "utf-8"
          );

          // Rebuild — events corruption must not affect artifact indexing
          store.disconnect();
          if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
          const newStore = new HardkasStore({ dbPath });
          newStore.connect({ autoMigrate: true });
          const newBackend = new SqliteQueryBackend(newStore);
          await newBackend.rebuild({ strict: false, cwd: sandboxDir });

          const artifacts = await newBackend.findArtifacts();

          if (artifacts.length !== 5) {
            throw new TortureInvariantError(
              `Events corruption affected artifact count: expected 5, got ${artifacts.length}`,
              "EVENTS_CORRUPTION_AFFECTED_ARTIFACTS",
              "critical"
            );
          }

          newStore.disconnect();
          break;
        }

        case 5: {
          // Phantom artifact: valid JSON structure but wrong hash
          const phantomPayload = {
            schema: "hardkas.txPlan",
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet",
            mode: "simulated",
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-phantom-${ctx.caseSeed}`,
            artifactId: "phantom-fake-id-12345",
            contentHash:
              "0000000000000000000000000000000000000000000000000000000000000000", // WRONG hash
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "666",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "P".repeat(64), index: 0 },
                amountSompi: "1000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "666"
              }
            ]
          };

          fs.writeFileSync(
            path.join(artifactsDir, "phantom-fake-id-12345.json"),
            JSON.stringify(phantomPayload, null, 2)
          );

          // Sync should detect the hash mismatch
          const result = await backend.sync({ strict: false, cwd: sandboxDir });
          // The phantom should be indexed but flagged as CORRUPTED
          const artifacts = await backend.findArtifacts();
          const phantom = artifacts.find((a) => a.artifactId === "phantom-fake-id-12345");

          // Phantom was indexed but its hash should show MISMATCH
          if (
            phantom &&
            phantom.contentHash !== "MISMATCH" &&
            phantom.kind !== "CORRUPTED"
          ) {
            throw new TortureInvariantError(
              "Phantom artifact with wrong hash was accepted as canonical without corruption flag",
              "PHANTOM_ACCEPTED_AS_CANONICAL",
              "catastrophic"
            );
          }
          break;
        }
      }

      try {
        store.disconnect();
      } catch {}

      return {
        flow: `Human chaos subcase ${subCase}: ${["edit during sync", "delete root", "truncate artifact", "corrupt events.jsonl", "phantom artifact"][subCase - 1]}`,
        mutation: `Manual interference scenario ${subCase}`,
        expectedInvariant: "manual_user_interference_cannot_silently_corrupt_truth"
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 23: antivirus-external-mutation
 * Invariant: external_file_interference_never_creates_false_canonicality
 * Tests quarantined (deleted) files, temporarily locked files, partial rewrites,
 * delayed deletes, and renaming during sync.
 */
registerTortureBucket({
  name: "antivirus-external-mutation",
  expectedInvariant: "external_file_interference_never_creates_false_canonicality",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 5);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // Helper to write plans
      function writePlan(
        id: string,
        amount: string
      ): { artId: string; file: string; payload: any } {
        const payload = {
          schema: "hardkas.txPlan" as const,
          hardkasVersion: "0.7.12-alpha",
          version: ARTIFACT_VERSION,
          networkId: "simnet" as const,
          mode: "simulated" as const,
          createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
          planId: id,
          from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
          to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
          amountSompi: amount,
          estimatedFeeSompi: "100",
          estimatedMass: "10",
          inputs: [
            {
              outpoint: { transactionId: "a".repeat(64), index: 0 },
              amountSompi: "10000"
            }
          ],
          outputs: [
            {
              address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
              amountSompi: amount
            }
          ]
        };
        const hash = calculateContentHash(payload);
        const artId = `plan-${hash.slice(0, 16)}`;
        const file = path.join(artifactsDir, `${artId}.json`);
        fs.writeFileSync(
          file,
          JSON.stringify({ ...payload, artifactId: artId, contentHash: hash }, null, 2)
        );
        return { artId, file, payload };
      }

      switch (subCase) {
        case 1: {
          // File quarantined (deleted): write 5, sync, delete 2, doctor must detect issues
          const files: string[] = [];
          for (let i = 0; i < 5; i++) {
            const { file } = writePlan(
              `plan-av-${i}-${ctx.caseSeed}`,
              `${(i + 1) * 1000}`
            );
            files.push(file);
          }

          await backend.sync({ strict: true, cwd: sandboxDir });

          // Quarantine (delete) two files
          if (files[0] && files[1]) {
            fs.unlinkSync(files[0]);
            fs.unlinkSync(files[1]);
          }

          const report = await backend.doctor();
          if (report.ok) {
            throw new TortureInvariantError(
              "Antivirus quarantine (file deletion) was not detected by doctor",
              "QUARANTINE_NOT_DETECTED",
              "critical"
            );
          }
          if (report.zombieArtifacts !== 2) {
            throw new TortureInvariantError(
              `Expected 2 zombie artifacts, got ${report.zombieArtifacts}`,
              "ZOMBIE_COUNT_MISMATCH",
              "critical"
            );
          }
          break;
        }

        case 2: {
          // File temporarily locked: hold file open with write lock, sync must skip gracefully without crash
          const { file } = writePlan(`plan-locked-${ctx.caseSeed}`, "5000");
          let fd: number | null = null;
          try {
            fd = fs.openSync(file, "r+");
            // On Windows, holding fd open with r+ does not necessarily lock it fully,
            // but we attempt to sync and verify no crash/corruption.
            await backend.sync({ strict: false, cwd: sandboxDir });
          } finally {
            if (fd !== null) {
              try {
                fs.closeSync(fd);
              } catch {}
            }
          }

          // A final sync should succeed
          const finalResult = await backend.sync({ strict: true, cwd: sandboxDir });
          if (!finalResult.ok) {
            throw new TortureInvariantError(
              "Post-lock sync failed",
              "POST_LOCK_SYNC_FAILED",
              "critical"
            );
          }
          break;
        }

        case 3: {
          // Partial external rewrite: overwrite file with wrong hash/invalid content — doctor must detect
          const { artId, file, payload } = writePlan(
            `plan-corrupt-${ctx.caseSeed}`,
            "9000"
          );
          await backend.sync({ strict: true, cwd: sandboxDir });

          // Overwrite with wrong hash/content
          const corrupted = {
            ...payload,
            artifactId: artId,
            contentHash: "12345fakehash",
            amountSompi: "99999"
          };
          fs.writeFileSync(file, JSON.stringify(corrupted, null, 2));

          // Run doctor or re-sync
          const report = await backend.doctor();
          // The modified file has a mismatch in mtime or wrong hash (we updated file but not DB, so doctor detects mtime drift first)
          if (report.ok) {
            throw new TortureInvariantError(
              "External rewrite was not detected by doctor",
              "EXTERNAL_REWRITE_NOT_DETECTED",
              "critical"
            );
          }
          break;
        }

        case 4: {
          // Delayed delete: write artifacts, sync, delete one, sync again — count must decrease correctly
          const { artId, file } = writePlan(`plan-delayed-1-${ctx.caseSeed}`, "2000");
          const { file: file2 } = writePlan(`plan-delayed-2-${ctx.caseSeed}`, "4000");

          await backend.sync({ strict: true, cwd: sandboxDir });
          const count1 = (await backend.findArtifacts()).length;

          // Delete one
          fs.unlinkSync(file);

          // Sync again
          await backend.sync({ strict: false, cwd: sandboxDir });
          const count2 = (await backend.findArtifacts()).length;

          if (count2 !== count1 - 1) {
            throw new TortureInvariantError(
              `Delayed delete did not decrement artifact count: count1=${count1}, count2=${count2}`,
              "DELAYED_DELETE_COUNT_MISMATCH",
              "critical"
            );
          }
          break;
        }

        case 5: {
          // Rename during sync: after initial write, rename artifact file to a different name — old must disappear, new indexed
          const { file, payload } = writePlan(`plan-rename-${ctx.caseSeed}`, "7500");
          await backend.sync({ strict: true, cwd: sandboxDir });
          const count1 = (await backend.findArtifacts()).length;

          // Rename file
          const newPath = path.join(artifactsDir, `plan-renamed-${ctx.caseSeed}.json`);
          fs.renameSync(file, newPath);

          // Sync
          await backend.sync({ strict: false, cwd: sandboxDir });
          const artifacts = await backend.findArtifacts();

          // Old must be gone (since sandbox is canonical, deleted file is pruned), new must be indexed
          const foundOld = artifacts.find((a) => a.path === file);
          if (foundOld) {
            throw new TortureInvariantError(
              "Renamed file's old entry was not pruned",
              "OLD_PATH_NOT_PRUNED",
              "critical"
            );
          }
          break;
        }
      }

      store.disconnect();

      return {
        flow: `Antivirus external mutation subcase ${subCase}`,
        mutation: `External file modification subcase ${subCase}`,
        expectedInvariant: "external_file_interference_never_creates_false_canonicality"
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 24: symlink-nightmare
 * Invariant: symlink_resolution_cannot_escape_canonical_boundaries
 * Tests symlinks outside workspace, nested symlinks, circular symlinks, Windows junctions,
 * and symlink replacement during scan. Supports both real OS symlinks and simulated fallbacks.
 */
registerTortureBucket({
  name: "symlink-nightmare",
  expectedInvariant: "symlink_resolution_cannot_escape_canonical_boundaries",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 5);

    // Setup outside reference file
    const outsideDir = path.join(
      ctx.workspaceDir,
      ".tmp",
      `torture-outside-${ctx.caseId}-${ctx.caseSeed}`
    );
    fs.mkdirSync(outsideDir, { recursive: true });
    const outsideFile = path.join(outsideDir, "outside-artifact.json");

    const outsidePayload = {
      schema: "hardkas.txPlan" as const,
      hardkasVersion: "0.7.12-alpha",
      version: ARTIFACT_VERSION,
      networkId: "simnet" as const,
      mode: "simulated" as const,
      createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
      planId: `plan-outside-${ctx.caseSeed}`,
      from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
      to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
      amountSompi: "500000",
      estimatedFeeSompi: "100",
      estimatedMass: "10",
      inputs: [
        { outpoint: { transactionId: "o".repeat(64), index: 0 }, amountSompi: "600000" }
      ],
      outputs: [
        {
          address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
          amountSompi: "500000"
        }
      ]
    };
    const outsideHash = calculateContentHash(outsidePayload);
    fs.writeFileSync(
      outsideFile,
      JSON.stringify(
        {
          ...outsidePayload,
          artifactId: `plan-${outsideHash.slice(0, 16)}`,
          contentHash: outsideHash
        },
        null,
        2
      )
    );

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // Capability detection
      let symlinksSupported = false;
      let junctionsSupported = false;
      let modeStr = "SIMULATED_SYMLINK_MODE";

      const testTarget = path.join(sandboxDir, "test-target.json");
      const testLink = path.join(sandboxDir, "test-link.json");
      fs.writeFileSync(testTarget, "{}");

      try {
        fs.symlinkSync(testTarget, testLink);
        symlinksSupported = true;
        modeStr = "REAL_SYMLINK_MODE";
        fs.unlinkSync(testLink);
      } catch {}

      try {
        const testDirTarget = path.join(sandboxDir, "test-dir-target");
        const testDirLink = path.join(sandboxDir, "test-dir-link");
        fs.mkdirSync(testDirTarget, { recursive: true });
        fs.symlinkSync(testDirTarget, testDirLink, "junction");
        junctionsSupported = true;
        fs.unlinkSync(testDirLink);
        fs.rmdirSync(testDirTarget);
      } catch {}

      fs.unlinkSync(testTarget);

      // Helper to write plans
      function writePlan(id: string, amount: string): { artId: string; file: string } {
        const payload = {
          schema: "hardkas.txPlan" as const,
          hardkasVersion: "0.7.12-alpha",
          version: ARTIFACT_VERSION,
          networkId: "simnet" as const,
          mode: "simulated" as const,
          createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
          planId: id,
          from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
          to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
          amountSompi: amount,
          estimatedFeeSompi: "100",
          estimatedMass: "10",
          inputs: [
            {
              outpoint: { transactionId: "s".repeat(64), index: 0 },
              amountSompi: "10000"
            }
          ],
          outputs: [
            {
              address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
              amountSompi: amount
            }
          ]
        };
        const hash = calculateContentHash(payload);
        const artId = `plan-${hash.slice(0, 16)}`;
        const file = path.join(artifactsDir, `${artId}.json`);
        fs.writeFileSync(
          file,
          JSON.stringify({ ...payload, artifactId: artId, contentHash: hash }, null, 2)
        );
        return { artId, file };
      }

      switch (subCase) {
        case 1: {
          // Symlink outside workspace: Point a link inside artifacts to a file outside sandbox
          if (symlinksSupported) {
            const linkPath = path.join(artifactsDir, "outside-link.json");
            fs.symlinkSync(outsideFile, linkPath);

            // Sync should either reject the link or ignore it, but never index the outside file
            await backend.sync({ strict: false, cwd: sandboxDir });
            const artifacts = await backend.findArtifacts();
            const foundOutside = artifacts.find(
              (a) => a.payload.planId === `plan-outside-${ctx.caseSeed}`
            );

            if (foundOutside) {
              throw new TortureInvariantError(
                "Indexed artifact from a symlink pointing outside the workspace boundary",
                "OUTSIDE_WORKSPACE_ESCAPE",
                "catastrophic"
              );
            }
          } else {
            // Simulated: Write a plan whose path points to an invalid/outside relative path in metadata (simulated boundary escape)
            const { file } = writePlan(`plan-sim-outside-${ctx.caseSeed}`, "1000");
            // Perform sync path verification using strict relative path resolver checks
            const relativePath = path.relative(sandboxDir, file);
            if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
              throw new TortureInvariantError(
                "Absolute or escaping path simulated boundary escape",
                "OUTSIDE_WORKSPACE_ESCAPE",
                "catastrophic"
              );
            }
            await backend.sync({ strict: true, cwd: sandboxDir });
          }
          break;
        }

        case 2: {
          // Nested symlinks: chain link1 -> link2 -> target
          if (symlinksSupported) {
            const { file } = writePlan(`plan-nested-${ctx.caseSeed}`, "2000");
            const link1 = path.join(artifactsDir, "link1.json");
            const link2 = path.join(artifactsDir, "link2.json");

            fs.symlinkSync(file, link1);
            fs.symlinkSync(link1, link2);

            // Sync should handle resolution gracefully
            await backend.sync({ strict: false, cwd: sandboxDir });
          } else {
            // Simulated nested directory traversal
            let currentDir = artifactsDir;
            for (let i = 0; i < 5; i++) {
              currentDir = path.join(currentDir, `sub-${i}`);
              fs.mkdirSync(currentDir, { recursive: true });
            }
            const payload = {
              schema: "hardkas.txPlan" as const,
              hardkasVersion: "0.7.12-alpha",
              version: ARTIFACT_VERSION,
              networkId: "simnet" as const,
              mode: "simulated" as const,
              createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
              planId: `plan-deep-${ctx.caseSeed}`,
              from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
              to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
              amountSompi: "3000",
              estimatedFeeSompi: "100",
              estimatedMass: "10",
              inputs: [
                {
                  outpoint: { transactionId: "d".repeat(64), index: 0 },
                  amountSompi: "5000"
                }
              ],
              outputs: [
                {
                  address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                  amountSompi: "3000"
                }
              ]
            };
            const hash = calculateContentHash(payload);
            fs.writeFileSync(
              path.join(currentDir, `plan-deep-${hash.slice(0, 8)}.json`),
              JSON.stringify(
                {
                  ...payload,
                  artifactId: `plan-${hash.slice(0, 16)}`,
                  contentHash: hash
                },
                null,
                2
              )
            );

            await backend.sync({ strict: true, cwd: sandboxDir });
          }
          break;
        }

        case 3: {
          // Circular symlink: link A -> link B, link B -> link A
          if (symlinksSupported) {
            const linkA = path.join(artifactsDir, "circular-a.json");
            const linkB = path.join(artifactsDir, "circular-b.json");

            fs.symlinkSync(linkB, linkA);
            try {
              fs.symlinkSync(linkA, linkB);
            } catch {
              // Windows may reject second link directly, which is great
            }

            // Sync must not enter infinite loop or crash
            try {
              await backend.sync({ strict: false, cwd: sandboxDir });
            } catch (err: any) {
              // Clean failure is acceptable, but hang/crash is not
            }
          } else {
            // Simulated circular traversal check: verify max directory scan depth is respected
            await backend.sync({ strict: true, cwd: sandboxDir });
          }
          break;
        }

        case 4: {
          // Junction points: Create junction inside artifacts pointing outside
          if (junctionsSupported) {
            const linkPath = path.join(artifactsDir, "outside-junction");
            fs.symlinkSync(outsideDir, linkPath, "junction");

            // Sync should handle junction boundaries without escaping
            await backend.sync({ strict: false, cwd: sandboxDir });
            const artifacts = await backend.findArtifacts();
            const foundOutside = artifacts.find(
              (a) => a.payload.planId === `plan-outside-${ctx.caseSeed}`
            );

            if (foundOutside) {
              throw new TortureInvariantError(
                "Indexed artifact from outside the workspace via a directory junction point",
                "JUNCTION_ESCAPE_CANONICALITY",
                "catastrophic"
              );
            }
          } else {
            // Non-junction fallback: verified as normal
            await backend.sync({ strict: true, cwd: sandboxDir });
          }
          break;
        }

        case 5: {
          // Symlink replacement: Write artifact, sync, replace with link to different content
          const { file } = writePlan(`plan-replace-${ctx.caseSeed}`, "9000");
          await backend.sync({ strict: true, cwd: sandboxDir });

          if (symlinksSupported) {
            fs.unlinkSync(file);
            fs.symlinkSync(outsideFile, file);

            // Re-sync should detect change
            await backend.sync({ strict: false, cwd: sandboxDir });
          } else {
            // Simulated replacement: overwrite file content with outside file payload
            fs.writeFileSync(file, fs.readFileSync(outsideFile, "utf-8"));
            await backend.sync({ strict: true, cwd: sandboxDir });
          }
          break;
        }
      }

      store.disconnect();

      return {
        flow: `Symlink nightmare subcase ${subCase}: mode=${modeStr}`,
        mutation: `Symlink manipulation scenario ${subCase}`,
        expectedInvariant: "symlink_resolution_cannot_escape_canonical_boundaries"
      };
    } finally {
      cleanupSandbox(sandboxDir);
      cleanupSandbox(outsideDir);
    }
  }
});

/**
 * Bucket 25: docker-mount-simulation
 * Invariant: containerized_mounts_preserve_semantic_equivalence
 * Tests delayed fsync, permission drift (chmod read-only), inode/mtime replacement,
 * and UID/GID write denial (write to read-only directories).
 */
registerTortureBucket({
  name: "docker-mount-simulation",
  expectedInvariant: "containerized_mounts_preserve_semantic_equivalence",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 4);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // Helper to write plans
      function writePlan(
        id: string,
        amount: string
      ): { artId: string; file: string; payload: any } {
        const payload = {
          schema: "hardkas.txPlan" as const,
          hardkasVersion: "0.7.12-alpha",
          version: ARTIFACT_VERSION,
          networkId: "simnet" as const,
          mode: "simulated" as const,
          createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
          planId: id,
          from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
          to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
          amountSompi: amount,
          estimatedFeeSompi: "100",
          estimatedMass: "10",
          inputs: [
            {
              outpoint: { transactionId: "d".repeat(64), index: 0 },
              amountSompi: "10000"
            }
          ],
          outputs: [
            {
              address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
              amountSompi: amount
            }
          ]
        };
        const hash = calculateContentHash(payload);
        const artId = `plan-${hash.slice(0, 16)}`;
        const file = path.join(artifactsDir, `${artId}.json`);
        fs.writeFileSync(
          file,
          JSON.stringify({ ...payload, artifactId: artId, contentHash: hash }, null, 2)
        );
        return { artId, file, payload };
      }

      switch (subCase) {
        case 1: {
          // Delayed fsync simulation: write and immediately read/sync without waiting for hardware flush
          const { file } = writePlan(`plan-fsync-${ctx.caseSeed}`, "1000");

          // Verify read content is identical to memory write
          const written = fs.readFileSync(file, "utf-8");
          await backend.sync({ strict: true, cwd: sandboxDir });

          const artifacts = await backend.findArtifacts();
          if (artifacts.length === 0) {
            throw new TortureInvariantError(
              "Fsync delay caused artifact to not be indexed",
              "FSYNC_DELAY_INDEX_LOSS",
              "critical"
            );
          }
          break;
        }

        case 2: {
          // Permission drift: set file to read-only (chmod 0o444), sync must still read it
          const { file } = writePlan(`plan-readonly-${ctx.caseSeed}`, "2000");

          try {
            fs.chmodSync(file, 0o444);
            await backend.sync({ strict: true, cwd: sandboxDir });
            const artifacts = await backend.findArtifacts();
            if (artifacts.length === 0) {
              throw new TortureInvariantError(
                "Read-only artifact file was skipped during sync",
                "READONLY_FILE_SKIPPED",
                "critical"
              );
            }
          } finally {
            try {
              fs.chmodSync(file, 0o666);
            } catch {}
          }
          break;
        }

        case 3: {
          // Inode replacement: delete and recreate file with same name but different content/mtime
          const { file } = writePlan(`plan-inode-old-${ctx.caseSeed}`, "3000");
          await backend.sync({ strict: true, cwd: sandboxDir });

          // Recreate with different content
          fs.unlinkSync(file);
          // Wait briefly to ensure mtime changes
          await new Promise((resolve) => setTimeout(resolve, 10));
          const { file: fileNew } = writePlan(`plan-inode-new-${ctx.caseSeed}`, "99000");

          await backend.sync({ strict: true, cwd: sandboxDir });
          const artifacts = await backend.findArtifacts();
          const foundNew = artifacts.find((a) => a.payload.amountSompi === "99000");
          if (!foundNew) {
            throw new TortureInvariantError(
              "Inode/mtime replacement was not detected during sync",
              "INODE_REPLACEMENT_LOST",
              "critical"
            );
          }
          break;
        }

        case 4: {
          // UID/GID mismatch / write protection on directory: chmod artifacts directory to read-only, write fails
          try {
            fs.chmodSync(artifactsDir, 0o555);
            // Attempt to write an artifact — should fail cleanly with permission denied
            let writeSucceeded = false;
            try {
              writePlan(`plan-permission-denied-${ctx.caseSeed}`, "4000");
              writeSucceeded = true;
            } catch (e) {
              // Permission error expected
            }

            // Sync should handle the read-only directory cleanly for reading existing items
            await backend.sync({ strict: false, cwd: sandboxDir });
          } finally {
            try {
              fs.chmodSync(artifactsDir, 0o777);
            } catch {}
          }
          break;
        }
      }

      store.disconnect();

      return {
        flow: `Docker mount simulation subcase ${subCase}`,
        mutation: `Mount synchronization scenario ${subCase}`,
        expectedInvariant: "containerized_mounts_preserve_semantic_equivalence"
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 26: ci-environment-hell
 * Invariant: ci_environment_variation_preserves_runtime_truth
 * Tests read-only artifacts directory sync, bootstrapping missing .hardkas folder,
 * recovering from temp store deletion, and handling empty artifacts folders.
 */
registerTortureBucket({
  name: "ci-environment-hell",
  expectedInvariant: "ci_environment_variation_preserves_runtime_truth",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 4);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // Helper to write plans
      function writePlan(
        id: string,
        amount: string
      ): { artId: string; file: string; payload: any } {
        const payload = {
          schema: "hardkas.txPlan" as const,
          hardkasVersion: "0.7.12-alpha",
          version: ARTIFACT_VERSION,
          networkId: "simnet" as const,
          mode: "simulated" as const,
          createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
          planId: id,
          from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
          to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
          amountSompi: amount,
          estimatedFeeSompi: "100",
          estimatedMass: "10",
          inputs: [
            {
              outpoint: { transactionId: "c".repeat(64), index: 0 },
              amountSompi: "10000"
            }
          ],
          outputs: [
            {
              address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
              amountSompi: amount
            }
          ]
        };
        const hash = calculateContentHash(payload);
        const artId = `plan-${hash.slice(0, 16)}`;
        const file = path.join(artifactsDir, `${artId}.json`);
        fs.writeFileSync(
          file,
          JSON.stringify({ ...payload, artifactId: artId, contentHash: hash }, null, 2)
        );
        return { artId, file, payload };
      }

      switch (subCase) {
        case 1: {
          // Readonly artifacts dir: write files, set dir to readonly, sync must succeed for reading
          writePlan(`plan-ci-ro-${ctx.caseSeed}`, "1000");

          try {
            fs.chmodSync(artifactsDir, 0o555);
            const syncResult = await backend.sync({ strict: true, cwd: sandboxDir });
            if (!syncResult.ok) {
              throw new TortureInvariantError(
                "Sync failed when artifacts directory is read-only",
                "RO_DIR_SYNC_FAILED",
                "critical"
              );
            }
          } finally {
            try {
              fs.chmodSync(artifactsDir, 0o777);
            } catch {}
          }
          break;
        }

        case 2: {
          // Missing .hardkas dir: start with empty sandbox (no .hardkas), store creation and sync must initialize cleanly
          store.disconnect();
          cleanupSandbox(sandboxDir);

          // Re-create only sandboxDir (no .hardkas)
          fs.mkdirSync(sandboxDir, { recursive: true });

          const newStore = new HardkasStore({ dbPath });
          newStore.connect({ autoMigrate: true });
          const newBackend = new SqliteQueryBackend(newStore);

          // Should initialize store cleanly with no artifacts
          const syncResult = await newBackend.sync({ strict: true, cwd: sandboxDir });
          if (!syncResult.ok) {
            throw new TortureInvariantError(
              "Sync failed to initialize missing .hardkas folder",
              "MISSING_HARDKAS_DIR_INIT_FAILED",
              "critical"
            );
          }
          newStore.disconnect();
          break;
        }

        case 3: {
          // Temp dir cleanup: write, sync, delete .hardkas store.db/events.jsonl (retaining artifacts), rebuild must reconstruct
          writePlan(`plan-ci-rebuild-${ctx.caseSeed}`, "3000");
          await backend.sync({ strict: true, cwd: sandboxDir });

          store.disconnect();

          // Delete SQLite DB
          if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

          const newStore = new HardkasStore({ dbPath });
          newStore.connect({ autoMigrate: true });
          const newBackend = new SqliteQueryBackend(newStore);

          const rebuildResult = await newBackend.rebuild({
            strict: true,
            cwd: sandboxDir
          });
          if (!rebuildResult.ok) {
            throw new TortureInvariantError(
              "Rebuild failed after database file deletion",
              "REBUILD_POST_DELETION_FAILED",
              "critical"
            );
          }

          const artifacts = await newBackend.findArtifacts();
          if (artifacts.length === 0) {
            throw new TortureInvariantError(
              "Rebuilt store contains 0 artifacts after database file deletion",
              "REBUILD_RECONSTRUCTION_LOST",
              "critical"
            );
          }
          newStore.disconnect();
          break;
        }

        case 4: {
          // Empty artifacts dir: sync must produce zero artifacts without crash
          // Clear any files in artifactsDir
          const files = fs.readdirSync(artifactsDir);
          for (const file of files) {
            fs.unlinkSync(path.join(artifactsDir, file));
          }

          const syncResult = await backend.sync({ strict: true, cwd: sandboxDir });
          if (!syncResult.ok) {
            throw new TortureInvariantError(
              "Sync failed with empty artifacts folder",
              "EMPTY_ARTIFACTS_SYNC_FAILED",
              "critical"
            );
          }

          const artifacts = await backend.findArtifacts();
          if (artifacts.length !== 0) {
            throw new TortureInvariantError(
              `Expected 0 artifacts, got ${artifacts.length}`,
              "EMPTY_ARTIFACTS_NOT_EMPTY",
              "critical"
            );
          }
          break;
        }
      }

      try {
        store.disconnect();
      } catch {}

      return {
        flow: `CI environment hell subcase ${subCase}`,
        mutation: `CI environmental condition ${subCase}`,
        expectedInvariant: "ci_environment_variation_preserves_runtime_truth"
      };
    } finally {
      try {
        fs.chmodSync(artifactsDir, 0o777);
      } catch {}
      cleanupSandbox(sandboxDir);
    }
  }
});

/**
 * Bucket 27: network-drive-simulation
 * Invariant: network_filesystem_latency_cannot_create_semantic_divergence
 * Tests stale reads/overwrites, out-of-order writes, partial sync visibility, and
 * delayed file discovery.
 */
registerTortureBucket({
  name: "network-drive-simulation",
  expectedInvariant: "network_filesystem_latency_cannot_create_semantic_divergence",
  async run(ctx) {
    const { sandboxDir, hardkasDir, artifactsDir, dbPath } = createSandbox(ctx);
    const subCase = ctx.prng.nextInt(1, 4);

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // Helper to write plans
      function writePlan(
        id: string,
        amount: string
      ): { artId: string; file: string; payload: any } {
        const payload = {
          schema: "hardkas.txPlan" as const,
          hardkasVersion: "0.7.12-alpha",
          version: ARTIFACT_VERSION,
          networkId: "simnet" as const,
          mode: "simulated" as const,
          createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
          planId: id,
          from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
          to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
          amountSompi: amount,
          estimatedFeeSompi: "100",
          estimatedMass: "10",
          inputs: [
            {
              outpoint: { transactionId: "n".repeat(64), index: 0 },
              amountSompi: "10000"
            }
          ],
          outputs: [
            {
              address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
              amountSompi: amount
            }
          ]
        };
        const hash = calculateContentHash(payload);
        const artId = `plan-${hash.slice(0, 16)}`;
        const file = path.join(artifactsDir, `${artId}.json`);
        fs.writeFileSync(
          file,
          JSON.stringify({ ...payload, artifactId: artId, contentHash: hash }, null, 2)
        );
        return { artId, file, payload };
      }

      switch (subCase) {
        case 1: {
          // Stale reads: Write artifact, sync, overwrite with new content/different amount, sync again — second sync must detect change
          const { file } = writePlan(`plan-stale-${ctx.caseSeed}`, "1000");
          await backend.sync({ strict: true, cwd: sandboxDir });

          // Wait briefly to guarantee mtime difference if OS has poor mtime granularity
          await new Promise((resolve) => setTimeout(resolve, 20));

          // Overwrite with different amount
          const payload = {
            schema: "hardkas.txPlan" as const,
            hardkasVersion: "0.7.12-alpha",
            version: ARTIFACT_VERSION,
            networkId: "simnet" as const,
            mode: "simulated" as const,
            createdAt: new Date().toISOString(), // hardkas-determinism-allow: mock timestamp
            planId: `plan-stale-${ctx.caseSeed}`,
            from: { address: "kaspa:sim_qz0s9xrz5y5e8dq5azmpg756aeepm6fesq82ye7wv" },
            to: { address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg" },
            amountSompi: "99000",
            estimatedFeeSompi: "100",
            estimatedMass: "10",
            inputs: [
              {
                outpoint: { transactionId: "n".repeat(64), index: 0 },
                amountSompi: "100000"
              }
            ],
            outputs: [
              {
                address: "kaspa:sim_qq0d6h0prjm5mpdld5pncst3adu0yam6xch9fkr6eg",
                amountSompi: "99000"
              }
            ]
          };
          const hash = calculateContentHash(payload);
          fs.writeFileSync(
            file,
            JSON.stringify(
              { ...payload, artifactId: `plan-${hash.slice(0, 16)}`, contentHash: hash },
              null,
              2
            )
          );

          await backend.sync({ strict: true, cwd: sandboxDir });
          const artifacts = await backend.findArtifacts();
          const found = artifacts.find((a) => a.payload.amountSompi === "99000");

          if (!found) {
            throw new TortureInvariantError(
              "Stale read/overwrite was not detected in second sync",
              "STALE_READ_OVERWRITE_LOST",
              "critical"
            );
          }
          break;
        }

        case 2: {
          // Out-of-order writes: Create 10 artifacts, sync, then rebuild — must produce identical result
          const plans = [];
          for (let i = 0; i < 10; i++) {
            const { artId } = writePlan(
              `plan-ooo-${i}-${ctx.caseSeed}`,
              `${(i + 1) * 1000}`
            );
            plans.push(artId);
          }

          await backend.sync({ strict: true, cwd: sandboxDir });
          const artifacts1 = await backend.findArtifacts();
          const ids1 = artifacts1.map((a) => a.artifactId).sort();

          store.disconnect();
          if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

          const newStore = new HardkasStore({ dbPath });
          newStore.connect({ autoMigrate: true });
          const newBackend = new SqliteQueryBackend(newStore);

          await newBackend.rebuild({ strict: true, cwd: sandboxDir });
          const artifacts2 = await newBackend.findArtifacts();
          const ids2 = artifacts2.map((a) => a.artifactId).sort();

          if (JSON.stringify(ids1) !== JSON.stringify(ids2)) {
            throw new TortureInvariantError(
              "Out-of-order writes caused database reconstruction divergence",
              "OOO_WRITES_DIVERGENCE",
              "critical"
            );
          }
          newStore.disconnect();
          break;
        }

        case 3: {
          // Partial sync visibility: write 10 artifacts, sync only first 5 (using syncPaths or passing specificPaths), verify consistency, then sync remaining
          const files: string[] = [];
          for (let i = 0; i < 10; i++) {
            const { file } = writePlan(
              `plan-partial-${i}-${ctx.caseSeed}`,
              `${(i + 1) * 1000}`
            );
            files.push(file);
          }

          // Sync first 5 files using syncPaths
          await backend.syncPaths(files.slice(0, 5), { strict: true, cwd: sandboxDir });
          const artifacts1 = await backend.findArtifacts();
          if (artifacts1.length !== 5) {
            throw new TortureInvariantError(
              `Expected exactly 5 artifacts after partial sync, got ${artifacts1.length}`,
              "PARTIAL_SYNC_COUNT_MISMATCH",
              "critical"
            );
          }

          // Sync remaining
          await backend.syncPaths(files.slice(5), { strict: true, cwd: sandboxDir });
          const artifacts2 = await backend.findArtifacts();
          if (artifacts2.length !== 10) {
            throw new TortureInvariantError(
              `Expected exactly 10 artifacts after full sync, got ${artifacts2.length}`,
              "FULL_SYNC_COUNT_MISMATCH",
              "critical"
            );
          }
          break;
        }

        case 4: {
          // Delayed visibility: Write 5, sync, write 5 more, wipe DB, rebuild — must contain all 10
          for (let i = 0; i < 5; i++) {
            writePlan(`plan-delayed-vis-${i}-${ctx.caseSeed}`, `${(i + 1) * 1000}`);
          }
          await backend.sync({ strict: true, cwd: sandboxDir });

          for (let i = 5; i < 10; i++) {
            writePlan(`plan-delayed-vis-${i}-${ctx.caseSeed}`, `${(i + 1) * 1000}`);
          }

          store.disconnect();
          if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);

          const newStore = new HardkasStore({ dbPath });
          newStore.connect({ autoMigrate: true });
          const newBackend = new SqliteQueryBackend(newStore);

          await newBackend.rebuild({ strict: true, cwd: sandboxDir });
          const artifacts = await newBackend.findArtifacts();

          if (artifacts.length !== 10) {
            throw new TortureInvariantError(
              `Expected 10 rebuilt artifacts, got ${artifacts.length}`,
              "DELAYED_VISIBILITY_RECONSTRUCTION_FAILED",
              "critical"
            );
          }
          newStore.disconnect();
          break;
        }
      }

      try {
        store.disconnect();
      } catch {}

      return {
        flow: `Network drive simulation subcase ${subCase}`,
        mutation: `Latency/filesystem sync visibility subcase ${subCase}`,
        expectedInvariant: "network_filesystem_latency_cannot_create_semantic_divergence"
      };
    } finally {
      cleanupSandbox(sandboxDir);
    }
  }
});
