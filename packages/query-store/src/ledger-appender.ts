import path from "node:path";
import { attachLedgerAppender as attachWorkspaceLedgerAppender } from "@hardkas/core";

export interface LedgerAppenderOptions {
  cwd?: string;
}

let appenderUnsubscribe: (() => void) | null = null;

/**
 * @deprecated WORKSPACE-AUTHORITY-1 (A2): a workspace has ONE event ledger, `<root>/events.jsonl`, and one writer for it,
 * `@hardkas/core`'s `attachLedgerAppender`. This entry point (never used by HardKAS itself) used to write a second ledger
 * under `.hardkas/events.jsonl`; it is kept only so its importers keep working, and it attaches that same writer.
 */
export function attachLedgerAppender(options: LedgerAppenderOptions = {}): () => void {
  // Prevent duplicate attachments in the same process
  if (appenderUnsubscribe) {
    return appenderUnsubscribe;
  }
  appenderUnsubscribe = attachWorkspaceLedgerAppender(path.resolve(options.cwd || process.cwd()));
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
