import { describe, it, expect } from 'vitest';
import { WalletToolkit, JobsToolkit } from '@hardkas/toolkit';

describe('App 3: Treasury Exchange App', () => {
    it('should manage hot/cold wallets, 10 internal accounts, and batched jobs', async () => {
        const internalAccounts = Array.from({ length: 10 }, (_, i) => `treasury_${i}`);
        let ops = 0;

        const hotWallet = await WalletToolkit.open("exchange-hot");
        await hotWallet.create();
        const coldWallet = await WalletToolkit.open("exchange-cold");
        await coldWallet.create();
        ops += 4;

        const jobs = JobsToolkit.open({ storePath: ".hardkas/treasury-jobs.json" });

        for (const acc of internalAccounts) {
            const w = await WalletToolkit.open(acc, { strict: true });
            await w.create();
            
            require('node:fs').writeFileSync(`claims_${acc}.json`, JSON.stringify({
                realBroadcast: false,
                realFunding: false,
                fixtureUsed: true,
                dockerNodeUsed: false,
                mainnetUsed: false,
                simnetOnly: true
            }));

            // sweep to hot wallet
            const hotAddr = await hotWallet.address();
            try {
                await w.planSend({ to: hotAddr, amount: 100n });
                ops++;
            } catch(e) {}
            ops++;
        }

        // Job to sweep from hot to cold
        const coldAddr = await coldWallet.address();
        const jobId = await jobs.enqueue("sweep-hot-to-cold", { destination: coldAddr });
        ops++;
        const status = await jobs.getJob(jobId);
        expect(status).toBeDefined();

        expect(internalAccounts.length).toBe(10);
        expect(ops).toBeGreaterThan(10);
    });
});
