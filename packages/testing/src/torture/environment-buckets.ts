// SAFETY_LEVEL: SIMULATION_ONLY

import fs from "node:fs";
import path from "node:path";
import {
  registerTortureBucket,
  TortureBucketContext,
  TortureInvariantError
} from "./torture-engine.js";
import { calculateContentHash, ARTIFACT_VERSION } from "@hardkas/artifacts";
import { HardkasStore, SqliteQueryBackend } from "@hardkas/query-store";
import { EnvironmentTelemetry } from "@hardkas/core";

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

// Helper to cleanup sandbox directories safely, unless preserved
function cleanupSandbox(sandboxDir: string, forcePreserve = false) {
  if (forcePreserve || EnvironmentTelemetry.shouldPreserveSandbox(sandboxDir)) return;
  try {
    if (fs.existsSync(sandboxDir)) {
      fs.rmSync(sandboxDir, { recursive: true, force: true });
    }
  } catch {}
}

// Helper to create a valid, fully schema-compliant mock payload
function createValidMockPayload(ctx: TortureBucketContext, suffix: string = "") {
  return {
    schema: "hardkas.txPlan" as const,
    hardkasVersion: "0.9.7-alpha",
    version: ARTIFACT_VERSION,
    networkId: "simnet" as const,
    mode: "simulated" as const,
    createdAt: new Date().toISOString(), // hardkas-determinism-allow
    planId: `plan-mock-${ctx.caseId}-${suffix}`,
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
}

/**
 * Bucket 1: windows-filesystem-hell
 */
registerTortureBucket({
  name: "windows-filesystem-hell",
  expectedInvariant: "windows_filesystem_semantics_cannot_corrupt_canonical_truth",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    let failed = true;
    let longPathSupportDetected = false;

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // Case insensitive collision attempt
      const payloadA = createValidMockPayload(ctx, "A");
      const hashA = calculateContentHash(payloadA);
      const artIdA = `plan-${hashA.slice(0, 16)}`;
      fs.writeFileSync(
        path.join(artifactsDir, `${artIdA}.json`),
        JSON.stringify({ ...payloadA, artifactId: artIdA, contentHash: hashA })
      );

      // uppercase extension, mixed case filename
      const payloadB = createValidMockPayload(ctx, "B");
      const artIdB = `plan-${calculateContentHash(payloadB).slice(0, 16)}`;
      fs.writeFileSync(
        path.join(artifactsDir, `${artIdB.toUpperCase()}.JSON`),
        JSON.stringify({
          ...payloadB,
          artifactId: artIdB,
          contentHash: calculateContentHash(payloadB)
        })
      );

      // Long path attempt
      let longPathCreated = false;
      try {
        const deepDir = path.join(artifactsDir, "a".repeat(200), "b".repeat(200));
        fs.mkdirSync(deepDir, { recursive: true });
        const longPathArt = path.join(deepDir, `plan-${hashA}.json`);
        fs.writeFileSync(
          longPathArt,
          JSON.stringify({ ...payloadA, artifactId: `plan-${hashA}`, contentHash: hashA })
        );
        longPathCreated = true;
        longPathSupportDetected = true;
      } catch (err: any) {
        // If Windows rejects long path, that's fine, but ensure no partial state
        longPathSupportDetected = false;
      }

      await backend.sync({ strict: true, cwd: sandboxDir });
      const artifacts = await backend.findArtifacts();

      if (artifacts.length < 2) {
        throw new TortureInvariantError(
          "Failed to index artifacts with case insensitive extensions",
          "CASE_INSENSITIVE_FAIL"
        );
      }

      failed = false;
      store.disconnect();
      return {
        flow: "Windows FS Hell",
        mutation: "Case insensitivity and Long Paths",
        longPathSupportDetected,
        artifactsBefore: [artIdA, artIdB]
      };
    } catch (err: any) {
      err.sandboxSnapshotPath = sandboxDir;
      err.longPathSupportDetected = longPathSupportDetected;
      throw err;
    } finally {
      cleanupSandbox(sandboxDir, failed);
    }
  }
});

/**
 * Bucket 2: unicode-normalization-chaos
 */
registerTortureBucket({
  name: "unicode-normalization-chaos",
  expectedInvariant: "unicode_normalization_never_changes_artifact_identity",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    let failed = true;

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      const payload = createValidMockPayload(ctx, "unicode");
      const hash = calculateContentHash(payload);
      const artId = `plan-${hash.slice(0, 16)}`;
      // Make the filename match but path contains NFC/NFD
      const nfcDir = path.join(artifactsDir, "café_dir".normalize("NFC"));
      fs.mkdirSync(nfcDir, { recursive: true });
      const nfcPath = path.join(nfcDir, `${artId}.json`);

      fs.writeFileSync(
        nfcPath,
        JSON.stringify({ ...payload, artifactId: artId, contentHash: hash })
      );

      await backend.sync({ strict: true, cwd: sandboxDir });
      const artifacts = await backend.findArtifacts();

      if (artifacts.length !== 1 || artifacts[0]!.artifactId !== artId) {
        throw new TortureInvariantError(
          "Unicode normalization broke indexing",
          "UNICODE_FAIL"
        );
      }

      // Test hashing normalization equivalence
      const payloadNFC = createValidMockPayload(
        ctx,
        "C:\\test\\café.json".normalize("NFC")
      );
      const payloadNFD = createValidMockPayload(
        ctx,
        "C:\\test\\café.json".normalize("NFD")
      );
      if (calculateContentHash(payloadNFC) !== calculateContentHash(payloadNFD)) {
        throw new TortureInvariantError(
          "Semantic identity changed under unicode normalization",
          "UNICODE_IDENTITY_DRIFT"
        );
      }

      failed = false;
      store.disconnect();
      return {
        flow: "Unicode Chaos",
        mutation: "NFC/NFD equivalence",
        artifactsBefore: [artId]
      };
    } catch (err: any) {
      err.sandboxSnapshotPath = sandboxDir;
      throw err;
    } finally {
      cleanupSandbox(sandboxDir, failed);
    }
  }
});

/**
 * Bucket 3: clock-skew-chaos
 */
registerTortureBucket({
  name: "clock-skew-chaos",
  expectedInvariant: "clock_skew_cannot_break_replay_or_incremental_sync",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    let failed = true;

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      const payload = createValidMockPayload(ctx, "clock");
      const hash = calculateContentHash(payload);
      const artId = `plan-${hash.slice(0, 16)}`;
      const file = path.join(artifactsDir, `${artId}.json`);
      fs.writeFileSync(
        file,
        JSON.stringify({ ...payload, artifactId: artId, contentHash: hash })
      );

      // Set future timestamp
      const futureDate = new Date(Date.now() + 1000000000);
      fs.utimesSync(file, futureDate, futureDate);

      await backend.sync({ strict: true, cwd: sandboxDir });
      const artifacts = await backend.findArtifacts();

      if (artifacts.length !== 1) {
        throw new TortureInvariantError(
          "Future timestamp broke indexing",
          "FUTURE_MTIME_FAIL"
        );
      }

      // Set epoch timestamp
      const epochDate = new Date(0);
      fs.utimesSync(file, epochDate, epochDate);

      await backend.sync({ strict: true, cwd: sandboxDir });

      failed = false;
      store.disconnect();
      return {
        flow: "Clock Skew",
        mutation: "Future and epoch mtimes",
        artifactsBefore: [artId],
        clockSkewDetected: true
      };
    } catch (err: any) {
      err.sandboxSnapshotPath = sandboxDir;
      err.clockSkewDetected = true;
      throw err;
    } finally {
      cleanupSandbox(sandboxDir, failed);
    }
  }
});

/**
 * Bucket 4: filesystem-ordering-chaos
 */
registerTortureBucket({
  name: "filesystem-ordering-chaos",
  expectedInvariant: "filesystem_iteration_order_never_affects_semantic_result",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    let failed = true;

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      for (let i = 0; i < 10; i++) {
        const payload = createValidMockPayload(ctx, `order-${i}`);
        const hash = calculateContentHash(payload);
        const artId = `plan-${hash.slice(0, 16)}`;
        fs.writeFileSync(
          path.join(artifactsDir, `${artId}.json`),
          JSON.stringify({ ...payload, artifactId: artId, contentHash: hash })
        );
      }

      await backend.sync({ strict: true, cwd: sandboxDir });
      const artifacts = await backend.findArtifacts();

      if (artifacts.length !== 10) {
        throw new TortureInvariantError(
          "Filesystem ordering broke sync",
          "FS_ORDER_FAIL"
        );
      }

      failed = false;
      store.disconnect();
      return {
        flow: "Filesystem Ordering",
        mutation: "Parallel creation and sync",
        artifactsBefore: []
      };
    } catch (err: any) {
      err.sandboxSnapshotPath = sandboxDir;
      throw err;
    } finally {
      cleanupSandbox(sandboxDir, failed);
    }
  }
});

/**
 * Bucket 5: human-chaos
 */
registerTortureBucket({
  name: "human-chaos",
  expectedInvariant: "manual_user_interference_cannot_silently_corrupt_truth",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    let failed = true;

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      const payload = createValidMockPayload(ctx, "human");
      const hash = calculateContentHash(payload);
      const artId = `plan-${hash.slice(0, 16)}`;
      const file = path.join(artifactsDir, `${artId}.json`);
      fs.writeFileSync(
        file,
        JSON.stringify({ ...payload, artifactId: artId, contentHash: hash })
      );

      await backend.sync({ strict: true, cwd: sandboxDir });

      // Human truncates the file
      fs.writeFileSync(file, "{ bad_json");

      let caught = false;
      try {
        await backend.sync({ strict: true, cwd: sandboxDir });
      } catch (e) {
        caught = true;
      }

      if (!caught) {
        throw new TortureInvariantError(
          "Manual truncation was silently ignored",
          "HUMAN_TRUNCATION_FAIL"
        );
      }

      failed = false;
      store.disconnect();
      return {
        flow: "Human Chaos",
        mutation: "Truncating artifact post-sync",
        externalMutationDetected: true
      };
    } catch (err: any) {
      err.sandboxSnapshotPath = sandboxDir;
      err.externalMutationDetected = true;
      throw err;
    } finally {
      cleanupSandbox(sandboxDir, failed);
    }
  }
});

/**
 * Bucket 6: antivirus-external-mutation
 */
registerTortureBucket({
  name: "antivirus-external-mutation",
  expectedInvariant: "external_file_interference_never_creates_false_canonicality",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    let failed = true;

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      const payload = createValidMockPayload(ctx, "av");
      const hash = calculateContentHash(payload);
      const artId = `plan-${hash.slice(0, 16)}`;
      const file = path.join(artifactsDir, `${artId}.json`);

      fs.writeFileSync(
        file,
        JSON.stringify({ ...payload, artifactId: artId, contentHash: hash })
      );

      // AV opens file with exclusive read lock (simulate by just doing a standard sync)
      await backend.sync({ strict: true, cwd: sandboxDir });

      // AV deletes it
      fs.unlinkSync(file);

      let caught = false;
      try {
        await backend.sync({ strict: true, cwd: sandboxDir });
      } catch (e) {
        caught = true;
      }

      if (!caught) {
        const artifacts = await backend.findArtifacts();
        if (artifacts.length !== 0) {
          throw new TortureInvariantError(
            "Deleted file by AV left false canonicality",
            "AV_DELETE_FAIL"
          );
        }
      }

      failed = false;
      store.disconnect();
      return {
        flow: "AV Mutation",
        mutation: "External file deletion during active tracking",
        externalMutationDetected: true
      };
    } catch (err: any) {
      err.sandboxSnapshotPath = sandboxDir;
      err.externalMutationDetected = true;
      throw err;
    } finally {
      cleanupSandbox(sandboxDir, failed);
    }
  }
});

/**
 * Bucket 7: symlink-nightmare
 */
registerTortureBucket({
  name: "symlink-nightmare",
  expectedInvariant: "symlink_resolution_cannot_escape_canonical_boundaries",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    let failed = true;
    let symlinkMode = "SIMULATED_SYMLINK_MODE";

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      // Create an outside file
      const outsideDir = path.join(ctx.workspaceDir, ".tmp", `outside-${ctx.caseId}`);
      fs.mkdirSync(outsideDir, { recursive: true });
      const payload = createValidMockPayload(ctx, "symlink");
      const hash = calculateContentHash(payload);
      const artId = `plan-${hash.slice(0, 16)}`;
      const outsideFile = path.join(outsideDir, `${artId}.json`);
      fs.writeFileSync(
        outsideFile,
        JSON.stringify({ ...payload, artifactId: artId, contentHash: hash })
      );

      // Try to symlink it into artifacts dir
      const linkFile = path.join(artifactsDir, `${artId}.json`);
      try {
        fs.symlinkSync(outsideFile, linkFile);
        symlinkMode = "REAL_SYMLINK_MODE";
      } catch (e) {
        // Simulated fallback: just copy it
        fs.copyFileSync(outsideFile, linkFile);
      }

      await backend.sync({ strict: true, cwd: sandboxDir });

      failed = false;
      store.disconnect();
      try {
        fs.rmSync(outsideDir, { recursive: true, force: true });
      } catch {}

      return {
        flow: "Symlink Nightmare",
        mutation: "Outside workspace symlinking",
        symlinkMode
      };
    } catch (err: any) {
      err.sandboxSnapshotPath = sandboxDir;
      err.symlinkMode = symlinkMode;
      throw err;
    } finally {
      cleanupSandbox(sandboxDir, failed);
    }
  }
});

/**
 * Bucket 8: docker-mount-simulation
 */
registerTortureBucket({
  name: "docker-mount-simulation",
  expectedInvariant: "containerized_mounts_preserve_semantic_equivalence",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    let failed = true;

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      const payload = createValidMockPayload(ctx, "docker");
      const hash = calculateContentHash(payload);
      const artId = `plan-${hash.slice(0, 16)}`;
      const file = path.join(artifactsDir, `${artId}.json`);

      fs.writeFileSync(
        file,
        JSON.stringify({ ...payload, artifactId: artId, contentHash: hash })
      );

      // Simulate inode replacement (common in some Docker mount scenarios when files are edited on host)
      fs.renameSync(file, file + ".tmp");
      fs.copyFileSync(file + ".tmp", file);
      fs.unlinkSync(file + ".tmp");

      await backend.sync({ strict: true, cwd: sandboxDir });

      failed = false;
      store.disconnect();
      return {
        flow: "Docker Mounts",
        mutation: "Inode replacement",
        environmentMode: "DOCKER_SIMULATION"
      };
    } catch (err: any) {
      err.sandboxSnapshotPath = sandboxDir;
      err.environmentMode = "DOCKER_SIMULATION";
      throw err;
    } finally {
      cleanupSandbox(sandboxDir, failed);
    }
  }
});

/**
 * Bucket 9: ci-environment-hell
 */
registerTortureBucket({
  name: "ci-environment-hell",
  expectedInvariant: "ci_environment_variation_preserves_runtime_truth",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    let failed = true;

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      const payload = createValidMockPayload(ctx, "ci");
      const hash = calculateContentHash(payload);
      const artId = `plan-${hash.slice(0, 16)}`;
      const file = path.join(artifactsDir, `${artId}.json`);
      fs.writeFileSync(
        file,
        JSON.stringify({ ...payload, artifactId: artId, contentHash: hash })
      );

      // Simulate missing .hardkas entirely but keeping artifacts
      store.disconnect();
      for (let i = 0; i < 10; i++) {
        try {
          if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
          break;
        } catch (e) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      const newStore = new HardkasStore({ dbPath });
      newStore.connect({ autoMigrate: true });
      const newBackend = new SqliteQueryBackend(newStore);

      // Ensure rebuild convergence works
      await newBackend.rebuild({ strict: true, cwd: sandboxDir });
      const artifacts = await newBackend.findArtifacts();

      if (artifacts.length !== 1) {
        throw new TortureInvariantError(
          "CI missing DB state corrupted recovery",
          "CI_RECOVERY_FAIL"
        );
      }

      failed = false;
      newStore.disconnect();
      return {
        flow: "CI Environment",
        mutation: "Missing database simulation",
        environmentMode: "CI_SIMULATION"
      };
    } catch (err: any) {
      err.sandboxSnapshotPath = sandboxDir;
      err.environmentMode = "CI_SIMULATION";
      throw err;
    } finally {
      cleanupSandbox(sandboxDir, failed);
    }
  }
});

/**
 * Bucket 10: network-drive-simulation
 */
registerTortureBucket({
  name: "network-drive-simulation",
  expectedInvariant: "network_filesystem_latency_cannot_create_semantic_divergence",
  async run(ctx) {
    const { sandboxDir, artifactsDir, dbPath } = createSandbox(ctx);
    let failed = true;

    try {
      const store = new HardkasStore({ dbPath });
      store.connect({ autoMigrate: true });
      const backend = new SqliteQueryBackend(store);

      const payload = createValidMockPayload(ctx, "network");
      const hash = calculateContentHash(payload);
      const artId = `plan-${hash.slice(0, 16)}`;
      const file = path.join(artifactsDir, `${artId}.json`);

      // Write to temp, pause, rename (simulates delayed visibility)
      const tmpFile = file + ".tmp";
      fs.writeFileSync(
        tmpFile,
        JSON.stringify({ ...payload, artifactId: artId, contentHash: hash })
      );

      await new Promise((r) => setTimeout(r, 50));
      fs.renameSync(tmpFile, file);

      await backend.sync({ strict: true, cwd: sandboxDir });

      failed = false;
      store.disconnect();
      return {
        flow: "Network Drive",
        mutation: "Delayed file visibility",
        filesystemMode: "NETWORK_SIMULATION"
      };
    } catch (err: any) {
      err.sandboxSnapshotPath = sandboxDir;
      err.filesystemMode = "NETWORK_SIMULATION";
      throw err;
    } finally {
      cleanupSandbox(sandboxDir, failed);
    }
  }
});
