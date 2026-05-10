import { describe, it, expect } from "vitest";
import { mapKaspaNodeInfo } from "../src/index";

describe("mapKaspaNodeInfo", () => {
  it("should map snake_case fields correctly", () => {
    const raw = {
      server_version: "1.2.3",
      is_synced: true,
      is_utxo_indexed: false,
      p2p_id: "abc-123",
      mempool_size: 42,
      virtual_daa_score: "1000",
      network_id: "devnet"
    };
    const info = mapKaspaNodeInfo(raw);
    expect(info.serverVersion).toBe("1.2.3");
    expect(info.isSynced).toBe(true);
    expect(info.isUtxoIndexed).toBe(false);
    expect(info.p2pId).toBe("abc-123");
    expect(info.mempoolSize).toBe(42);
    expect(info.virtualDaaScore).toBe(1000n);
    expect(info.networkId).toBe("devnet");
    expect(info.raw).toBe(raw);
  });

  it("should map camelCase fields correctly", () => {
    const raw = {
      serverVersion: "1.2.3",
      isSynced: true,
      isUtxoIndexed: true,
      p2pId: "xyz-789",
      mempoolSize: 10,
      virtualDaaScore: 5000,
      networkId: "mainnet"
    };
    const info = mapKaspaNodeInfo(raw);
    expect(info.serverVersion).toBe("1.2.3");
    expect(info.isSynced).toBe(true);
    expect(info.isUtxoIndexed).toBe(true);
    expect(info.p2pId).toBe("xyz-789");
    expect(info.mempoolSize).toBe(10);
    expect(info.virtualDaaScore).toBe(5000n);
    expect(info.networkId).toBe("mainnet");
  });
});
