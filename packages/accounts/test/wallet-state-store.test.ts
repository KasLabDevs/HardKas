import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WalletStateStoreJson } from '../src/wallet-state-store.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { randomUUID } from 'node:crypto';

describe('WalletStateStoreJson', () => {
    let testFilePath: string;

    beforeEach(() => {
        testFilePath = path.join(process.cwd(), `test-wallet-state-${randomUUID()}.json`);
    });

    afterEach(() => {
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    });

    it('should return default state for new wallet', () => {
        const store = new WalletStateStoreJson({ filePath: testFilePath });
        const state = store.getWallet('wallet_1');
        
        expect(state.walletId).toBe('wallet_1');
        expect(state.receiveIndex).toBe(0);
        expect(state.changeIndex).toBe(0);
    });

    it('should save and load wallet state', () => {
        const store = new WalletStateStoreJson({ filePath: testFilePath });
        store.saveWallet({ walletId: 'wallet_1', receiveIndex: 5, changeIndex: 2 });
        
        const state = store.getWallet('wallet_1');
        expect(state.receiveIndex).toBe(5);
        expect(state.changeIndex).toBe(2);
    });

    it('should increment receive and change indices correctly', () => {
        const store = new WalletStateStoreJson({ filePath: testFilePath });
        
        const firstReceive = store.nextReceiveIndex('wallet_2');
        expect(firstReceive).toBe(0);
        
        const secondReceive = store.nextReceiveIndex('wallet_2');
        expect(secondReceive).toBe(1);

        const firstChange = store.nextChangeIndex('wallet_2');
        expect(firstChange).toBe(0);

        const state = store.getWallet('wallet_2');
        expect(state.receiveIndex).toBe(2);
        expect(state.changeIndex).toBe(1);
    });
});
