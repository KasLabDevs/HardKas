import { describe, it, expect } from "vitest";
import { UTXO } from "@hardkas/core";
import { WatchOnlyWalletProvider } from "../src/providers/watch-only.js";
import { InMemoryWalletProvider } from "../src/providers/in-memory.js";

const mockUtxos: UTXO[] = [
  { 
      outpoint: { transactionId: "tx1", index: 0 }, 
      amountSompi: "10000000", 
      scriptPublicKey: { scriptPublicKey: "spk1", version: 0 }, 
      blockDaaScore: 100n, 
      isCoinbase: false 
  }
];

describe("P2 Wallet Providers", () => {

  it("WatchOnlyProvider correctly reports capabilities and rejects signing", async () => {
    const provider = new WatchOnlyWalletProvider("testnet", ["kaspa:test"], mockUtxos);
    
    expect(provider.capabilities.canSign).toBe(false);
    expect(provider.capabilities.watchOnly).toBe(true);

    const addresses = await provider.getAddresses();
    expect(addresses.length).toBe(1);

    await expect(
        provider.signTransaction({ plan: {} as any })
    ).rejects.toThrow(/WatchOnlyWalletProvider cannot sign transactions/);
  });

  it("InMemoryWalletProvider provides UTXOs deterministically", async () => {
    const provider = new InMemoryWalletProvider("testnet", ["kaspa:test2"], mockUtxos);
    
    const utxos1 = await provider.getUtxos();
    const utxos2 = await provider.getUtxos();
    
    expect(utxos1).toEqual(utxos2);
    expect(utxos1.length).toBe(1);
    expect(utxos1[0].amountSompi).toBe("10000000");
  });

  it("Provider without UTXOs returns an empty array, not an error", async () => {
    const provider = new InMemoryWalletProvider("testnet", ["kaspa:empty"], []);
    const utxos = await provider.getUtxos();
    expect(Array.isArray(utxos)).toBe(true);
    expect(utxos.length).toBe(0);
  });

  it("InMemoryWalletProvider signs every input of a plan", async () => {
    const provider = new InMemoryWalletProvider("testnet", ["kaspa:test"], mockUtxos);
    const utxos = await provider.getUtxos();
    const plan = { inputs: utxos, unsignedPayload: "unsigned-payload" };

    const signResult = await provider.signTransaction({ plan } as any);

    expect(signResult.signedInputs).toEqual([0]);
    const artifactParsed = JSON.parse(signResult.artifact);
    expect(artifactParsed.signatures[0]).toBe("mock-sig");
    expect(artifactParsed.payload).toBe("unsigned-payload");
  });
});
