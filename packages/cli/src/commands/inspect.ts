import { Command } from "commander";
import path from "node:path";
import fs from "node:fs/promises";
import pc from "picocolors";
import { handleError, UI } from "../ui.js";
import { TelemetryRotator } from "@hardkas/core";

export function registerInspectCommand(program: Command) {
  program
    .command("inspect")
    .description(`Inspect stream sizes and archive segments ${UI.maturity("beta")}`)
    .option("--json", "Output results as stable JSON schema", false)
    .action(async (opts) => {
      try {
        await runInspect(opts);
      } catch (err) {
        handleError(err);
      }
    });
}

async function runInspect(opts: { json?: boolean }) {
  if (opts.json) UI.setJsonMode(true);

  if (!opts.json) {
    UI.box("HardKAS Inspect", "Stream Analytics");
  }

  const rootDir = process.cwd();
  
  const report: any = {
    streams: {},
    archives: []
  };

  const getFileSize = async (filePath: string) => {
    try {
      const stats = await fs.stat(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
  };

  const eventsPath = path.join(rootDir, "events.jsonl");
  const telemetryPath = path.join(rootDir, ".hardkas", "telemetry", "telemetry.jsonl");

  const eventsSize = await getFileSize(eventsPath);
  const telemetrySize = await getFileSize(telemetryPath);

  report.streams.events = eventsSize;
  report.streams.telemetry = telemetrySize;

  const segments = TelemetryRotator.listArchivedSegments(rootDir);
  for (const s of segments) {
    const sPath = path.join(rootDir, ".hardkas", "telemetry", "archive", s);
    report.archives.push({
      file: s,
      size: await getFileSize(sPath)
    });
  }

  if (opts.json) {
    UI.writeJson(report);
  } else {
    UI.logHuman(`Streams:`);
    UI.logHuman(`  Event Ledger: ${formatBytes(eventsSize)}`);
    UI.logHuman(`  Telemetry:    ${formatBytes(telemetrySize)}`);
    UI.divider();
    
    UI.logHuman(`Archived Telemetry Segments: ${report.archives.length}`);
    for (const archive of report.archives) {
      UI.logHuman(`  - ${archive.file} (${formatBytes(archive.size)})`);
    }
  }
}
