import { describe, it, expect, beforeEach } from 'vitest';
import { WalletService } from './WalletService.js';

// WALLET-HD-0 (2026-10-20): this file was shipped on ONE line with a `//` comment that swallowed the rest of it (it never
// compiled), and it expected `kaspatest:` addresses from a service that creates `simnet` wallets. The service's wallets
// are SYNTHETIC simnet identities (keys computable from the walletId): their addresses are `kaspasim:` and are
// development fixtures, never a place for real funds.
describe('WalletService', () => {
    let service: WalletService;

    beforeEach(() => {
        service = new WalletService();
    });

    it('should create a wallet', async () => {
        const wallet = await service.createWallet();
        expect(wallet.id).toBeDefined();
        expect(wallet.mnemonic).toBeDefined();
        expect(wallet.createdAt).toBeGreaterThan(0);
    });

    it('should generate a simnet (synthetic) address', async () => {
        const wallet = await service.createWallet();
        const address = await service.generateAddress(wallet.id);
        expect(address.walletId).toBe(wallet.id);
        expect(address.address).toContain('kaspasim:');
        expect(address.pathIndex).toBe(0);
    });

    it('should document frictions for missing helpers', async () => {
        const wallet = await service.createWallet();
        // At this point we realize getting balance requires querying RPC
        // for all generated addresses.
        const balance = await service.getBalance(wallet.id);
        expect(balance).toBe(0n);
    });
});
