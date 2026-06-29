import { WalletToolkit } from '@hardkas/toolkit';

async function run() {
    // 1. Initialize WalletToolkit
    const wallet = WalletToolkit.open('alice', { 
        storePath: '.hardkas-data/wallets.json' 
    });

    // 2. Ensure the wallet exists
    await wallet.create();

    // 3. Get the primary address
    const address = await wallet.address();
    console.log(`Wallet address: ${address}`);

    // 4. Check balance and UTXOs
    const balance = await wallet.balance();
    console.log(`Balance: ${balance}`);

    // 5. Simulate a send (does not broadcast)
    await wallet.sendSimulated({
        to: 'kaspa:store',
        amount: 150
    });
}

run().catch(console.error);
