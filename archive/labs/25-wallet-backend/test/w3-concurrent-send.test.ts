import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { KaspaRpcProvider } from "@hardkas/kaspa-rpc";
import { HardKAS } from "@hardkas/sdk";
import { MemoryStore } from "@hardkas/core";

describe("W3 - Concurrent Send Collision", () => {
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

  it("should trigger a UTXO collision when sending concurrently", async () => {
    // Scaffold W3: full send concurrent
  });
});
