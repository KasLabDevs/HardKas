import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { KaspaRpcProvider } from "@hardkas/kaspa-rpc";
import { HardKAS } from "@hardkas/sdk";
import { MemoryStore } from "@hardkas/core";

describe("W1 - Sequential Send", () => {
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

  it("should send sequentially", async () => {
    // 1. Create wallet and address
    const wallet = await hk.accounts.createWallet();
    const address = await wallet.deriveReceiveAddress();

  it("should send sequentially with proper exclusion", async () => {
    // Scaffold W1: sequential send logic
    console.log("W1 scaffolded");
  });
});
