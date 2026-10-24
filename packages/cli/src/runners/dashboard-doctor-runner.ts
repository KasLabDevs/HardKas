import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import pc from "picocolors";
import { UI } from "../ui.js";
import { HardkasSchemas } from "@hardkas/artifacts";

// SA-2 (SECURITY-AUDIT-1, 2026-10-21): the dashboard listens on 127.0.0.1 only and its API requires the session token of
// the page it serves; the doctor reads that token from the page, as the dashboard's own UI does.
const DASHBOARD_URL = "http://127.0.0.1:3333";

function httpGet(url: string, headers: Record<string, string> = {}): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    http
      .get(url, { timeout: 2000, headers }, (res) => {
        let rawData = "";
        res.on("data", (chunk) => {
          rawData += chunk;
        });
        res.on("end", () => resolve({ status: res.statusCode ?? 0, body: rawData }));
      })
      .on("error", (e) => reject(e))
      .on("timeout", () => reject(new Error("Request timed out")));
  });
}

let dashboardToken: string | undefined;
async function sessionToken(): Promise<string> {
  if (dashboardToken) return dashboardToken;
  const page = await httpGet(`${DASHBOARD_URL}/`);
  const token = /__HARDKAS_DEV_TOKEN__\s*=\s*"([0-9a-f]{64})"/.exec(page.body)?.[1];
  if (!token) throw new Error(`the dashboard page carries no session token (HTTP status ${page.status})`);
  dashboardToken = token;
  return token;
}

// Helper to fetch JSON from the dashboard API, with the session token
function fetchJson(url: string): Promise<any> {
  return new Promise((resolve, reject) => {
    sessionToken()
      .then((token) => httpGet(url, { Authorization: `Bearer ${token}` }))
      .then((res) => {
        if (res.status !== 200) {
          reject(new Error(`HTTP status ${res.status}`));
          return;
        }
        try {
          resolve(JSON.parse(res.body));
        } catch (e) {
          reject(e);
        }
      })
      .catch(reject);
  });
}

function hardkasDir(): string {
  return path.join(process.cwd(), ".hardkas");
}

function bundlePath(): string {
  return path.join(process.cwd(), "hardkas.semantic-bundle.v1.json");
}

export interface DashboardCheck {
  name: string;
  status: "success" | "warning" | "error";
  message?: string;
  source?: string;
}

export async function runDashboardDoctor() {
  const checks: DashboardCheck[] = [];
  let apiRunning = false;
  let hasWarnings = false;
  let hasErrors = false;

  const now = new Date().toISOString();

  // Aesthetic title banner
  console.log(pc.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(pc.bold(`HardKAS • Semantic Dashboard Diagnostic Doctor`));
  console.log(pc.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

  UI.info("Step 1: Checking Dashboard API Connection...");

  // Check 1: API Server ping
  try {
    const health = await fetchJson("http://127.0.0.1:3333/api/dashboard-health");
    apiRunning = true;
    checks.push({
      name: "Dashboard API Server",
      status: "success",
      message: `Running at http://127.0.0.1:3333 (Active workspace: ${health.workspaceRoot})`
    });
  } catch (e: unknown) {
    checks.push({
      name: "Dashboard API Server",
      status: "error",
      message: `Offline/unreachable at http://127.0.0.1:3333 (Reason: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))})`
    });
    hasErrors = true;
  }

  // Check 2: Endpoint validations (if API is online)
  if (apiRunning) {
    UI.info("Step 2: Validating active API endpoints...");
    const endpoints = [
      { name: "Truth Status (/api/status)", path: "http://127.0.0.1:3333/api/status" },
      { name: "Telemetry (/api/telemetry)", path: "http://127.0.0.1:3333/api/telemetry" },
      { name: "Replay (/api/replay)", path: "http://127.0.0.1:3333/api/replay" },
      {
        name: "Causal Lineage (/api/lineage)",
        path: "http://127.0.0.1:3333/api/lineage"
      },
      {
        name: "Quarantine (/api/quarantine)",
        path: "http://127.0.0.1:3333/api/quarantine"
      },
      {
        name: "Semantic Bundles (/api/bundles)",
        path: "http://127.0.0.1:3333/api/bundles"
      }
    ];

    for (const ep of endpoints) {
      try {
        const payload = await fetchJson(ep.path);
        const sourceLabel = payload.source ? `[Source: ${payload.source}]` : "";
        if (payload.loaded === false) {
          checks.push({
            name: ep.name,
            status: "warning",
            message: `Awaiting real-data initialization ${sourceLabel}`
          });
          hasWarnings = true;
        } else {
          checks.push({
            name: ep.name,
            status: "success",
            message: `Active and operational ${sourceLabel}`
          });
        }
      } catch (e: unknown) {
        checks.push({
          name: ep.name,
          status: "error",
          message: `Divergent or broken payload: ${((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e))}`
        });
        hasErrors = true;
      }
    }
  }

  // Check 3: Workspace Files Verification
  UI.info("Step 3: Conducting Workspace Integrity Analysis...");

  // Workspace folder
  const hkDir = hardkasDir();
  const dirExists = fs.existsSync(hkDir);
  checks.push({
    name: ".hardkas directory",
    status: dirExists ? "success" : "error",
    message: dirExists ? "Exists and initialized" : "Missing - Workspace not initialized"
  });
  if (!dirExists) hasErrors = true;

  if (dirExists) {
    // semantic bundle check
    const bundleExists = fs.existsSync(bundlePath());
    checks.push({
      name: "Semantic Bundle File",
      status: bundleExists ? "success" : "warning",
      message: bundleExists
        ? "hardkas.semantic-bundle.v1.json exists"
        : "Missing - Awaiting first verification cycle"
    });
    if (!bundleExists) hasWarnings = true;

    const telemPath = path.join(hkDir, "telemetry", "telemetry.jsonl");
    const telemExists = fs.existsSync(telemPath);
    if (!telemExists) {
      checks.push({
        name: "Telemetry Log",
        status: "warning",
        message: "Missing - Telemetry pressure not initialized"
      });
      hasWarnings = true;
    } else {
      try {
        const raw = fs.readFileSync(telemPath, "utf-8").trim();
        if (!raw) {
          checks.push({
            name: "Telemetry Log",
            status: "success",
            message: "telemetry.jsonl exists but has no events recorded yet"
          });
        } else {
          const lines = raw.split("\n");
          let validCount = 0;
          let invalidCount = 0;
          const runs = new Set<string>();

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            try {
              const event = JSON.parse(trimmed);
              const hasMandatoryKeys =
                event.schemaVersion === HardkasSchemas.TelemetryV1 &&
                event.eventId &&
                event.eventHash &&
                event.timestamp &&
                event.source &&
                event.runId &&
                event.bucket &&
                event.type &&
                event.severity &&
                event.payload !== undefined;

              if (hasMandatoryKeys) {
                validCount++;
                runs.add(event.runId);
              } else {
                invalidCount++;
              }
            } catch {
              invalidCount++;
            }
          }

          if (invalidCount > 0) {
            checks.push({
              name: "Telemetry Log",
              status: "error",
              message: `Corrupted - telemetry.jsonl has ${invalidCount} schema violations or parse issues!`
            });
            hasErrors = true;
          } else {
            checks.push({
              name: "Telemetry Log",
              status: "success",
              message: `Healthy - Verified ${validCount} events across ${runs.size} active run(s) [v1 Contract]`
            });
          }
        }
      } catch (err: unknown) {
        checks.push({
          name: "Telemetry Log",
          status: "error",
          message: `Read Error - Failed to scan telemetry file: ${((err instanceof Error) ? ((err instanceof Error) ? err.message : String(err)) : String(err))}`
        });
        hasErrors = true;
      }
    }

    // query store check
    const dbExists = fs.existsSync(path.join(hkDir, "store.db"));
    checks.push({
      name: "Query Store Index",
      status: dbExists ? "success" : "warning",
      message: dbExists
        ? "store.db is active"
        : "Missing - SQLite index database not found"
    });
    if (!dbExists) hasWarnings = true;

    // quarantine folder check
    const qExists = fs.existsSync(path.join(hkDir, "quarantine"));
    checks.push({
      name: "Quarantine Directory",
      status: qExists ? "success" : "warning",
      message: qExists
        ? "quarantine/ is active"
        : "Missing - quarantine/ directory not found"
    });
    if (!qExists) hasWarnings = true;
  }

  // Display results list
  console.log(pc.bold("\nDiagnostic Checklist:"));
  console.log("─────────────────────────────────────────────────");
  for (const check of checks) {
    const icon =
      check.status === "success"
        ? pc.green("  ✓ ")
        : check.status === "warning"
          ? pc.yellow("  ⚠ ")
          : pc.red("  ✗ ");
    const nameStr = pc.bold(check.name.padEnd(30));
    console.log(`${icon}${nameStr} ${check.message}`);
  }
  console.log("─────────────────────────────────────────────────");

  // Output Status Summary
  let finalStatusText = pc.green("✓ HEALTHY");
  if (hasErrors) {
    finalStatusText = pc.red("✗ FAILED");
  } else if (hasWarnings) {
    finalStatusText = pc.yellow("⚠ INCOMPLETE (AWAITING INITIALIZATION)");
  }

  console.log(`\n${pc.bold("Overall Status:")} ${finalStatusText}`);

  // Suggestions/Fix recommendations
  if (hasErrors || hasWarnings) {
    console.log(`\n${pc.bold("Recovery Suggestions:")}`);

    if (checks.some((c) => c.name === "Dashboard API Server" && c.status === "error")) {
      console.log(
        `  - ${pc.white("Start the API:")} Run '${pc.cyan("pnpm --filter @hardkas/cli run dev dashboard")}' or '${pc.cyan("hardkas dashboard")}' in your terminal.`
      );
    }

    if (checks.some((c) => c.name === "Semantic Bundle File" && c.status === "warning")) {
      console.log(
        `  - ${pc.white("Generate Bundle:")} Run '${pc.cyan("pnpm hardkas verify-semantics --ci-mode")}' to generate a semantic-bundle and verify causal invariants.`
      );
    }

    if (checks.some((c) => c.name === "Telemetry Log" && c.status === "warning")) {
      console.log(
        `  - ${pc.white("Initialize Telemetry:")} Run a simulation or torture matrix using '${pc.cyan("pnpm hardkas torture")}' to populate runtime logs.`
      );
    }

    if (checks.some((c) => c.name === "Query Store Index" && c.status === "warning")) {
      console.log(
        `  - ${pc.white("Rebuild Index:")} Run '${pc.cyan("pnpm hardkas query store rebuild")}' to populate SQLite projection storage.`
      );
    }

    if (checks.some((c) => c.name === ".hardkas directory" && c.status === "error")) {
      console.log(
        `  - ${pc.white("Initialize Workspace:")} Run '${pc.cyan("pnpm hardkas init")}' to construct the .hardkas folder layout.`
      );
    }
  }
  console.log("");
}
