import Database from "better-sqlite3";

export function initializeDatabase(path: string = ":memory:") {
  const db = new Database(path);
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS projection_state (
      txId TEXT NOT NULL,
      indexInTransaction INTEGER NOT NULL,
      address TEXT NOT NULL,
      amount INTEGER NOT NULL,
      scriptPublicKey TEXT NOT NULL,
      isSpent BOOLEAN DEFAULT 0,
      PRIMARY KEY (txId, indexInTransaction)
    );

    CREATE TABLE IF NOT EXISTS checkpoint_cursor (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      lastDaaScore INTEGER NOT NULL,
      lastBlockHash TEXT
    );

    CREATE TABLE IF NOT EXISTS processed_events (
      eventId TEXT PRIMARY KEY,
      processedAt INTEGER NOT NULL
    );
  `);

  return db;
}
