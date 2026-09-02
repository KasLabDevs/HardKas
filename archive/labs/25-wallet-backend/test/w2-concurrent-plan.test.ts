import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { KaspaRpcProvider, KaspaSubscription } from "@hardkas/kaspa-rpc";
import { HardKAS } from "@hardkas/sdk";
import { MemoryStore } from "@hardkas/core";

describe("W2 - Concurrent Planner Collision (Read Only)", () => {
  let hk: HardKAS;

  beforeAll(async () => {
    hk = new HardKAS({
      network: "simnet",
      store: new MemoryStore(),
      rpc: {
        provider: new KaspaRpcProvider(["127.0.0.1:16210"])
      }
    });
    await hk.start();
  });

  afterAll(async () => {
    await hk.stop();
  });

  it("should trigger a UTXO collision when planning concurrently", async () => {
    // 1. We need a funded account/address. We'll generate one or use a well-known dev account.
    const wallet = await hk.accounts.createWallet();
    const address = await wallet.deriveReceiveAddress();

    // Fund the address (we assume a localnet miner or we use a pre-funded dev account)
    // For this lab, we'll first ensure it has a single UTXO by mining to it or sending to it.
    // ...
  });
});
