/**
 * HardKAS Observability Event System.
 *
 * Append-only event log for operational observability.
 * Events are emitted by subsystems (localnet, RPC, artifacts, replay).
 * The query layer only READS events. It never writes them.
 *
 * Storage: .hardkas/events.jsonl (one JSON event per line)
 */
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";

import { 
  coreEvents, 
  type EventEnvelope as ObsEvent,
  type EventKind as ObsEventKind
} from "@hardkas/core";

// Specific event interfaces are now in @hardkas/core

// ---------------------------------------------------------------------------
// Event Writer — fire-and-forget, append-only
// ---------------------------------------------------------------------------

export function getEventsPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ".hardkas", "events.jsonl");
}

/**
 * Appends an event to the events.jsonl log.
 * Fire-and-forget: errors are silently swallowed.
 * Events are NOT correctness-critical — they are observability only.
 */
export function emitEvent(event: ObsEvent, options?: { cwd?: string }): void {
  const filePath = getEventsPath(options?.cwd);
  const dir = path.dirname(filePath);

  try {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(filePath, JSON.stringify(event) + "\n", "utf-8");
  } catch {
    // Fire-and-forget. Observability must not break the workflow.
  }
}

/**
 * Async variant for contexts where fire-and-forget would lose data.
 */
export async function emitEventAsync(event: ObsEvent, options?: { cwd?: string }): Promise<void> {
  const filePath = getEventsPath(options?.cwd);
  const dir = path.dirname(filePath);

  try {
    if (!fs.existsSync(dir)) {
      await fsp.mkdir(dir, { recursive: true });
    }
    await fsp.appendFile(filePath, JSON.stringify(event) + "\n", "utf-8");
  } catch {
    // Observability must not break the workflow.
  }
}


let isLoggingStarted = false;

/**
 * Subscribes to the @hardkas/core event bus and appends events to the JSONL log.
 */
export function startEventLogging(options?: { cwd?: string }): void {
  if (isLoggingStarted) return;
  isLoggingStarted = true;

  coreEvents.on((event) => {
    // Re-emit to the local log
    emitEvent(event as any, options);
  });
}

// ---------------------------------------------------------------------------
// Event Reader
// ---------------------------------------------------------------------------

export interface EventReadOptions {
  cwd?: string | undefined;
  since?: string | undefined;     // ISO 8601 timestamp
  kind?: ObsEventKind | ObsEventKind[] | undefined;
  limit?: number | undefined;
}

/**
 * Reads events from the events.jsonl log.
 * Returns newest-first by default.
 */
export async function readEvents(options?: EventReadOptions): Promise<ObsEvent[]> {
  const filePath = getEventsPath(options?.cwd);

  let content: string;
  try {
    content = await fsp.readFile(filePath, "utf-8");
  } catch {
    return [];
  }

  const lines = content.trim().split("\n").filter(Boolean);
  const events: ObsEvent[] = [];

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as ObsEvent;

      // Filter by since
      if (options?.since && event.timestamp < options.since) continue;

      // Filter by kind
      if (options?.kind) {
        const kinds = Array.isArray(options.kind) ? options.kind : [options.kind];
        if (!kinds.includes(event.kind)) continue;
      }

      events.push(event);
    } catch {
      // Skip malformed lines
    }
  }

  // Newest first
  events.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

  // Apply limit
  if (options?.limit && events.length > options.limit) {
    return events.slice(0, options.limit);
  }

  return events;
}

/**
 * Prune events older than the given timestamp.
 * Rewrites the file (safe: reads all, filters, writes back).
 */
export async function pruneEvents(olderThan: string, options?: { cwd?: string }): Promise<number> {
  const filePath = getEventsPath(options?.cwd);

  let content: string;
  try {
    content = await fsp.readFile(filePath, "utf-8");
  } catch {
    return 0;
  }

  const lines = content.trim().split("\n").filter(Boolean);
  const kept: string[] = [];
  let pruned = 0;

  for (const line of lines) {
    try {
      const event = JSON.parse(line) as ObsEvent;
      if (event.timestamp < olderThan) {
        pruned++;
      } else {
        kept.push(line);
      }
    } catch {
      // Keep malformed lines (don't destroy data)
      kept.push(line);
    }
  }

  await fsp.writeFile(filePath, kept.join("\n") + (kept.length > 0 ? "\n" : ""), "utf-8");
  return pruned;
}
