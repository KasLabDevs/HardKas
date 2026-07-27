import { Command } from 'commander';
import { WalletManager, AddressManager } from '@hardkas/accounts';
import { WalletQuery } from '@hardkas/query';
import { buildPaymentPlan, estimateMass } from '@hardkas/tx-builder';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

// Basic CLI Store (JSON persistence)
// This is exactly the kind of friction we expect: we have to build our own WalletStateStore
const STORE_PATH = path.join(process.cwd(), 'wallet-state.json');

interface WalletState {
    wallets: Record<string, { addressIndex: number }>;
}

function loadStore(): WalletState {
    if (!fs.existsSync(STORE_PATH)) {
        return { wallets: {} };
    }
    return JSON.parse(fs.readFileSync(STORE_PATH, 'utf-8'));
}

function saveStore(state: WalletState) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(state, null, 2));
}

// Mock Query Provider for CLI tests
const mockQueryProvider = {
    source: "mock" as const,
    getBalances: async (addresses: string[]) => {
        const res: Record<string, bigint> = {};
        for (const a of addresses) res[a] = 10000000n; // 0.1 KAS mock
        return res;
    },
    getUtxos: async (addresses: string[]) => {
        const res: Record<string, any[]> = {};
        for (const a of addresses) {
            res[a] = [{
                transactionId: "mock_tx_id",
                outputIndex: 0,
                amountSompi: 10000000n,
                scriptPublicKey: "mock_script"
            }];
        }
        return res;
    },
    getHistory: async () => ({ items: [] })
};
const queryEngine = new WalletQuery({ provider: mockQueryProvider });

const program = new Command();

program
    .name('wallet')
    .description('CLI to test HardKAS wallet helpers')
    .version('1.0.0');

program.command('create')
    .description('Create a new local wallet')
    .argument('<name>', 'Wallet name')
    .action((name) => {
        const state = loadStore();
        if (state.wallets[name]) {
            console.error(`Wallet ${name} already exists.`);
            process.exit(1);
        }
        
        WalletManager.create({ walletId: name, network: "simnet" });
        state.wallets[name] = { addressIndex: 0 };
        saveStore(state);
        
        console.log(`Wallet '${name}' created successfully.`);
    });

program.command('address')
    .description('Get the next receive address for a wallet')
    .argument('<name>', 'Wallet name')
    .action((name) => {
        const state = loadStore();
        if (!state.wallets[name]) {
            console.error(`Wallet ${name} not found.`);
            process.exit(1);
        }
        
        const seedRef = WalletManager.getSeedRef(name);
        const derived = AddressManager.deriveReceive({
            seedRef,
            accountIndex: 0,
            addressIndex: state.wallets[name].addressIndex
        });
        
        state.wallets[name].addressIndex++;
        saveStore(state);
        
        console.log(`Address: ${derived.address}`);
    });

program.command('balance')
    .description('Get the balance for a wallet')
    .argument('<name>', 'Wallet name')
    .action(async (name) => {
        const state = loadStore();
        if (!state.wallets[name]) {
            console.error(`Wallet ${name} not found.`);
            process.exit(1);
        }
        
        const seedRef = WalletManager.getSeedRef(name);
        const addresses = [];
        for (let i = 0; i < state.wallets[name].addressIndex; i++) {
            const derived = AddressManager.deriveReceive({
                seedRef,
                accountIndex: 0,
                addressIndex: i
            });
            addresses.push(derived.address);
        }
        
        if (addresses.length === 0) {
            console.log(`Balance: 0 KAS (0 SOMPI)`);
            return;
        }

        const balanceResult = await queryEngine.getBalance(addresses);
        if (balanceResult.ok) {
            const sompi = balanceResult.balanceSompi;
            // Formatting helper friction: converting SOMPI to KAS cleanly
            console.log(`Balance: ${Number(sompi) / 100000000} KAS (${sompi} SOMPI)`);
        } else {
            console.error(`Error querying balance: ${balanceResult.status}`);
        }
    });

program.command('utxos')
    .description('Get UTXOs for a wallet')
    .argument('<name>', 'Wallet name')
    .action(async (name) => {
        const state = loadStore();
        if (!state.wallets[name]) {
            console.error(`Wallet ${name} not found.`);
            process.exit(1);
        }
        
        const seedRef = WalletManager.getSeedRef(name);
        const addresses = [];
        for (let i = 0; i < state.wallets[name].addressIndex; i++) {
            const derived = AddressManager.deriveReceive({
                seedRef,
                accountIndex: 0,
                addressIndex: i
            });
            addresses.push(derived.address);
        }

        if (addresses.length === 0) {
            console.log(`[]`);
            return;
        }

        const utxosResult = await queryEngine.getUtxos(addresses);
        if (utxosResult.ok) {
            console.log(JSON.stringify(utxosResult.utxos, (key, value) => 
                typeof value === 'bigint' ? value.toString() : value
            , 2));
        } else {
            console.error(`Error querying utxos: ${utxosResult.status}`);
        }
    });

program.command('history')
    .description('Get tx history for a wallet')
    .argument('<name>', 'Wallet name')
    .action(async (name) => {
        const state = loadStore();
        if (!state.wallets[name]) {
            console.error(`Wallet ${name} not found.`);
            process.exit(1);
        }
        
        const seedRef = WalletManager.getSeedRef(name);
        const addresses = [];
        for (let i = 0; i < state.wallets[name].addressIndex; i++) {
            const derived = AddressManager.deriveReceive({
                seedRef,
                accountIndex: 0,
                addressIndex: i
            });
            addresses.push(derived.address);
        }

        if (addresses.length === 0) {
            console.log(`[]`);
            return;
        }

        const historyResult = await queryEngine.getHistory({ addresses });
        if (historyResult.ok) {
            console.log(JSON.stringify(historyResult.history.items, (key, value) => 
                typeof value === 'bigint' ? value.toString() : value
            , 2));
        } else {
            console.error(`Error querying history: ${historyResult.status}`);
        }
    });

program.command('estimate-fee')
    .description('Estimate transaction fee')
    .argument('<name>', 'Wallet name')
    .argument('<to>', 'Destination address')
    .argument('<amount>', 'Amount in SOMPI')
    .action(async (name, to, amount) => {
        const amountSompi = BigInt(amount);
        const state = loadStore();
        if (!state.wallets[name]) {
            console.error(`Wallet ${name} not found.`);
            process.exit(1);
        }

        const seedRef = WalletManager.getSeedRef(name);
        const addresses = [];
        for (let i = 0; i < state.wallets[name].addressIndex; i++) {
            const derived = AddressManager.deriveReceive({
                seedRef,
                accountIndex: 0,
                addressIndex: i
            });
            addresses.push(derived.address);
        }

        if (addresses.length === 0) {
            console.error(`No utxos to estimate fee.`);
            process.exit(1);
        }

        const utxosResult = await queryEngine.getUtxos(addresses);
        if (!utxosResult.ok) {
            console.error(`Error querying utxos: ${utxosResult.status}`);
            process.exit(1);
        }

        const allUtxos: any[] = [];
        for (const [address, addrUtxos] of Object.entries(utxosResult.utxos)) {
            for (const u of addrUtxos) {
                allUtxos.push({
                    outpoint: { transactionId: u.transactionId, index: u.outputIndex },
                    address,
                    amountSompi: u.amountSompi,
                    scriptPublicKey: u.scriptPublicKey
                });
            }
        }

        try {
            const plan = buildPaymentPlan({
                fromAddress: addresses[0], // fallback
                outputs: [{ address: to, amountSompi }],
                availableUtxos: allUtxos,
                feeRateSompiPerMass: 1n // standard fee rate
            });

            console.log(`Estimated Fee: ${plan.estimatedFeeSompi} SOMPI`);
        } catch (e: any) {
            console.error(`Error estimating fee: ${e.message}`);
        }
    });

program.command('send')
    .description('Simulate sending a transaction')
    .argument('<name>', 'Wallet name')
    .argument('<to>', 'Destination address')
    .argument('<amount>', 'Amount in SOMPI')
    .action(async (name, to, amount) => {
        const amountSompi = BigInt(amount);
        const state = loadStore();
        if (!state.wallets[name]) {
            console.error(`Wallet ${name} not found.`);
            process.exit(1);
        }

        const seedRef = WalletManager.getSeedRef(name);
        const addresses = [];
        for (let i = 0; i < state.wallets[name].addressIndex; i++) {
            const derived = AddressManager.deriveReceive({
                seedRef,
                accountIndex: 0,
                addressIndex: i
            });
            addresses.push(derived.address);
        }

        if (addresses.length === 0) {
            console.error(`No utxos to send.`);
            process.exit(1);
        }

        const utxosResult = await queryEngine.getUtxos(addresses);
        if (!utxosResult.ok) {
            console.error(`Error querying utxos: ${utxosResult.status}`);
            process.exit(1);
        }

        const allUtxos: any[] = [];
        for (const [address, addrUtxos] of Object.entries(utxosResult.utxos)) {
            for (const u of addrUtxos) {
                allUtxos.push({
                    outpoint: { transactionId: u.transactionId, index: u.outputIndex },
                    address,
                    amountSompi: u.amountSompi,
                    scriptPublicKey: u.scriptPublicKey
                });
            }
        }

        try {
            const plan = buildPaymentPlan({
                fromAddress: addresses[0], // fallback
                outputs: [{ address: to, amountSompi }],
                availableUtxos: allUtxos,
                feeRateSompiPerMass: 1n
            });

            console.log(`Transaction Plan:
  To: ${to}
  Amount: ${amountSompi} SOMPI
  Inputs: ${plan.inputs.length}
  Fee: ${plan.estimatedFeeSompi} SOMPI
  Total Spend: ${amountSompi + plan.estimatedFeeSompi} SOMPI
        `);
            console.log(`Tx ID (Simulated): ${randomUUID()}`);
        } catch (e: any) {
            console.error(`Error building plan: ${e.message}`);
        }
    });

program.command('export-evidence')
    .description('Export evidence artifacts')
    .argument('<name>', 'Wallet name')
    .action(async (name) => {
        // Friction expected: "EvidenceBatchExporter" or finding local artifacts is annoying.
        const state = loadStore();
        if (!state.wallets[name]) {
            console.error(`Wallet ${name} not found.`);
            process.exit(1);
        }
        
        // This command proves friction since Wallet CLI has no easy way to just "export all evidence"
        console.log(`Evidence batch exporter is not available. 
In a real scenario, this would package all signed plans and receipts for this wallet into an EvidencePackage.`);
    });

// Make it testable by exporting program
export { program, STORE_PATH };

if (import.meta.url === `file://${process.argv[1]}`) {
    program.parse(process.argv);
}
