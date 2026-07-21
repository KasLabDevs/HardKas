import { describe, it, expect, beforeEach } from 'vitest';
import { WalletService } from './WalletService.js';

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

    it('should generate an address', async () => {
        const wallet = await service.createWallet();
        const address = await service.generateAddress(wallet.id);
        expect(address.walletId).toBe(wallet.id);
        expect(address.address).toContain('kaspatest:');
        expect(address.pathIndex).toBe(0);
    });

    it('should document frictions for missing helpers', async () => {
        const wallet = await service.createWallet();
        
        // At this point we realize getting balance requires querying RPC
        // for all generated addresses.
        const balance = await service.getBalance(wallet.id);
        expect(balance).toBe(0);
    });
});
