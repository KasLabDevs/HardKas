import Database from "better-sqlite3";

import type { Database as BetterSqliteDatabase } from "better-sqlite3";

export function initializeDatabase(path: string = ":memory:"): BetterSqliteDatabase {
  const db = new Database(path);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS projection_state (
      txId TEXT NOT NULL,
      indexInTransaction INTEGER NOT NULL,
      address TEXT NOT NULL,
      amount TEXT NOT NULL,
      scriptPublicKey TEXT NOT NULL,
      isSpent BOOLEAN DEFAULT 0,
      PRIMARY KEY (txId, indexInTransaction)
    );

    CREATE TABLE IF NOT EXISTS checkpoint_cursor (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      virtualDaaScore TEXT NOT NULL,
      virtualParentHashes TEXT NOT NULL,
      anchorHash TEXT NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS processed_events (
      semanticKey TEXT PRIMARY KEY,
      eventType TEXT NOT NULL,
      processedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      envelopeId TEXT,
      eventType TEXT NOT NULL,
      semanticKey TEXT NOT NULL,
      removedHashes TEXT,
      addedHashes TEXT,
      acceptedTxIds TEXT,
      projectionMutation TEXT,
      cursorBefore TEXT,
      cursorAfter TEXT,
      wasNoop BOOLEAN DEFAULT 0,
      processedAt INTEGER NOT NULL
    );
  `);

  return db;
}
