import fs from "node:fs";
import path from "node:path";
import { UI } from "../ui.js";
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hardkasDir() {
    return path.join(process.cwd(), ".hardkas");
}
function bundlePath() {
    return path.join(process.cwd(), "hardkas.semantic-bundle.v1.json");
}
function tryReadJson(p) {
    try {
        if (!fs.existsSync(p))
            return null;
        return JSON.parse(fs.readFileSync(p, "utf-8"));
    }
    catch {
        return null;
    }
}
function tryReadJsonl(p) {
    try {
        if (!fs.existsSync(p))
            return null;
        const raw = fs.readFileSync(p, "utf-8").trim();
        if (!raw)
            return { events: [] };
        const lines = raw.split("\n");
        const events = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (!line)
                continue;
            try {
                events.push(JSON.parse(line));
            }
            catch (err) {
                return {
                    events,
                    errorLine: i + 1,
                    parseError: err.message
                };
            }
        }
        return { events };
    }
    catch (e) {
        return { events: [], parseError: e.message };
    }
}
// ---------------------------------------------------------------------------
// /api/status – Real artifact truth statuses
// ---------------------------------------------------------------------------
function handleStatus(_url, res) {
    const now = new Date().toISOString();
    // Priority 1: semantic bundle
    const bundle = tryReadJson(bundlePath());
    if (bundle && bundle.artifacts && Array.isArray(bundle.artifacts)) {
        const artifacts = bundle.artifacts.map((a) => ({
            artifactId: a.artifactId,
            canonicalStatus: "REPLAY_VERIFIED",
            semanticHash: a.semanticHash,
            lineageEdges: a.lineageEdges || [],
            source: "semantic-bundle"
        }));
        res.writeHead(200);
        res.end(JSON.stringify({
            loaded: true,
            source: "hardkas.semantic-bundle.v1.json",
            loadedAt: now,
            artifacts
        }));
        return;
    }
    // Priority 2: query-store (check if store.db exists)
    const storePath = path.join(hardkasDir(), "store.db");
    if (fs.existsSync(storePath)) {
        // We cannot query SQLite here without a dependency, so we report it exists
        res.writeHead(200);
        res.end(JSON.stringify({
            loaded: true,
            source: "query-store/store.db",
            sourceNote: "Query-store exists but direct SQLite reading is not available in the dashboard API. Use CLI verify-semantics for full projection.",
            loadedAt: now,
            artifacts: []
        }));
        return;
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
                semanticHash: content?.hash || null,
                source: "artifacts-fallback",
                sourceNote: "Raw filesystem truth. Not replay-verified."
            };
        });
        res.writeHead(200);
        res.end(JSON.stringify({
            loaded: true,
            source: ".hardkas/artifacts (fallback)",
            sourceNote: "PROJECTED / UNVERIFIED – no replay proof available.",
            loadedAt: now,
            artifacts
        }));
        return;
    }
    // Nothing found
    res.writeHead(200);
    res.end(JSON.stringify({
        loaded: false,
        source: "none",
        loadedAt: now,
        artifacts: [],
        message: "No canonical artifacts found in current workspace."
    }));
}
// ---------------------------------------------------------------------------
// /api/telemetry – Real telemetry from .hardkas/telemetry/telemetry.jsonl
// ---------------------------------------------------------------------------
function handleTelemetry(_url, res) {
    const now = new Date().toISOString();
    const telemetryFile = path.join(hardkasDir(), "telemetry", "telemetry.jsonl");
    const eventsFile = path.join(hardkasDir(), "events.jsonl");
    // Priority 1: telemetry.jsonl
    if (fs.existsSync(telemetryFile)) {
        const parsed = tryReadJsonl(telemetryFile);
        if (parsed === null) {
            res.writeHead(200);
            res.end(JSON.stringify({
                loaded: false,
                source: ".hardkas/telemetry/telemetry.jsonl",
                loadedAt: now,
                message: "Telemetry file exists but could not be parsed.",
                totalAnomalies: 0,
                countsByType: {},
                countsByBucket: {},
                recentEvents: [],
                recoveryAction: "Run a schema verification check to audit the telemetry event stream log:",
                recoveryCommand: "pnpm hardkas telemetry verify"
            }));
            return;
        }
        const { events, parseError, errorLine } = parsed;
        if (parseError) {
            res.writeHead(200);
            res.end(JSON.stringify({
                loaded: false,
                source: ".hardkas/telemetry/telemetry.jsonl",
                loadedAt: now,
                message: `Telemetry schema or parse issue (line ${errorLine}: ${parseError}).`,
                totalAnomalies: events.length,
                countsByType: {},
                countsByBucket: {},
                recentEvents: [],
                recoveryAction: "Examine and repair the stream schema violation utilizing telemetry verify command:",
                recoveryCommand: "pnpm hardkas telemetry verify"
            }));
            return;
        }
        if (events.length === 0) {
            res.writeHead(200);
            res.end(JSON.stringify({
                loaded: true,
                source: ".hardkas/telemetry/telemetry.jsonl",
                loadedAt: now,
                message: "Telemetry file exists but no events recorded.",
                totalAnomalies: 0,
                countsByType: {},
                countsByBucket: {},
                recentEvents: [],
                recoveryAction: "stress-test locks, trigger concurrent executions, and track performance anomalies by running the chaos-matrix suite:",
                recoveryCommand: "pnpm hardkas torture matrix"
            }));
            return;
        }
        const countsByType = {};
        const countsByBucket = {};
        for (const ev of events) {
            const t = ev.type || ev.kind || ev.anomalyType || "unknown";
            countsByType[t] = (countsByType[t] || 0) + 1;
            if (ev.bucket) {
                countsByBucket[ev.bucket] = (countsByBucket[ev.bucket] || 0) + 1;
            }
        }
        res.writeHead(200);
        res.end(JSON.stringify({
            loaded: true,
            source: ".hardkas/telemetry/telemetry.jsonl",
            loadedAt: now,
            totalAnomalies: events.length,
            countsByType,
            countsByBucket,
            recentEvents: events.slice(-50)
        }));
        return;
    }
    // No telemetry.jsonl – check if events.jsonl exists as fallback info
    const eventsExist = fs.existsSync(eventsFile);
    res.writeHead(200);
    res.end(JSON.stringify({
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
        recoveryAction: "stress-test locks, trigger concurrent executions, and track performance anomalies by running the chaos-matrix suite:",
        recoveryCommand: "pnpm hardkas torture matrix"
    }));
}
// ---------------------------------------------------------------------------
// /api/replay – Replay verification status
// ---------------------------------------------------------------------------
function handleReplay(_url, res) {
    const now = new Date().toISOString();
    const bundle = tryReadJson(bundlePath());
    const reportsDir = path.join(hardkasDir(), "reports");
    const reportsExist = fs.existsSync(reportsDir);
    if (bundle) {
        res.writeHead(200);
        res.end(JSON.stringify({
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
            statusSummary: bundle.statusSummary || {}
        }));
        return;
    }
    if (reportsExist) {
        const reportFiles = fs.readdirSync(reportsDir).filter((f) => f.endsWith(".json"));
        res.writeHead(200);
        res.end(JSON.stringify({
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
            recoveryCommand: "pnpm hardkas verify-semantics --ci-mode"
        }));
        return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({
        loaded: false,
        source: "none",
        loadedAt: now,
        replayAvailable: false,
        message: "No replay report found. Run pnpm hardkas verify-semantics --ci-mode.",
        commandSuggestion: "pnpm hardkas verify-semantics --ci-mode",
        recoveryAction: "To verify and compile your semantic replay proof:",
        recoveryCommand: "pnpm hardkas verify-semantics --ci-mode"
    }));
}
// ---------------------------------------------------------------------------
// /api/lineage – Lineage graph from bundle / artifacts
// ---------------------------------------------------------------------------
function handleLineage(_url, res) {
    const now = new Date().toISOString();
    // Priority 1: semantic bundle
    const bundle = tryReadJson(bundlePath());
    if (bundle && bundle.artifacts && Array.isArray(bundle.artifacts)) {
        const nodes = [];
        const edges = [];
        const seen = new Set();
        for (const a of bundle.artifacts) {
            if (!seen.has(a.artifactId)) {
                seen.add(a.artifactId);
                nodes.push({
                    id: a.artifactId,
                    data: { label: a.artifactId, semanticHash: a.semanticHash },
                    position: { x: 0, y: 0 } // layout computed on frontend
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
        // Detect orphans (nodes with no incoming or outgoing edges)
        const connectedIds = new Set();
        for (const e of edges) {
            connectedIds.add(e.source);
            connectedIds.add(e.target);
        }
        const orphanNodes = nodes.filter((n) => !connectedIds.has(n.id)).map((n) => n.id);
        res.writeHead(200);
        res.end(JSON.stringify({
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
        }));
        return;
    }
    // Priority 2: query-store
    const storePath = path.join(hardkasDir(), "store.db");
    if (fs.existsSync(storePath)) {
        res.writeHead(200);
        res.end(JSON.stringify({
            loaded: true,
            source: "query-store/store.db",
            sourceNote: "Query-store exists. Use CLI for full lineage query.",
            loadedAt: now,
            totalNodes: 0,
            totalEdges: 0,
            nodes: [],
            edges: []
        }));
        return;
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
        res.writeHead(200);
        res.end(JSON.stringify({
            loaded: true,
            source: ".hardkas/artifacts (fallback)",
            sourceNote: "PROJECTED / UNVERIFIED – raw filesystem scan, no lineage edges derived.",
            loadedAt: now,
            totalNodes: nodes.length,
            totalEdges: 0,
            orphanNodes: nodes.map((n) => n.id),
            nodes: nodes.slice(0, 200),
            edges: [],
            truncated: nodes.length > 200
        }));
        return;
    }
    res.writeHead(200);
    res.end(JSON.stringify({
        loaded: false,
        source: "none",
        loadedAt: now,
        message: "No lineage data available.",
        nodes: [],
        edges: []
    }));
}
// ---------------------------------------------------------------------------
// /api/quarantine – Real quarantine store
// ---------------------------------------------------------------------------
function handleQuarantine(_url, res) {
    const now = new Date().toISOString();
    const qPath = path.join(hardkasDir(), "quarantine");
    if (!fs.existsSync(qPath)) {
        res.writeHead(200);
        res.end(JSON.stringify({
            loaded: true,
            source: ".hardkas/quarantine",
            loadedAt: now,
            totalQuarantined: 0,
            items: [],
            message: "Quarantine directory does not exist.",
            recoveryAction: "Run verification checks to audit active schemas:",
            recoveryCommand: "pnpm hardkas artifact verify .hardkas/quarantine --recursive --strict"
        }));
        return;
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
    res.writeHead(200);
    res.end(JSON.stringify({
        loaded: true,
        source: ".hardkas/quarantine",
        loadedAt: now,
        totalQuarantined: items.length,
        items,
        recoveryAction: items.length > 0
            ? "To inspect and repair the isolated artifacts, execute a deep safety verification of the quarantine zone:"
            : undefined,
        recoveryCommand: items.length > 0
            ? "pnpm hardkas artifact verify .hardkas/quarantine --recursive --strict"
            : undefined
    }));
}
// ---------------------------------------------------------------------------
// /api/bundles – Enriched semantic bundle
// ---------------------------------------------------------------------------
function handleBundles(_url, res) {
    const now = new Date().toISOString();
    const bp = bundlePath();
    if (!fs.existsSync(bp)) {
        res.writeHead(200);
        res.end(JSON.stringify({
            loaded: false,
            source: "none",
            loadedAt: now,
            message: "No semantic bundle found. Run: pnpm hardkas verify-semantics --ci-mode"
        }));
        return;
    }
    const bundle = tryReadJson(bp);
    if (!bundle) {
        res.writeHead(200);
        res.end(JSON.stringify({
            loaded: false,
            source: "hardkas.semantic-bundle.v1.json",
            loadedAt: now,
            message: "Semantic bundle exists but could not be parsed."
        }));
        return;
    }
    const stat = fs.statSync(bp);
    res.writeHead(200);
    res.end(JSON.stringify({
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
    }));
}
// ---------------------------------------------------------------------------
// /api/dashboard-health – Self-check
// ---------------------------------------------------------------------------
function handleDashboardHealth(_url, res) {
    const now = new Date().toISOString();
    const hd = hardkasDir();
    const checks = {
        apiConnected: true,
        workspaceRoot: process.cwd(),
        hardkasDirExists: fs.existsSync(hd),
        queryStoreExists: fs.existsSync(path.join(hd, "store.db")),
        telemetryExists: fs.existsSync(path.join(hd, "telemetry", "telemetry.jsonl")),
        eventsExists: fs.existsSync(path.join(hd, "events.jsonl")),
        semanticBundleExists: fs.existsSync(bundlePath()),
        artifactsDirExists: fs.existsSync(path.join(hd, "artifacts")),
        quarantineDirExists: fs.existsSync(path.join(hd, "quarantine")),
        reportsDirExists: fs.existsSync(path.join(hd, "reports")),
        loadedAt: now,
        warnings: []
    };
    if (!checks.hardkasDirExists)
        checks.warnings.push("No .hardkas directory found. Run hardkas init.");
    if (!checks.semanticBundleExists)
        checks.warnings.push("No semantic bundle. Run: pnpm hardkas verify-semantics --ci-mode");
    if (!checks.telemetryExists)
        checks.warnings.push("No telemetry/telemetry.jsonl found. Telemetry panel will show empty state.");
    if (!checks.quarantineDirExists)
        checks.warnings.push("No quarantine directory found.");
    res.writeHead(200);
    res.end(JSON.stringify(checks));
}
// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------
export async function runDashboard() {
    UI.info("Starting HardKAS Semantic Observability Dashboard...");
    const port = 3333;
    // Use dynamic import for express and url to avoid overhead in other commands
    const express = (await import("express")).default;
    const { fileURLToPath } = await import("node:url");
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const app = express();
    app.use((req, res, next) => {
        res.setHeader("Access-Control-Allow-Origin", "*");
        res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
        if (req.method === "OPTIONS") {
            res.sendStatus(204);
            return;
        }
        next();
    });
    // API Routes
    app.get("/api/status", (req, res) => handleStatus(new URL(req.url, `http://localhost:${port}`), res));
    app.get("/api/telemetry", (req, res) => handleTelemetry(new URL(req.url, `http://localhost:${port}`), res));
    app.get("/api/replay", (req, res) => handleReplay(new URL(req.url, `http://localhost:${port}`), res));
    app.get("/api/lineage", (req, res) => handleLineage(new URL(req.url, `http://localhost:${port}`), res));
    app.get("/api/quarantine", (req, res) => handleQuarantine(new URL(req.url, `http://localhost:${port}`), res));
    app.get("/api/bundles", (req, res) => handleBundles(new URL(req.url, `http://localhost:${port}`), res));
    app.get("/api/dashboard-health", (req, res) => handleDashboardHealth(new URL(req.url, `http://localhost:${port}`), res));
    // Serve static UI. In dev, __dirname is src/runners. In prod, __dirname is dist.
    const isProd = __dirname.endsWith("dist");
    const distPath = isProd
        ? path.join(__dirname, "..", "dashboard-dist")
        : path.join(__dirname, "..", "..", "dashboard-dist");
    app.use(express.static(distPath));
    app.use((req, res) => {
        if (req.path.startsWith("/api/")) {
            res.status(404).json({ error: "Not found" });
        }
        else {
            const indexPath = path.join(distPath, "index.html");
            if (fs.existsSync(indexPath)) {
                res.sendFile(indexPath);
            }
            else {
                res
                    .status(404)
                    .send("Dashboard UI not built. Run 'pnpm build' in apps/dashboard.");
            }
        }
    });
    return new Promise((resolve, reject) => {
        const server = app.listen(port, () => {
            UI.success(`Dashboard API and UI running at http://localhost:${port}`);
            resolve(null);
        });
        server.on("error", (err) => {
            if (err.code === "EADDRINUSE") {
                UI.error(`Port ${port} is already in use.`);
                UI.info(`Try freeing the port or specify another one (if supported).`);
                process.exitCode = 1;
                resolve(null);
            }
            else {
                reject(err);
            }
        });
    });
}
//# sourceMappingURL=dashboard-runner.js.map