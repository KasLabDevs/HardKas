import fs from "node:fs";
import path from "node:path";
import { coreEvents, type EventEnvelope } from "@hardkas/core";

export interface LedgerAppenderOptions {
  cwd?: string;
}

let appenderUnsubscribe: (() => void) | null = null;

/**
 * Attaches a listener to the core in-memory event bus to persist
 * all emitted events to the deterministic event ledger (.hardkas/events.jsonl).
 */
export function attachLedgerAppender(options: LedgerAppenderOptions = {}): () => void {
  // Prevent duplicate attachments in the same process
  if (appenderUnsubscribe) {
    return appenderUnsubscribe;
  }

  const cwd = options.cwd || process.cwd();
  const hardkasDir = path.join(cwd, ".hardkas");
  const ledgerPath = path.join(hardkasDir, "events.jsonl");

  // Ensure directory exists
  if (!fs.existsSync(hardkasDir)) {
    fs.mkdirSync(hardkasDir, { recursive: true });
  }

  const listener = (event: EventEnvelope) => {
    try {
      const line = JSON.stringify(event) + "\n";
      fs.appendFileSync(ledgerPath, line, "utf-8");
    } catch (e) {
      // Intentionally swallow errors so the appender doesn't crash the main process.
      // But in dev mode, we might want to log it.
      if (process.env.DEBUG) {
        console.error("Failed to append event to ledger:", e);
      }
    }
  };

  appenderUnsubscribe = coreEvents.on(listener);
  return appenderUnsubscribe;
}

/**
 * Detaches the current ledger appender if attached.
 */
export function detachLedgerAppender() {
  if (appenderUnsubscribe) {
    appenderUnsubscribe();
    appenderUnsubscribe = null;
  }
}
