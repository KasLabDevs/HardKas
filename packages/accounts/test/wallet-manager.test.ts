import { describe, it, expect } from "vitest";
import { WalletManager } from "../src/wallet-manager.js";
import { AddressManager } from "../src/address-manager.js";

describe("WalletManager", () => {
    it("create wallet returns seedRef, not mnemonic", () => {
        const result = WalletManager.create({ walletId: "wallet1" });
        expect(result.seedRef).toBeDefined();
        expect(result.seedRef.startsWith("seedref_")).toBe(true);
        expect((result as any).mnemonic).toBeUndefined();
        expect(result.claims.plaintextMnemonicStored).toBe(false);
    });

    it("import mnemonic redacts mnemonic", () => {
        const secret = "secret secret secret secret secret secret secret secret secret secret secret secret";
        const result = WalletManager.importMnemonic({ walletId: "wallet2", mnemonic: secret });
        expect(result.seedRef).toBeDefined();
        expect((result as any).mnemonic).toBeUndefined();
        expect(JSON.stringify(result)).not.toContain("secret");
    });

    it("same mnemonic + path derives deterministic address", () => {
        const mnemonic = "test words for deterministic derivation test";
        WalletManager.importMnemonic({ walletId: "wallet3a", mnemonic });
        const seedRef1 = WalletManager.getSeedRef("wallet3a");
        
        WalletManager.importMnemonic({ walletId: "wallet3b", mnemonic });
        const seedRef2 = WalletManager.getSeedRef("wallet3b");

        // The seedRefs should be equal because it's a hash of the mnemonic
        expect(seedRef1).toBe(seedRef2);

        const addr1 = AddressManager.deriveReceive({ seedRef: seedRef1, accountIndex: 0, addressIndex: 0 });
        const addr2 = AddressManager.deriveReceive({ seedRef: seedRef2, accountIndex: 0, addressIndex: 0 });

        expect(addr1.address).toBe(addr2.address);
    });

    it("mainnet blocked by default", () => {
        expect(() => WalletManager.create({ walletId: "wallet4", network: "mainnet" }))
            .toThrow(/WALLET_MANAGER_MAINNET_BLOCKED/);
        expect(() => WalletManager.importMnemonic({ walletId: "wallet4", mnemonic: "test", network: "mainnet" }))
            .toThrow(/WALLET_MANAGER_MAINNET_BLOCKED/);
    });

    it("artifacts contain no mnemonic/privateKey", () => {
        const result = WalletManager.create({ walletId: "wallet5" });
        const jsonStr = JSON.stringify(result);
        expect(jsonStr).not.toContain("privateKey");
        expect(jsonStr).not.toContain("mnemonic");
        expect(jsonStr).not.toContain("test test test"); // default mock mnemonic
    });

    it("keystoreRef exists", () => {
        const result = WalletManager.create({ walletId: "wallet6" });
        expect(result.keystoreRef).toBeDefined();
        expect(result.keystoreRef.startsWith("keystore_")).toBe(true);
        
        const metadata = WalletManager.exportMetadata("wallet6");
        expect(metadata.keystoreRef).toBe(result.keystoreRef);
    });
    
    it("export metadata contains no secrets", () => {
        WalletManager.importMnemonic({ walletId: "wallet7", mnemonic: "my super secret" });
        const metadata = WalletManager.exportMetadata("wallet7");
        const jsonStr = JSON.stringify(metadata);
        
        expect(jsonStr).not.toContain("super secret");
        expect(jsonStr).not.toContain("seedRef"); // Metadata shouldn't even have seedRef
        expect((metadata as any).seedRef).toBeUndefined();
    });
});
