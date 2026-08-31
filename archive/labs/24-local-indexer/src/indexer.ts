import { Hardkas } from "@hardkas/sdk";
import { UTXO } from "@hardkas/core";
import { initializeDatabase } from "./db.js";

export class LocalIndexer {
  private db: ReturnType<typeof initializeDatabase>;
  private sdk!: Hardkas;

  constructor(private dbPath: string, private trackedAddresses: string[]) {
    this.db = initializeDatabase(this.dbPath);
  }

  async start() {
    this.sdk = await Hardkas.create({ autoBootstrap: true });

    // Step 1: Bootstrap if no cursor exists
    const cursor = this.db.prepare("SELECT * FROM checkpoint_cursor WHERE id = 1").get() as any;
    if (!cursor) {
      console.log("No cursor found. Bootstrapping...");
      await this.bootstrap();
    } else {
      console.log(`Resuming from cursor DAA Score: ${cursor.lastDaaScore}`);
    }

    // Step 2: Subscribe to events to update projection
    console.log("Subscribing to network events...");
    await this.subscribeToEvents();
  }

  private async bootstrap() {
    // We only care about our tracked addresses
    const utxos = await this.sdk.query.getUtxosByAddresses({
      addresses: this.trackedAddresses,
      includeOrphanPool: false
    });

    const insert = this.db.prepare(`
      INSERT OR REPLACE INTO projection_state 
      (txId, indexInTransaction, address, amount, scriptPublicKey, isSpent)
      VALUES (?, ?, ?, ?, ?, 0)
    `);

    this.db.transaction(() => {
      for (const u of utxos) {
        insert.run(u.outpoint.transactionId, u.outpoint.index, u.address, u.amount.toString(), u.scriptPublicKey);
      }
      
      // We don't easily know the EXACT block hash this snapshot belongs to via getUtxosByAddresses
      // Let's get the current virtual chain block
      // But getVirtualChainFromBlock requires a startHash. We don't have one initially.
      // So how do we set C0?
      this.db.prepare(`
        INSERT INTO checkpoint_cursor (id, lastDaaScore, lastBlockHash)
        VALUES (1, 0, 'INITIAL')
      `).run();
    })();

    console.log(`Bootstrapped ${utxos.length} UTXOs.`);
  }

  private async subscribeToEvents() {
    // Frictions:
    // 1. We want to update our UTXO set accurately and maintain a cursor.
    // 2. We should listen to VirtualChainChanged, but it's not exposed!
    // Let's try what IS exposed: blockAdded, utxosChanged
    
    this.sdk.events.subscribe("utxosChanged", async (event) => {
      // Is this idempotently tracked? UtxoChangedEvent doesn't have an eventId in its payload, 
      // but EventEnvelope has an id. We can't access the envelope directly through the high-level sdk.events?
      // Wait, SDK events currently unwrap the envelope or provide the raw event?
      console.log("Received UTXOs changed:", event.added.length, "added", event.removed.length, "removed");
      
      // If we process this, how do we know it's finalized? Kaspa's utxosChanged fires for the virtual chain.
      // BUT what if there's a reorg? We have no virtualChainChanged to rollback!
      // This is the blocker!
    });
    
    // As per user instructions, I should document this missing primitive rather than hack around it.
  }
}

async function run() {
  const indexer = new LocalIndexer("indexer.db", ["kaspa:sim_alice"]);
  await indexer.start();
  
  // We'll immediately see we can't implement Reorgs cleanly.
}

if (import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/')) || process.argv[1].endsWith('indexer.ts')) {
  run().catch(console.error);
}
