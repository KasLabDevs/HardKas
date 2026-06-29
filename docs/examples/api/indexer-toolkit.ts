import { IndexerToolkit } from '@hardkas/toolkit';

async function run() {
    // 1. Initialize IndexerToolkit pointing to a local data directory
    const indexer = IndexerToolkit.open({ 
        dataDir: '.hardkas-data' 
    });

    // 2. Watch an address for activity
    await indexer.watch('kaspa:my-store');

    // 3. Query balance
    const balance = await indexer.balance('kaspa:my-store');
    console.log(`Balance for my-store: ${balance}`);

    // 4. Ingest a local artifact (e.g. a payment receipt)
    await indexer.ingestArtifact({
        id: 'rec_123',
        schema: 'paymentReceipt.v1',
        tags: ['merchant:my-store', 'invoice:inv_456']
    });

    // 5. Search indexed artifacts
    const receipts = await indexer.findReceipts({ 
        tags: ['merchant:my-store'] 
    });
    console.log(`Found ${receipts.length} receipts.`);
}

run().catch(console.error);
