import { readFileSync } from 'node:fs';
import { IndexerToolkit } from '@hardkas/toolkit';

async function run() {
    // 1. Initialize IndexerToolkit pointing to a local data directory
    const indexer = IndexerToolkit.open({
        dataDir: '.hardkas-data'
    });

    // 2. Watch an address for activity (a simnet address: mainnet is blocked in this release)
    const store = 'kaspasim:qr...my-store';
    await indexer.watch(store);

    // 3. Query balance
    const balance = await indexer.balance(store);
    console.log(`Balance for my-store: ${balance}`);

    // 4. Ingest a HardKAS artifact written by a command (it must carry its verified content hash).
    //    A receipt of PaymentToolkit.simulatePay() says `schema: 'hardkas.synthetic.paymentReceipt.v1'` and
    //    `synthetic: true`: it is a simulation, not evidence of a payment.
    const path = '.hardkas/artifacts/tx-receipt.json';
    const artifact = JSON.parse(readFileSync(path, 'utf8'));
    await indexer.ingestArtifact(artifact, {
        filePath: path,
        tags: ['merchant:my-store', 'invoice:inv_456']
    });

    // 5. Search indexed artifacts
    const receipts = await indexer.findReceipts({
        tags: ['merchant:my-store']
    });
    console.log(`Found ${receipts.length} receipts.`);
}

run().catch(console.error);
