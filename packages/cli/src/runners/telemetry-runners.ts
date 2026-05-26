import fs from "node:fs";
import path from "node:path";
import pc from "picocolors";
import { UI } from "../ui.js";

function telemetryPath(): string {
  return path.join(process.cwd(), ".hardkas", "telemetry", "telemetry.jsonl");
}

function tryReadJsonl(p: string): { events: any[]; errorLine?: number; parseError?: string } {
  try {
    if (!fs.existsSync(p)) return { events: [] };
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
// Telemetry Inspect
// ---------------------------------------------------------------------------
export async function runTelemetryInspect(options: { limit: string }) {
  const p = telemetryPath();
  
  console.log(pc.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(pc.bold(`HardKAS • Telemetry Source Inspector`));
  console.log(pc.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

  if (!fs.existsSync(p)) {
    UI.warning(`No telemetry file found at ${p}`);
    console.log(`Run a chaos-matrix simulation to initialize telemetry:`);
    console.log(`  ${pc.cyan("pnpm hardkas torture matrix")}\n`);
    return;
  }

  const stat = fs.statSync(p);
  const { events, errorLine, parseError } = tryReadJsonl(p);

  console.log(`${pc.bold("File Details:")}`);
  console.log(`  Path:          ${p}`);
  console.log(`  Size:          ${(stat.size / 1024).toFixed(2)} KB`);
  console.log(`  Modified:      ${stat.mtime.toLocaleString()}`);
  console.log(`  Total Events:  ${events.length} lines`);
  
  if (parseError) {
    console.log(`  Status:        ${pc.red("CORRUPTED")} (Parse error on line ${errorLine}: ${parseError})`);
  } else {
    console.log(`  Status:        ${pc.green("VALID STREAM")}`);
  }

  if (events.length === 0) {
    console.log("\nNo telemetry events recorded yet.\n");
    return;
  }

  // Aggregate stats
  const runs = new Set<string>();
  const countsByType: Record<string, number> = {};
  const countsByBucket: Record<string, number> = {};
  const countsBySeverity: Record<string, number> = {};

  for (const ev of events) {
    if (ev.runId) runs.add(ev.runId);
    if (ev.type) countsByType[ev.type] = (countsByType[ev.type] || 0) + 1;
    if (ev.bucket) countsByBucket[ev.bucket] = (countsByBucket[ev.bucket] || 0) + 1;
    if (ev.severity) countsBySeverity[ev.severity] = (countsBySeverity[ev.severity] || 0) + 1;
  }

  console.log(`\n${pc.bold("Aggregated Execution Statistics:")}`);
  console.log(`  Active runs (runId): ${runs.size}`);
  
  console.log(`\n  ${pc.bold("Events by Type:")}`);
  for (const [type, count] of Object.entries(countsByType)) {
    console.log(`    - ${type.padEnd(28)} ${pc.cyan(count)}`);
  }

  console.log(`\n  ${pc.bold("Events by Bucket:")}`);
  for (const [bucket, count] of Object.entries(countsByBucket)) {
    console.log(`    - ${bucket.padEnd(28)} ${pc.cyan(count)}`);
  }

  console.log(`\n  ${pc.bold("Events by Severity:")}`);
  for (const [sev, count] of Object.entries(countsBySeverity)) {
    let color = pc.white;
    if (sev === "nominal") color = pc.green;
    if (sev === "elevated") color = pc.yellow;
    if (sev === "critical") color = pc.red;
    console.log(`    - ${sev.padEnd(28)} ${color(count)}`);
  }

  // Print recent events
  const limit = parseInt(options.limit, 10) || 5;
  const recent = events.slice(-limit);
  console.log(`\n${pc.bold(`Recent Events (Last ${recent.length}):`)}`);
  console.log("────────────────────────────────────────────────────────────────────────────────");
  for (const ev of recent) {
    const time = new Date(ev.timestamp).toLocaleTimeString();
    const caseStr = ev.caseId ? ` [${ev.caseId}]` : "";
    const sevColor = ev.severity === "critical" ? pc.red : ev.severity === "elevated" ? pc.yellow : pc.green;
    console.log(`  [${time}] ${sevColor(ev.severity.toUpperCase().padEnd(8))} [${ev.type}]${caseStr} - ${ev.payload?.flow || ev.details || "executed"}`);
  }
  console.log("────────────────────────────────────────────────────────────────────────────────\n");
}

// ---------------------------------------------------------------------------
// Telemetry Verify
// ---------------------------------------------------------------------------
export async function runTelemetryVerify() {
  const p = telemetryPath();
  
  console.log(pc.bold("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"));
  console.log(pc.bold(`HardKAS • Telemetry Source Schema Verifier`));
  console.log(pc.bold("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n"));

  if (!fs.existsSync(p)) {
    UI.error(`Verification FAILED: Telemetry file does not exist at ${p}`);
    process.exitCode = 1;
    return;
  }

  const raw = fs.readFileSync(p, "utf-8").trim();
  if (!raw) {
    UI.warning(`Telemetry file at ${p} is completely empty (Nominal status).`);
    return;
  }

  const lines = raw.split("\n");
  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;

    let event: any;
    try {
      event = JSON.parse(line);
    } catch (e: any) {
      console.log(`${pc.red("✗ Line " + (i + 1) + ":")} Invalid JSON structure (${e.message})`);
      console.log(`  Raw Content: ${pc.dim(line.slice(0, 100))}`);
      invalidCount++;
      continue;
    }

    // Verify Contract Schema v1
    const errors: string[] = [];
    if (event.schemaVersion !== "hardkas.telemetry.v1") {
      errors.push(`Invalid schemaVersion (Expected "hardkas.telemetry.v1", got "${event.schemaVersion}")`);
    }
    if (!event.eventId) errors.push(`Missing eventId`);
    if (!event.eventHash) errors.push(`Missing eventHash`);
    if (!event.timestamp) errors.push(`Missing timestamp`);
    if (!event.source) errors.push(`Missing source`);
    if (!event.runId) errors.push(`Missing runId`);
    if (!event.bucket) errors.push(`Missing bucket`);
    if (!event.type) errors.push(`Missing type`);
    if (!event.severity) {
      errors.push(`Missing severity`);
    } else if (!["nominal", "elevated", "critical", "inactive"].includes(event.severity)) {
      errors.push(`Invalid severity level "${event.severity}"`);
    }
    if (event.payload === undefined) errors.push(`Missing payload`);

    if (errors.length > 0) {
      console.log(`${pc.red("✗ Line " + (i + 1) + ":")} Schema violation`);
      for (const err of errors) {
        console.log(`    - ${err}`);
      }
      invalidCount++;
    } else {
      validCount++;
    }
  }

  console.log("\nVerification Summary:");
  console.log("─────────────────────────────────────────────────");
  console.log(`  Valid events checked:   ${pc.green(validCount)}`);
  console.log(`  Schema violations:      ${invalidCount > 0 ? pc.red(invalidCount) : pc.green(0)}`);
  console.log("─────────────────────────────────────────────────");

  if (invalidCount > 0) {
    UI.error(`Telemetry verification FAILED with ${invalidCount} schema violations.`);
    process.exitCode = 1;
  } else {
    UI.success("Telemetry verification PASSED. Stream strictly complies with Telemetry Source Contract v1.");
  }
  console.log("");
}

// ---------------------------------------------------------------------------
// Telemetry Tail (Optional)
// ---------------------------------------------------------------------------
export async function runTelemetryTail(options: { follow: boolean; lines: string }) {
  const p = telemetryPath();
  
  if (!fs.existsSync(p)) {
    UI.error(`Telemetry file does not exist at ${p}`);
    process.exitCode = 1;
    return;
  }

  const printTail = (linesCount: number) => {
    const { events } = tryReadJsonl(p);
    const subset = events.slice(-linesCount);
    for (const ev of subset) {
      const time = new Date(ev.timestamp).toLocaleTimeString();
      const caseStr = ev.caseId ? ` [${ev.caseId}]` : "";
      const sevColor = ev.severity === "critical" ? pc.red : ev.severity === "elevated" ? pc.yellow : pc.green;
      console.log(`[${time}] ${sevColor(ev.severity.toUpperCase().padEnd(8))} [${ev.type}]${caseStr} - ${ev.payload?.flow || ev.details || "event"}`);
    }
  };

  const count = parseInt(options.lines, 10) || 20;
  printTail(count);

  if (options.follow) {
    UI.info("\nTailing telemetry stream (Press Ctrl+C to exit)...");
    let lastSize = fs.statSync(p).size;
    
    fs.watchFile(p, { interval: 500 }, (curr) => {
      if (curr.size > lastSize) {
        const fd = fs.openSync(p, "r");
        const buffer = Buffer.alloc(curr.size - lastSize);
        fs.readSync(fd, buffer, 0, buffer.length, lastSize);
        fs.closeSync(fd);
        lastSize = curr.size;

        const chunk = buffer.toString("utf-8").trim();
        if (chunk) {
          const lines = chunk.split("\n");
          for (const line of lines) {
            if (!line.trim()) continue;
            try {
              const ev = JSON.parse(line);
              const time = new Date(ev.timestamp).toLocaleTimeString();
              const caseStr = ev.caseId ? ` [${ev.caseId}]` : "";
              const sevColor = ev.severity === "critical" ? pc.red : ev.severity === "elevated" ? pc.yellow : pc.green;
              console.log(`[${time}] ${sevColor(ev.severity.toUpperCase().padEnd(8))} [${ev.type}]${caseStr} - ${ev.payload?.flow || ev.details || "event"}`);
            } catch {
              // skip unparsed line
            }
          }
        }
      }
    });
  }
}
