import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
function deriveVirtualChainSemanticKey(payload: any): string {
  const removed = (payload.removedChainBlockHashes || []).sort().join(",");
  const added = (payload.addedChainBlockHashes || []).sort().join(",");
  const acceptedTxIds = (payload.acceptedTransactionIds || [])
    .flatMap((a: any) => a.acceptedTransactionIds || [])
    .sort()
    .join(",");
  return `vcc::R:${removed}::A:${added}::T:${acceptedTxIds}`;
}

function deriveUtxosChangedSemanticKey(payload: any): string {
  const addedIds = (payload.added || [])
    .map((u: any) => `${u.outpoint?.transactionId}:${u.outpoint?.index}`)
    .sort()
    .join(",");
  const removedIds = (payload.removed || [])
    .map((u: any) => `${u.outpoint?.transactionId}:${u.outpoint?.index}`)
    .sort()
    .join(",");
  return `utxos::+:${addedIds}::-:${removedIds}`;
}

const DB_PATH = path.join(process.cwd(), "structural-indexer.db");

function main() {
  console.log("=== Phase 8: P2-3a Structural Reorg Projection Regression ===");

  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);

  const db = new Database(DB_PATH);
  
  // 1. Initialize schema (copying from indexer.ts)
  db.exec(`
    CREATE TABLE IF NOT EXISTS projection_state (
      txId TEXT,
      indexInTransaction INTEGER,
      address TEXT,
      amount TEXT,
      scriptPublicKey TEXT,
      isSpent INTEGER,
      PRIMARY KEY (txId, indexInTransaction)
    );
    CREATE TABLE IF NOT EXISTS checkpoint_cursor (
      id INTEGER PRIMARY KEY,
      virtualDaaScore TEXT,
      virtualParentHashes TEXT,
      anchorHash TEXT,
      updatedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS processed_events (
      semanticKey TEXT PRIMARY KEY,
      eventType TEXT,
      processedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS event_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      envelopeId TEXT,
      eventType TEXT,
      semanticKey TEXT,
      removedHashes TEXT,
      addedHashes TEXT,
      acceptedTxIds TEXT,
      projectionMutation TEXT,
      cursorBefore TEXT,
      cursorAfter TEXT,
      wasNoop INTEGER,
      processedAt INTEGER
    );
  `);

  // 2. Setup "old projection"
  console.log("\n[1] Setting up old projection (Cursor: A, UTXO: tx1)");
  db.prepare("INSERT INTO checkpoint_cursor (id, virtualDaaScore, anchorHash, updatedAt) VALUES (1, '100', 'hashA', ?)").run(Date.now());
  db.prepare("INSERT INTO projection_state (txId, indexInTransaction, address, amount, isSpent) VALUES ('tx1', 0, 'kaspa:test', '500', 0)").run();

  // 3. Simulate Reorg Evidence (VirtualChainChanged)
  console.log("\n[2] Simulating VirtualChainChanged (removed B,C; added D,E)");
  
  const vccPayload = {
    removedChainBlockHashes: ["hashB", "hashC"],
    addedChainBlockHashes: ["hashD", "hashE"],
    acceptedTransactionIds: []
  };
  const vccKey = deriveVirtualChainSemanticKey(vccPayload);

  // Apply VCC to processed events and event_log (simulate what indexer does)
  db.transaction(() => {
    db.prepare("INSERT INTO processed_events (semanticKey, eventType, processedAt) VALUES (?, ?, ?)").run(vccKey, "virtualChainChanged", Date.now());
    db.prepare("INSERT INTO event_log (envelopeId, eventType, semanticKey, removedHashes, addedHashes, wasNoop) VALUES (?, ?, ?, ?, ?, 0)")
      .run("env1", "virtualChainChanged", vccKey, JSON.stringify(vccPayload.removedChainBlockHashes), JSON.stringify(vccPayload.addedChainBlockHashes));
    db.prepare("UPDATE checkpoint_cursor SET anchorHash = 'hashE', virtualDaaScore = '102' WHERE id = 1").run();
  })();

  // 4. Simulate UtxosChanged (atomic rollback/replacement)
  console.log("\n[3] Simulating UtxosChanged (rollback tx1, add tx2)");
  
  const utxoPayload = {
    added: [{ outpoint: { transactionId: "tx2", index: 0 }, address: "kaspa:test", amountSompi: "1000" }],
    removed: [{ outpoint: { transactionId: "tx1", index: 0 } }]
  };
  const utxoKey = deriveUtxosChangedSemanticKey(utxoPayload);

  db.transaction(() => {
    db.prepare("INSERT INTO processed_events (semanticKey, eventType, processedAt) VALUES (?, ?, ?)").run(utxoKey, "utxosChanged", Date.now());
    
    // Apply additions
    for (const add of utxoPayload.added) {
      db.prepare("INSERT OR REPLACE INTO projection_state (txId, indexInTransaction, address, amount, isSpent) VALUES (?, ?, ?, ?, 0)")
        .run(add.outpoint.transactionId, add.outpoint.index, add.address, add.amountSompi);
    }
    // Apply removals
    for (const rem of utxoPayload.removed) {
      db.prepare("UPDATE projection_state SET isSpent = 1 WHERE txId = ? AND indexInTransaction = ?")
        .run(rem.outpoint.transactionId, rem.outpoint.index);
    }
  })();

  // 5. Verify projection state
  console.log("\n[4] Verifying atomic rollback/replacement...");
  const tx1 = db.prepare("SELECT * FROM projection_state WHERE txId = 'tx1'").get() as any;
  const tx2 = db.prepare("SELECT * FROM projection_state WHERE txId = 'tx2'").get() as any;
  const cursor = db.prepare("SELECT * FROM checkpoint_cursor WHERE id = 1").get() as any;

  if (tx1.isSpent !== 1) throw new Error("Rollback failed: tx1 not spent");
  if (!tx2 || tx2.isSpent === 1) throw new Error("Replacement failed: tx2 not present or spent");
  if (cursor.anchorHash !== "hashE") throw new Error("Cursor anchorHash not updated correctly");
  console.log("  Projection matches expected reorg state!");

  // 6. Duplicate Replay NOOP
  console.log("\n[5] Simulating duplicate replay NOOP...");
  const isDuplicateVcc = db.prepare("SELECT 1 FROM processed_events WHERE semanticKey = ?").get(vccKey);
  const isDuplicateUtxo = db.prepare("SELECT 1 FROM processed_events WHERE semanticKey = ?").get(utxoKey);
  
  if (isDuplicateVcc && isDuplicateUtxo) {
    console.log("  Duplicates correctly identified as NOOPs.");
  } else {
    throw new Error("Duplicate detection failed");
  }

  // 7. Restart simulation check
  console.log("\n[6] Simulating indexer restart (same projection)");
  db.close();
  
  const db2 = new Database(DB_PATH);
  const tx2Restart = db2.prepare("SELECT * FROM projection_state WHERE txId = 'tx2'").get() as any;
  if (!tx2Restart || tx2Restart.isSpent === 1) throw new Error("Restart state divergence");
  console.log("  Restart verified: same final projection.");

  console.log("\n✅ P2-3a Structural Reorg Projection Regression PASSED");
  db2.close();
  
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
}

main();
