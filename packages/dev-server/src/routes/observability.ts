import { Hono } from "hono";
import fs from "node:fs";
import path from "node:path";
import { getQueryBackend } from "../db.js";

export const observabilityRoutes = new Hono();

function hardkasDir(): string {
  const rootDir = process.env.HARDKAS_ROOT || process.cwd();
  return path.join(rootDir, ".hardkas");
}

function bundlePath(): string {
  const rootDir = process.env.HARDKAS_ROOT || process.cwd();
  return path.join(rootDir, "hardkas.semantic-bundle.v1.json");
}

function tryReadJson(p: string): any | null {
  try {
    if (!fs.existsSync(p)) return null;
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

function tryReadJsonl(
  p: string
): { events: any[]; errorLine?: number; parseError?: string } | null {
  try {
    if (!fs.existsSync(p)) return null;
    const raw = fs.readFileSync(p, "utf-8").trim();
    if (!raw) return { events: [] };

    const lines = raw.split("\n");
    const events: any[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!.trim();
      if (!line) continue;
      try {
        events.push(JSON.parse(line));
      } catch (err: any) {
        return {
          events,
          errorLine: i + 1,
          parseError: err.message
        };
      }
    }

    return { events };
  } catch (e: any) {
    return { events: [], parseError: e.message };
  }
}

// ---------------------------------------------------------------------------
// GET /status
// ---------------------------------------------------------------------------
observabilityRoutes.get("/status", async (c) => {
  const now = new Date().toISOString();
  const queryBackend = getQueryBackend();

  // Priority 1: semantic bundle
  const bp = bundlePath();
  const bundle = tryReadJson(bp);
  if (bundle && bundle.artifacts && Array.isArray(bundle.artifacts)) {
    const artifacts = bundle.artifacts.map((a: any) => ({
      artifactId: a.artifactId,
      canonicalStatus: "REPLAY_VERIFIED",
      semanticHash: a.semanticHash,
      lineageEdges: a.lineageEdges || [],
      source: "semantic-bundle"
    }));
    return c.json({
      loaded: true,
      source: "hardkas.semantic-bundle.v1.json",
      loadedAt: now,
      artifacts
    });
  }

  // Priority 2: query-store (retrieve real artifacts from SQLite)
  if (queryBackend.isReady()) {
    try {
      const allArtifacts = await queryBackend.findArtifacts();
      const artifacts = allArtifacts.map((art) => {
        let canonicalStatus = "VERIFIED";
        if (art.kind === "CORRUPTED") canonicalStatus = "CORRUPTED";
        else if (art.kind === "QUARANTINED") canonicalStatus = "QUARANTINED";
        else if (art.schema.includes("replay") || art.schema.includes("Replay"))
          canonicalStatus = "REPLAY_VERIFIED";
        else if (art.kind === "PROJECTED") canonicalStatus = "PROJECTED";

        return {
          artifactId: art.artifactId,
          canonicalStatus,
          semanticHash: art.contentHash,
          source: "sqlite",
          sourceNote: "Live SQLite central semantics projection active"
        };
      });

      return c.json({
        loaded: true,
        source: "query-store/store.db",
        loadedAt: now,
        artifacts
      });
    } catch (e) {
      console.error("Failed to fetch artifacts from SQLite in status route:", e);
    }
  }

  // Priority 3: artifacts fallback – scan .hardkas/artifacts
  const artifactsDir = path.join(hardkasDir(), "artifacts");
  if (fs.existsSync(artifactsDir)) {
    const files = fs.readdirSync(artifactsDir).filter((f) => f.endsWith(".json"));
    const artifacts = files.map((f) => {
      const content = tryReadJson(path.join(artifactsDir, f));
      return {
        artifactId: f,
        canonicalStatus: "PROJECTED",
        source: "artifacts-fallback",
        semanticHash: content?.hash || content?.contentHash || null,
        sourceNote: "Raw filesystem truth. Not replay-verified."
      };
    });
    return c.json({
      loaded: true,
      source: ".hardkas/artifacts (fallback)",
      sourceNote: "PROJECTED / UNVERIFIED – no replay proof available.",
      loadedAt: now,
      artifacts
    });
  }

  return c.json({
    loaded: false,
    source: "none",
    loadedAt: now,
    artifacts: [],
    message: "No canonical artifacts found in current workspace."
  });
});

// ---------------------------------------------------------------------------
// GET /lineage
// ---------------------------------------------------------------------------
observabilityRoutes.get("/lineage", async (c) => {
  const now = new Date().toISOString();
  const queryBackend = getQueryBackend();

  // Priority 1: semantic bundle
  const bp = bundlePath();
  const bundle = tryReadJson(bp);
  if (bundle && bundle.artifacts && Array.isArray(bundle.artifacts)) {
    const nodes: any[] = [];
    const edges: any[] = [];
    const seen = new Set<string>();

    for (const a of bundle.artifacts) {
      if (!seen.has(a.artifactId)) {
        seen.add(a.artifactId);
        nodes.push({
          id: a.artifactId,
          data: { label: a.artifactId, semanticHash: a.semanticHash },
          position: { x: 0, y: 0 }
        });
      }
      if (a.lineageEdges && Array.isArray(a.lineageEdges)) {
        for (const target of a.lineageEdges) {
          if (!seen.has(target)) {
            seen.add(target);
            nodes.push({
              id: target,
              data: { label: target },
              position: { x: 0, y: 0 }
            });
          }
          edges.push({
            id: `${a.artifactId}->${target}`,
            source: a.artifactId,
            target
          });
        }
      }
    }

    const connectedIds = new Set<string>();
    for (const e of edges) {
      connectedIds.add(e.source);
      connectedIds.add(e.target);
    }
    const orphanNodes = nodes.filter((n) => !connectedIds.has(n.id)).map((n) => n.id);

    return c.json({
      loaded: true,
      source: "hardkas.semantic-bundle.v1.json",
      loadedAt: now,
      totalNodes: nodes.length,
      totalEdges: edges.length,
      orphanNodes,
      corruptedNodes: [],
      quarantinedNodes: [],
      nodes: nodes.slice(0, 200),
      edges: edges.slice(0, 500),
      truncated: nodes.length > 200,
      hiddenNodes: Math.max(0, nodes.length - 200)
    });
  }

  // Priority 2: query-store
  if (queryBackend.isReady()) {
    try {
      const allArtifacts = await queryBackend.findArtifacts();
      const nodes = allArtifacts.map((a) => ({
        id: a.artifactId,
        data: { label: a.artifactId, semanticHash: a.contentHash },
        position: { x: 0, y: 0 }
      }));

      const dbEdges = (await queryBackend.executeRawSql(
        "SELECT parent_artifact_id as source, child_artifact_id as target FROM lineage_edges"
      )) as { source: string; target: string }[];
      const edges = dbEdges.map((e) => ({
        id: `${e.source}->${e.target}`,
        source: e.source,
        target: e.target
      }));

      const connectedIds = new Set<string>();
      for (const e of edges) {
        connectedIds.add(e.source);
        connectedIds.add(e.target);
      }
      const orphanNodes = nodes.filter((n) => !connectedIds.has(n.id)).map((n) => n.id);

      return c.json({
        loaded: true,
        source: "query-store/store.db",
        sourceNote: "Live SQLite causal lineage projection active",
        loadedAt: now,
        totalNodes: nodes.length,
        totalEdges: edges.length,
        orphanNodes,
        corruptedNodes: [],
        quarantinedNodes: [],
        nodes: nodes.slice(0, 200),
        edges: edges.slice(0, 500),
        truncated: nodes.length > 200,
        hiddenNodes: Math.max(0, nodes.length - 200)
      });
    } catch (e) {
      console.error("Failed to query lineage in Hono:", e);
    }
  }

  // Priority 3: artifacts fallback
  const artifactsDir = path.join(hardkasDir(), "artifacts");
  if (fs.existsSync(artifactsDir)) {
    const files = fs.readdirSync(artifactsDir).filter((f) => f.endsWith(".json"));
    const nodes = files.map((f, i) => ({
      id: f,
      data: { label: f },
      position: { x: 0, y: i * 80 }
    }));
    return c.json({
      loaded: true,
      source: ".hardkas/artifacts (fallback)",
      sourceNote:
        "PROJECTED / UNVERIFIED – raw filesystem scan, no lineage edges derived.",
      loadedAt: now,
      totalNodes: nodes.length,
      totalEdges: 0,
      orphanNodes: nodes.map((n) => n.id),
      nodes: nodes.slice(0, 200),
      edges: [],
      truncated: nodes.length > 200
    });
  }

  return c.json({
    loaded: false,
    source: "none",
    loadedAt: now,
    message: "No lineage data available.",
    nodes: [],
    edges: []
  });
});

// ---------------------------------------------------------------------------
// GET /quarantine
// ---------------------------------------------------------------------------
observabilityRoutes.get("/quarantine", async (c) => {
  const now = new Date().toISOString();
  const qPath = path.join(hardkasDir(), "quarantine");

  if (!fs.existsSync(qPath)) {
    return c.json({
      loaded: true,
      source: ".hardkas/quarantine",
      loadedAt: now,
      totalQuarantined: 0,
      items: [],
      message: "Quarantine directory does not exist.",
      recoveryAction: "Run verification checks to audit active schemas:",
      recoveryCommand:
        "pnpm hardkas artifact verify .hardkas/quarantine --recursive --strict"
    });
  }

  const files = fs.readdirSync(qPath);
  const items = files.map((f) => {
    const stat = fs.statSync(path.join(qPath, f));
    return {
      filename: f,
      reason: "quarantined",
      detectedAt: stat.mtime.toISOString(),
      originalPath: path.join(qPath, f)
    };
  });

  return c.json({
    loaded: true,
    source: ".hardkas/quarantine",
    loadedAt: now,
    totalQuarantined: items.length,
    items,
    recoveryAction:
      items.length > 0
        ? "To inspect and repair the isolated artifacts, execute a deep safety verification of the quarantine zone:"
        : undefined,
    recoveryCommand:
      items.length > 0
        ? "pnpm hardkas artifact verify .hardkas/quarantine --recursive --strict"
        : undefined
  });
});

// ---------------------------------------------------------------------------
// GET /telemetry
// ---------------------------------------------------------------------------
observabilityRoutes.get("/telemetry", async (c) => {
  const now = new Date().toISOString();
  const telemetryFile = path.join(hardkasDir(), "telemetry", "telemetry.jsonl");
  const eventsFile = path.join(hardkasDir(), "events.jsonl");

  if (fs.existsSync(telemetryFile)) {
    const parsed = tryReadJsonl(telemetryFile);
    if (parsed === null) {
      return c.json({
        loaded: false,
        source: ".hardkas/telemetry/telemetry.jsonl",
        loadedAt: now,
        message: "Telemetry file exists but could not be parsed.",
        totalAnomalies: 0,
        countsByType: {},
        countsByBucket: {},
        recentEvents: [],
        recoveryAction:
          "Run a schema verification check to audit the telemetry event stream log:",
        recoveryCommand: "pnpm hardkas telemetry verify"
      });
    }

    const { events, parseError, errorLine } = parsed as any;
    if (parseError) {
      return c.json({
        loaded: false,
        source: ".hardkas/telemetry/telemetry.jsonl",
        loadedAt: now,
        message: `Telemetry schema or parse issue (line ${errorLine}: ${parseError}).`,
        totalAnomalies: events.length,
        countsByType: {},
        countsByBucket: {},
        recentEvents: [],
        recoveryAction:
          "Examine and repair the stream schema violation utilizing telemetry verify command:",
        recoveryCommand: "pnpm hardkas telemetry verify"
      });
    }

    if (events.length === 0) {
      return c.json({
        loaded: true,
        source: ".hardkas/telemetry/telemetry.jsonl",
        loadedAt: now,
        message: "Telemetry file exists but no events recorded.",
        totalAnomalies: 0,
        countsByType: {},
        countsByBucket: {},
        recentEvents: [],
        recoveryAction:
          "stress-test locks, trigger concurrent executions, and track performance anomalies by running the chaos-matrix suite:",
        recoveryCommand: "pnpm hardkas torture matrix"
      });
    }

    const countsByType: Record<string, number> = {};
    const countsByBucket: Record<string, number> = {};
    for (const ev of events) {
      const t = ev.type || ev.kind || ev.anomalyType || "unknown";
      countsByType[t] = (countsByType[t] || 0) + 1;
      if (ev.bucket) {
        countsByBucket[ev.bucket] = (countsByBucket[ev.bucket] || 0) + 1;
      }
    }

    return c.json({
      loaded: true,
      source: ".hardkas/telemetry/telemetry.jsonl",
      loadedAt: now,
      totalAnomalies: events.length,
      countsByType,
      countsByBucket,
      recentEvents: events.slice(-50)
    });
  }

  const eventsExist = fs.existsSync(eventsFile);
  return c.json({
    loaded: false,
    source: "none",
    loadedAt: now,
    message: "No telemetry stream found.",
    eventsFallback: eventsExist,
    eventsFallbackNote: eventsExist
      ? "events.jsonl available as separate event log."
      : undefined,
    totalAnomalies: 0,
    countsByType: {},
    countsByBucket: {},
    recentEvents: [],
    recoveryAction:
      "stress-test locks, trigger concurrent executions, and track performance anomalies by running the chaos-matrix suite:",
    recoveryCommand: "pnpm hardkas torture matrix"
  });
});

// ---------------------------------------------------------------------------
// GET /replay
// ---------------------------------------------------------------------------
observabilityRoutes.get("/replay", async (c) => {
  const now = new Date().toISOString();
  const queryBackend = getQueryBackend();
  const bp = bundlePath();
  const bundle = tryReadJson(bp);
  const reportsDir = path.join(hardkasDir(), "reports");
  const reportsExist = fs.existsSync(reportsDir);

  // Fetch transaction-specific replay fields
  let replays: any[] = [];
  let pendingReceipts: any[] = [];
  let pendingReplay = false;
  let reason: string | undefined = undefined;

  if (queryBackend.isReady()) {
    try {
      replays = await queryBackend.findArtifacts({ schema: "hardkas.replayReport.v1" });
      const receipts = await queryBackend.findArtifacts({
        schema: "hardkas.txReceipt.v1"
      });
      const igraReceipts = await queryBackend.findArtifacts({
        schema: "hardkas.igraTxReceipt.v1"
      });

      const allReceipts = [...receipts, ...igraReceipts];
      const replayTxIds = new Set(replays.map((r) => r.payload?.txId));

      pendingReceipts = allReceipts.filter(
        (r) =>
          (r.payload?.status === "confirmed" || r.payload?.status === "accepted") &&
          !replayTxIds.has(r.payload?.txId)
      );

      pendingReplay = pendingReceipts.length > 0;
      if (pendingReplay) {
        reason = "receipt_artifact_without_replay_report";
      }
    } catch (e) {
      console.error("Failed to query transaction replays in Hono:", e);
    }
  }

  // Combine with dashboard status fields
  if (bundle) {
    return c.json({
      loaded: true,
      source: "hardkas.semantic-bundle.v1.json",
      loadedAt: now,
      replayAvailable: true,
      lastReplayStatus: bundle.invariantSummary?.failedChecks === 0 ? "PASS" : "FAIL",
      totalInvariantChecks: bundle.invariantSummary?.totalChecks || 0,
      passedInvariantChecks: bundle.invariantSummary?.passedChecks || 0,
      failedInvariantChecks: bundle.invariantSummary?.failedChecks || 0,
      globalSemanticHash: bundle.globalSemanticHash || null,
      replayHash: bundle.globalSemanticHash || null,
      statusSummary: bundle.statusSummary || {},
      // merged fields:
      replays,
      pendingReplays: pendingReceipts,
      pendingReplay,
      reason
    });
  }

  if (reportsExist) {
    const reportFiles = fs.readdirSync(reportsDir).filter((f) => f.endsWith(".json"));
    return c.json({
      loaded: true,
      source: ".hardkas/reports",
      loadedAt: now,
      replayAvailable: true,
      lastReplayStatus: "UNVERIFIED",
      totalInvariantChecks: null,
      failedInvariantChecks: null,
      globalSemanticHash: null,
      replayHash: null,
      reportFilesFound: reportFiles.length,
      commandSuggestion: "pnpm hardkas verify-semantics --ci-mode",
      recoveryAction: "To verify and compile your semantic replay proof:",
      recoveryCommand: "pnpm hardkas verify-semantics --ci-mode",
      // merged fields:
      replays,
      pendingReplays: pendingReceipts,
      pendingReplay,
      reason
    });
  }

  return c.json({
    loaded: false,
    source: "none",
    loadedAt: now,
    replayAvailable: false,
    message: "No replay report found. Run pnpm hardkas verify-semantics --ci-mode.",
    commandSuggestion: "pnpm hardkas verify-semantics --ci-mode",
    recoveryAction: "To verify and compile your semantic replay proof:",
    recoveryCommand: "pnpm hardkas verify-semantics --ci-mode",
    // merged fields:
    replays,
    pendingReplays: pendingReceipts,
    pendingReplay,
    reason
  });
});

// ---------------------------------------------------------------------------
// GET /bundles
// ---------------------------------------------------------------------------
observabilityRoutes.get("/bundles", async (c) => {
  const now = new Date().toISOString();
  const bp = bundlePath();

  if (!fs.existsSync(bp)) {
    return c.json({
      loaded: false,
      source: "none",
      loadedAt: now,
      message: "No semantic bundle found. Run: pnpm hardkas verify-semantics --ci-mode"
    });
  }

  const bundle = tryReadJson(bp);
  if (!bundle) {
    return c.json({
      loaded: false,
      source: "hardkas.semantic-bundle.v1.json",
      loadedAt: now,
      message: "Semantic bundle exists but could not be parsed."
    });
  }

  const stat = fs.statSync(bp);
  return c.json({
    loaded: true,
    source: "hardkas.semantic-bundle.v1.json",
    bundlePath: bp,
    bundleType: "local",
    loadedAt: now,
    generatedAt: stat.mtime.toISOString(),
    schemaVersion: bundle.schemaVersion,
    runtimeVersion: bundle.runtimeVersion,
    hashVersion: bundle.hashVersion,
    globalSemanticHash: bundle.globalSemanticHash,
    totalInvariantChecks: bundle.invariantSummary?.totalChecks || 0,
    passedChecks: bundle.invariantSummary?.passedChecks || 0,
    failedChecks: bundle.invariantSummary?.failedChecks || 0,
    uniqueArtifacts: bundle.artifacts?.length || 0,
    excludedNoiseFields: bundle.excludedNoiseFields || [],
    statusSummary: bundle.statusSummary || {}
  });
});

// ---------------------------------------------------------------------------
// GET /dashboard-health
// ---------------------------------------------------------------------------
observabilityRoutes.get("/dashboard-health", async (c) => {
  const now = new Date().toISOString();
  const hd = hardkasDir();
  const rootDir = process.env.HARDKAS_ROOT || process.cwd();

  const eventsFile = path.join(rootDir, "events.jsonl");
  const telemetryFile = path.join(hd, "telemetry", "telemetry.jsonl");
  const storeDb = path.join(hd, "store.db");
  const artifactsDir = path.join(hd, "artifacts");

  const hardkasDirExists = fs.existsSync(hd);
  const artifactsDirExists = fs.existsSync(artifactsDir);
  const semanticBundleExists = fs.existsSync(bundlePath());

  const queryBackend = getQueryBackend();

  let state: "GREEN" | "YELLOW" | "RED" | "GREY" = "GREEN";
  let lockStatus = "OK";
  let projectionDrift = false;
  let jsonlCorrupt = false;
  let artifactAuthorityUnresolved = false;
  let anomalyCount = { low: 0, medium: 0, high: 0, critical: 0 };
  let rotatedSegments = 0;

  // 1. Lock state
  try {
    const files = fs.readdirSync(hd);
    const locks = files.filter((f) => f.endsWith(".lock"));
    if (locks.length > 0) {
      lockStatus = "AMBIGUOUS";
      state = "RED"; // Ambiguous locks = RED
    }
  } catch {}

  // 2. Stream health
  try {
    if (fs.existsSync(eventsFile)) {
      // Naive stream corruption check: check if it ends with newline
      const buffer = Buffer.alloc(1024);
      const stats = fs.statSync(eventsFile);
      if (stats.size > 0) {
        const fd = fs.openSync(eventsFile, "r");
        const readSize = Math.min(1024, stats.size);
        fs.readSync(fd, buffer, 0, readSize, stats.size - readSize);
        fs.closeSync(fd);
        const tail = buffer.toString("utf-8", 0, readSize);
        if (!tail.endsWith("\n")) {
          jsonlCorrupt = true;
          state = "RED";
        }
      }
    }
  } catch {}

  // 3. Telemetry Anomaly Count
  try {
    const parsed = tryReadJsonl(telemetryFile);
    if (parsed && parsed.events) {
      for (const ev of parsed.events) {
        if (ev.severity === "low" || ev.severity === "nominal") anomalyCount.low++;
        else if (ev.severity === "medium" || ev.severity === "elevated")
          anomalyCount.medium++;
        else if (ev.severity === "high") anomalyCount.high++;
        else if (ev.severity === "critical") anomalyCount.critical++;
      }
    }
    if (anomalyCount.critical > 0 || anomalyCount.high > 0) {
      if (state === "GREEN") state = "YELLOW";
    }
  } catch {}

  // 4. Projection Drift & Authority
  if (!queryBackend.isReady() || !fs.existsSync(storeDb)) {
    projectionDrift = true;
    state = "RED";
  } else {
    try {
      const allArtifacts = await queryBackend.findArtifacts();
      const fsArtifacts = fs.existsSync(artifactsDir)
        ? fs.readdirSync(artifactsDir).filter((f) => f.endsWith(".json"))
        : [];
      // Simple length check for drift
      if (allArtifacts.length !== fsArtifacts.length) {
        projectionDrift = true;
        state = "RED";
      }
    } catch {
      projectionDrift = true;
      state = "RED";
    }
  }

  // 5. Rotation Status
  try {
    const archiveDir = path.join(hd, "telemetry", "archive");
    if (fs.existsSync(archiveDir)) {
      rotatedSegments = fs
        .readdirSync(archiveDir)
        .filter((f) => f.endsWith(".jsonl")).length;
    }
  } catch {}

  const warnings: string[] = [];
  if (lockStatus !== "OK")
    warnings.push("Stale or ambiguous lock files detected in workspace.");
  if (projectionDrift)
    warnings.push("Projection store.db drift detected or is not synced.");
  if (jsonlCorrupt) warnings.push("Event stream logs are corrupt.");

  return c.json({
    state,
    lastReconciliationTime: now, // Simplification: we assume API time is reconciliation time if it's polling
    projectionDriftStatus: projectionDrift ? "STALE" : "SYNCED",
    appendStreamHealth: jsonlCorrupt ? "CORRUPT" : "HEALTHY",
    lockStatus,
    rotatedSegmentStatus: `${rotatedSegments} segments archived`,
    currentRuntimeContractMode: "STRICT_CANONICAL",
    anomalyCount,
    apiConnected: true,
    workspaceRoot: rootDir,
    hardkasDirExists,
    artifactsDirExists,
    semanticBundleExists,
    warnings
  });
});
