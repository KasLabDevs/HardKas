import { describe, it, expect } from "vitest";
import { AddressManager } from "../src/address-manager.js";

describe("AddressManager", () => {
    it("same seed/path => same address", () => {
        const addr1 = AddressManager.deriveReceive({
            seedRef: "test-seed-123",
            accountIndex: 0,
            addressIndex: 5
        });

        const addr2 = AddressManager.deriveReceive({
            seedRef: "test-seed-123",
            accountIndex: 0,
            addressIndex: 5
        });

        expect(addr1.address).toBe(addr2.address);
        expect(addr1.path).toBe(addr2.path);
    });

    it("receive/change differ", () => {
        const addrReceive = AddressManager.deriveReceive({
            seedRef: "test-seed-123",
            accountIndex: 0,
            addressIndex: 0
        });

        const addrChange = AddressManager.deriveChange({
            seedRef: "test-seed-123",
            accountIndex: 0,
            addressIndex: 0
        });

        expect(addrReceive.address).not.toBe(addrChange.address);
        expect(addrReceive.path).not.toBe(addrChange.path);
        expect(addrReceive.path).toContain("/0/0");
        expect(addrChange.path).toContain("/1/0");
    });

    it("invalid index blocked", () => {
        expect(() => AddressManager.path({ accountIndex: -1, chain: 0, addressIndex: 0 })).toThrow(/Invalid accountIndex/);
        expect(() => AddressManager.path({ accountIndex: 0, chain: 0, addressIndex: 1.5 })).toThrow(/Invalid addressIndex/);
    });

    it("mainnet blocked by default", () => {
        expect(() => AddressManager.deriveReceive({
            seedRef: "test-seed",
            accountIndex: 0,
            addressIndex: 0,
            network: "mainnet"
        })).toThrow(/ADDRESS_MANAGER_MAINNET_BLOCKED/);
    });

    it("no privateKey/mnemonic in JSON output", () => {
        const addr = AddressManager.deriveReceive({
            seedRef: "super-secret-seed",
            accountIndex: 0,
            addressIndex: 0
        });

        const json = JSON.stringify(addr);
        expect(json).not.toContain("privateKey");
        expect(json).not.toContain("mnemonic");
        expect(json).not.toContain("super-secret-seed"); // Ensure seed isn't leaked
        
        expect(addr.claims.realBip39).toBe(false);
        expect(addr.claims.productionCustody).toBe(false);
        expect(addr.derivationModel).toBe("deterministic-simulated-v1");
    });

    it("deterministic path string", () => {
        const path = AddressManager.path({
            accountIndex: 2,
            chain: "change",
            addressIndex: 15
        });
        expect(path).toBe("m/44'/111111'/2'/1/15");
    });
});
