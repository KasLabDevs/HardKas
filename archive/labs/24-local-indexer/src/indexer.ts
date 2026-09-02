import { Hardkas } from "@hardkas/sdk";
import { initializeDatabase } from "./db.js";
import type { BlockDagInfo } from "@hardkas/kaspa-rpc";

// ─── Virtual Fingerprint ───────────────────────────────────────────
// Canonical identity of the virtual chain state.
// Uses virtualDaaScore + virtualParentHashes + sink.
// NOT tipHashes (those are DAG tips, not virtual identity).

interface VirtualFingerprint {
  virtualDaaScore: string;
  virtualParentHashes: string; // sorted, comma-joined
  sink: string;
}

function extractFingerprint(info: BlockDagInfo): VirtualFingerprint {
  const parentHashes = [...(info.virtualParentHashes || [])].sort();
  return {
    virtualDaaScore: (info.virtualDaaScore ?? 0n).toString(),
    virtualParentHashes: parentHashes.join(","),
    sink: info.sink || "",
  };
}

function fingerprintEquals(a: VirtualFingerprint, b: VirtualFingerprint): boolean {
  return (
    a.virtualDaaScore === b.virtualDaaScore &&
    a.virtualParentHashes === b.virtualParentHashes &&
    a.sink === b.sink
  );
}

function fingerprintToString(fp: VirtualFingerprint): string {
  return `DAA:${fp.virtualDaaScore} | parents:[${fp.virtualParentHashes}] | sink:${fp.sink.slice(0, 12)}…`;
}

// ─── Semantic Key ──────────────────────────────────────────────────
// Derived from Kaspa evidence content, NOT from transport envelope IDs.
// Two deliveries of the same virtual-chain transition produce the same key.

function deriveVirtualChainSemanticKey(payload: any): string {
  const removed = [...(payload.removedChainBlockHashes || [])].sort().join(",");
  const added = [...(payload.addedChainBlockHashes || [])].sort().join(",");
  const acceptedTxIds = (payload.acceptedTransactionIds || [])
    .flatMap((a: any) => a.acceptedTransactionIds || [])
    .sort()
    .join(",");
  return `vc:${removed}|${added}|${acceptedTxIds}`;
}

function deriveUtxosChangedSemanticKey(payload: any): string {
  const addedIds = (payload.added || [])
    .map((u: any) => `${u.outpoint?.transactionId || u.address}:${u.outpoint?.index ?? 0}`)
    .sort()
    .join(",");
  const removedIds = (payload.removed || [])
    .map((u: any) => `${u.outpoint?.transactionId || u.address}:${u.outpoint?.index ?? 0}`)
    .sort()
    .join(",");
  return `utxo:+${addedIds}|-${removedIds}`;
}

// ─── Local Indexer ─────────────────────────────────────────────────

export class LocalIndexer {
  private db: ReturnType<typeof initializeDatabase>;
  private sdk!: Hardkas;
  private eventBuffer: Array<{ type: string; envelope: any }> = [];
  private isBootstrapping = true;
  private processedKeys: Set<string>;

  constructor(private dbPath: string, private trackedAddresses: string[]) {
    this.db = initializeDatabase(this.dbPath);
    // Load already-processed keys into memory for fast dedup
    this.processedKeys = new Set(
      (this.db.prepare("SELECT semanticKey FROM processed_events").all() as any[]).map(
        (r) => r.semanticKey
      )
    );
  }

  async start() {
    this.sdk = await Hardkas.create({ autoBootstrap: true, network: "simnet" });

    const cursor = this.db
      .prepare("SELECT * FROM checkpoint_cursor WHERE id = 1")
      .get() as any;

    if (!cursor) {
      console.log("[INDEXER] No cursor found. Bootstrapping…");
      await this.subscribeAndBootstrap();
    } else {
      const currentNetworkInfo = await this.sdk.rpc.getBlockDagInfo();
      const currentDaa = currentNetworkInfo.virtualDaaScore ?? 0n;
      const cursorDaa = BigInt(cursor.virtualDaaScore);

      console.log(
        `[INDEXER] Found cursor: DAA=${cursor.virtualDaaScore} anchorHash=${cursor.anchorHash?.slice(0, 12)}…`
      );

      if (cursorDaa < currentDaa) {
        console.warn(
          `\n[GAP DETECTED] Network DAA (${currentDaa}) > Cursor DAA (${cursorDaa})`
        );
        console.log(`[INDEXER] Fetching catch-up evidence from anchorHash=${cursor.anchorHash} ...`);
        
        try {
          const v2Response = await this.sdk.rpc.getVirtualChainFromBlockV2({
            startHash: cursor.anchorHash,
            dataVerbosityLevel: "LEGACY_RECOVERY"
          });
          
          await this.applyCatchUpEvidence(v2Response, currentNetworkInfo);
          
          console.log(`[INDEXER] Catch-up complete. Resuming live stream.`);
          this.isBootstrapping = false;
          await this.subscribeToEvents();
        } catch (e: any) {
          console.error(`[FRICTION] Offline Gap Recovery Failed:`, e.message);
          return;
        }
      } else {
        console.log(`[INDEXER] No offline gap detected. Resuming live stream.`);
        this.isBootstrapping = false;
        await this.subscribeToEvents();
      }
    }

    console.log("[INDEXER] Live. Waiting for events…");
  }

  async applyCatchUpEvidence(v2Response: any, currentNetworkInfo: any) {
    // 1. Normalize Evidence
    const removed = v2Response.removedChainBlockHashes || [];
    const added = v2Response.addedChainBlockHashes || [];
    const acceptedTxIds = (v2Response.chainBlockAcceptedTransactions || [])
      .flatMap((a: any) => a.acceptedTransactions || [])
      .map((tx: any) => tx.transactionId || tx)
      .sort();

    const normalizedTransition = {
      removedChainBlockHashes: removed,
      addedChainBlockHashes: added,
      acceptedTransactionIds: acceptedTxIds,
    };

    const semanticKey = deriveVirtualChainSemanticKey(normalizedTransition);

    console.log(`[CATCH-UP] Normalization complete. Key: ${semanticKey.slice(0, 60)}...`);
    console.log(`  removed=${removed.length} added=${added.length} acceptedTxIds=${acceptedTxIds.length}`);

    if (this.processedKeys.has(semanticKey)) {
       console.log(`[CATCH-UP] Evidence already processed. NOOP.`);
       return;
    }

    // 2. Atomic Apply + Cursor Commit
    this.db.transaction(() => {
      // In a full implementation, we would fetch UTXOs for added blocks and remove UTXOs for removed blocks here.
      // For this Lab, we demonstrate the atomic commit boundary:
      
      this.db
        .prepare(
          `INSERT OR IGNORE INTO processed_events (semanticKey, eventType, processedAt)
           VALUES (?, ?, ?)`
        )
        .run(semanticKey, "catchUpReplay", Date.now());

      this.db
        .prepare(
          `INSERT OR REPLACE INTO checkpoint_cursor
           (id, virtualDaaScore, virtualParentHashes, anchorHash, updatedAt)
           VALUES (1, ?, ?, ?, ?)`
        )
        .run(
          currentNetworkInfo.virtualDaaScore,
          "", // For simplicity in this lab we just update DAA and Anchor
          added.length > 0 ? added[added.length - 1] : currentNetworkInfo.sink || "",
          Date.now()
        );
    })();

    this.processedKeys.add(semanticKey);
    console.log(`[CATCH-UP] Atomic commit successful. Cursor advanced to DAA ${currentNetworkInfo.virtualDaaScore}`);
  }

  // ─── Subscribe-before-snapshot bracket ───────────────────────────
  private async subscribeAndBootstrap() {
    // A/B. Subscribe BEFORE snapshot
    await this.subscribeToEvents();

    let bracketValid = false;
    let attempts = 0;
    const maxAttempts = 5;

    while (!bracketValid && attempts < maxAttempts) {
      attempts++;
      this.eventBuffer = [];

      // C. Virtual fingerprint Vbefore
      const dagBefore = await this.sdk.rpc.getBlockDagInfo();
      const vBefore = extractFingerprint(dagBefore);

      // D. Fetch UTXO snapshot
      const utxosResponse = (await this.sdk.rpc.getUtxosByAddresses(
        this.trackedAddresses
      )) as any;
      const utxos = Array.isArray(utxosResponse)
        ? utxosResponse
        : utxosResponse?.entries || [];

      // E. Buffer fills asynchronously during C-D via event handlers

      // F. Virtual fingerprint Vafter
      const dagAfter = await this.sdk.rpc.getBlockDagInfo();
      const vAfter = extractFingerprint(dagAfter);

      // G. Check bracket consistency
      if (fingerprintEquals(vBefore, vAfter)) {
        bracketValid = true;
        console.log(
          `[BOOTSTRAP] Bracket stable on attempt ${attempts}. ${fingerprintToString(vBefore)}`
        );

        // Persist C0 + projection atomically
        this.db.transaction(() => {
          const insert = this.db.prepare(`
            INSERT OR REPLACE INTO projection_state
            (txId, indexInTransaction, address, amount, scriptPublicKey, isSpent)
            VALUES (?, ?, ?, ?, ?, 0)
          `);
          for (const u of utxos) {
            insert.run(
              u.outpoint?.transactionId || "0",
              u.outpoint?.index || 0,
              u.address || "",
              u.amountSompi?.toString() || "0",
              typeof u.scriptPublicKey === "object"
                ? u.scriptPublicKey?.scriptPublicKey
                : u.scriptPublicKey || ""
            );
          }

          this.db
            .prepare(
              `INSERT OR REPLACE INTO checkpoint_cursor
               (id, virtualDaaScore, virtualParentHashes, anchorHash, updatedAt)
               VALUES (1, ?, ?, ?, ?)`
            )
            .run(
              vBefore.virtualDaaScore,
              vBefore.virtualParentHashes,
              vBefore.sink,
              Date.now()
            );
        })();

        console.log(
          `[BOOTSTRAP] Persisted ${utxos.length} UTXOs + cursor C0.`
        );

        // H. Flush buffered events
        this.isBootstrapping = false;
        if (this.eventBuffer.length > 0) {
          console.log(
            `[BOOTSTRAP] Flushing ${this.eventBuffer.length} buffered events…`
          );
          for (const event of this.eventBuffer) {
            await this.processEvent(event);
          }
        } else {
          console.log(`[BOOTSTRAP] No buffered events to flush.`);
        }
      } else {
        console.log(
          `[BOOTSTRAP] Bracket FAILED on attempt ${attempts}.`
        );
        console.log(`  Vbefore: ${fingerprintToString(vBefore)}`);
        console.log(`  Vafter:  ${fingerprintToString(vAfter)}`);
      }
    }

    if (!bracketValid) {
      console.error(
        `[BOOTSTRAP] Failed to establish stable bracket after ${maxAttempts} attempts.`
      );
      console.error(
        `[FRICTION] Bootstrap Consistency / Stream-Snapshot Handoff: ` +
          `network too active for bracket convergence. ` +
          `Candidate: GetVirtualChainFromBlock catch-up.`
      );
    }
  }

  // ─── Event Subscriptions ─────────────────────────────────────────
  private async subscribeToEvents() {
    this.sdk.events.subscribe(
      { type: "virtualChainChanged" } as any,
      async (envelope: any) => {
        const event = { type: "virtualChainChanged", envelope };
        if (this.isBootstrapping) {
          this.eventBuffer.push(event);
          return;
        }
        await this.processEvent(event);
      }
    );

    this.sdk.events.subscribe(
      { type: "utxosChanged", addresses: this.trackedAddresses },
      async (envelope: any) => {
        const event = { type: "utxosChanged", envelope };
        if (this.isBootstrapping) {
          this.eventBuffer.push(event);
          return;
        }
        await this.processEvent(event);
      }
    );
  }

  // ─── Event Processing with Semantic Dedup ────────────────────────
  private async processEvent(event: { type: string; envelope: any }) {
    const payload = event.envelope?.payload || event.envelope;
    const envelopeId = event.envelope?.id || "unknown";

    // Derive semantic key from Kaspa evidence
    const semanticKey =
      event.type === "virtualChainChanged"
        ? deriveVirtualChainSemanticKey(payload)
        : deriveUtxosChangedSemanticKey(payload);

    // Read current cursor before mutation
    const cursorBefore = this.db
      .prepare("SELECT * FROM checkpoint_cursor WHERE id = 1")
      .get() as any;

    // ── SEMANTIC DEDUP ──
    if (this.processedKeys.has(semanticKey)) {
      console.log(
        `[DEDUP] NOOP — already processed: ${event.type} key=${semanticKey.slice(0, 60)}…`
      );
      // Log the noop
      this.db
        .prepare(
          `INSERT INTO event_log
           (envelopeId, eventType, semanticKey, wasNoop, processedAt)
           VALUES (?, ?, ?, 1, ?)`
        )
        .run(envelopeId, event.type, semanticKey, Date.now());
      return;
    }

    // ── APPLY ──
    let projectionMutation = "";

    if (event.type === "virtualChainChanged") {
      const removed = payload.removedChainBlockHashes || [];
      const added = payload.addedChainBlockHashes || [];
      const acceptedTxIds = (payload.acceptedTransactionIds || [])
        .flatMap((a: any) => a.acceptedTransactionIds || []);

      projectionMutation = `removed:${removed.length} added:${added.length} txIds:${acceptedTxIds.length}`;

      console.log(
        `[EVENT] VirtualChainChanged | envelope=${envelopeId} | key=${semanticKey.slice(0, 60)}…`
      );
      console.log(
        `  removed=${removed.length} added=${added.length} acceptedTxIds=${acceptedTxIds.length}`
      );

      // Log details
      this.db
        .prepare(
          `INSERT INTO event_log
           (envelopeId, eventType, semanticKey, removedHashes, addedHashes, acceptedTxIds,
            projectionMutation, cursorBefore, cursorAfter, wasNoop, processedAt)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?)`
        )
        .run(
          envelopeId,
          event.type,
          semanticKey,
          JSON.stringify(removed),
          JSON.stringify(added),
          JSON.stringify(acceptedTxIds),
          projectionMutation,
          cursorBefore ? `DAA:${cursorBefore.virtualDaaScore}` : "none",
          "pending", // Will update after cursor advance
          Date.now()
        );
    } else if (event.type === "utxosChanged") {
      const added = payload.added || [];
      const removed = payload.removed || [];

      projectionMutation = `+${added.length} -${removed.length}`;

      console.log(
        `[EVENT] UtxosChanged | envelope=${envelopeId} | key=${semanticKey.slice(0, 60)}…`
      );
      console.log(`  added=${added.length} removed=${removed.length}`);

      // Apply to projection
      this.db.transaction(() => {
        const insertStmt = this.db.prepare(`
          INSERT OR REPLACE INTO projection_state
          (txId, indexInTransaction, address, amount, scriptPublicKey, isSpent)
          VALUES (?, ?, ?, ?, ?, 0)
        `);
        for (const u of added) {
          insertStmt.run(
            u.outpoint?.transactionId || "0",
            u.outpoint?.index || 0,
            u.address || "",
            u.amountSompi?.toString() || u.amount?.toString() || "0",
            typeof u.scriptPublicKey === "object"
              ? u.scriptPublicKey?.scriptPublicKey
              : u.scriptPublicKey || ""
          );
        }

        for (const u of removed) {
          this.db
            .prepare(
              `UPDATE projection_state SET isSpent = 1 WHERE txId = ? AND indexInTransaction = ?`
            )
            .run(u.outpoint?.transactionId || "0", u.outpoint?.index || 0);
        }
      })();

      // Log
      this.db
        .prepare(
          `INSERT INTO event_log
           (envelopeId, eventType, semanticKey, projectionMutation, cursorBefore, wasNoop, processedAt)
           VALUES (?, ?, ?, ?, ?, 0, ?)`
        )
        .run(
          envelopeId,
          event.type,
          semanticKey,
          projectionMutation,
          cursorBefore ? `DAA:${cursorBefore.virtualDaaScore}` : "none",
          Date.now()
        );
    }

    // Mark as processed (semantic dedup)
    this.processedKeys.add(semanticKey);
    this.db
      .prepare(
        `INSERT OR IGNORE INTO processed_events (semanticKey, eventType, processedAt)
         VALUES (?, ?, ?)`
      )
      .run(semanticKey, event.type, Date.now());

    console.log(`[DEDUP] Registered key: ${semanticKey.slice(0, 60)}…`);
  }

  // ─── Diagnostics ─────────────────────────────────────────────────
  getProjectionCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM projection_state WHERE isSpent = 0")
      .get() as any;
    return row?.cnt || 0;
  }

  getEventLogCount(): number {
    const row = this.db
      .prepare("SELECT COUNT(*) as cnt FROM event_log")
      .get() as any;
    return row?.cnt || 0;
  }

  getCursor(): any {
    return this.db
      .prepare("SELECT * FROM checkpoint_cursor WHERE id = 1")
      .get();
  }
}

// ─── Runner ────────────────────────────────────────────────────────

async function run() {
  const dbPath = process.argv[2] || "indexer.db";
  const indexer = new LocalIndexer(dbPath, [
    "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn",
  ]);
  await indexer.start();

  // Keep alive for event processing
  console.log("[INDEXER] Press Ctrl+C to stop.");
  console.log(
    `[INDEXER] Projection: ${indexer.getProjectionCount()} unspent UTXOs`
  );
  console.log(`[INDEXER] Cursor:`, indexer.getCursor());
}

if (
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "") ||
  process.argv[1]?.endsWith("indexer.ts")
) {
  run().catch(console.error);
}
