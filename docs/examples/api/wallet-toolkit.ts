import { WalletToolkit } from '@hardkas/toolkit';

// WalletToolkit is a SIMNET development wallet: its identity is synthetic (the private keys derive from the wallet
// name, so anyone can compute them). It refuses public networks and its addresses must never receive real funds.
async function run() {
    // 1. Initialize WalletToolkit on the local simnet
    const wallet = WalletToolkit.open('alice', {
        storePath: '.hardkas-data/wallets.json',
        networkId: 'simnet'
    });

    // 2. Ensure the wallet exists
    await wallet.create();

    // 3. Get the primary (synthetic, simnet) address
    const address = await wallet.receive();
    console.log(`Wallet address: ${address}`);

    // 4. Check balance and UTXOs
    const balance = await wallet.balance();
    console.log(`Balance: ${balance}`);

    // 5. Spending needs an injected signer and real simnet UTXOs (send / payMany); `sendSimulated()` is a deprecated
    //    stub that returns a fake id and is not a transaction.
}

run().catch(console.error);
