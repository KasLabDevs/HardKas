import { PaymentToolkit } from '@hardkas/toolkit';

async function run() {
    // 1. Initialize PaymentToolkit for a specific merchant
    const payment = PaymentToolkit.openMerchant('my-store', { 
        storePath: '.hardkas-data/invoices.json' 
    });

    // 2. Create a new invoice
    const inv = await payment.createInvoice({ 
        amount: 500n, 
        currency: 'KAS' 
    });
    console.log(`Created invoice ${inv.id} with URI: ${inv.uri}`);
    
    // 2b. Or using precise Sompi amounts:
    const inv2 = await payment.createInvoice({
        amountSompi: 100000000n // 1 KAS
    });

    // 3. Check status
    const status = await payment.check(inv.id);
    console.log(`Status of ${inv.id}: ${status}`);

    // 4. Generate a receipt artifact
    // Note: Normally only called if status is 'paid'
    const receipt = await payment.receipt(inv.id);
    console.log(`Receipt generated:`, receipt);

    // 5. Query stats across all invoices
    const stats = await payment.stats();
    console.log(`Total invoices: ${stats.totalInvoices}`);
}

run().catch(console.error);
