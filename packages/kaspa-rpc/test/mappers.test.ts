import { describe, it, expect } from "vitest";
import { mapKaspaAddressBalance, mapKaspaRpcUtxos } from "../src";

describe("RPC mappers", () => {
  describe("mapKaspaAddressBalance", () => {
    it("should handle balance as string", () => {
      const res = mapKaspaAddressBalance({ balance: "100000000" }, "addr1");
      expect(res.balanceSompi).toBe(100000000n);
    });

    it("should handle balance as number", () => {
      const res = mapKaspaAddressBalance({ balance: 100000000 }, "addr1");
      expect(res.balanceSompi).toBe(100000000n);
    });

    it("should handle balanceSompi field", () => {
      const res = mapKaspaAddressBalance({ balanceSompi: "500" }, "addr1");
      expect(res.balanceSompi).toBe(500n);
    });

    it("should handle missing balance", () => {
      const res = mapKaspaAddressBalance({}, "addr1");
      expect(res.balanceSompi).toBe(0n);
    });
  });

  describe("mapKaspaRpcUtxos", () => {
    it("should handle array of entries with snake_case", () => {
      const raw = {
        entries: [
          {
            outpoint: { transaction_id: "tx1", index: 1 },
            utxo_entry: { amount: "100", is_coinbase: true }
          }
        ]
      };
      const utxos = mapKaspaRpcUtxos(raw, "addr1");
      expect(utxos.length).toBe(1);
      expect(utxos[0].outpoint.transactionId).toBe("tx1");
      expect(utxos[0].amountSompi).toBe(100n);
      expect(utxos[0].isCoinbase).toBe(true);
    });

    it("should handle camelCase and flat structure", () => {
      const raw = [
        {
          transactionId: "tx2",
          index: 0,
          amountSompi: 200,
          isCoinbase: false
        }
      ];
      const utxos = mapKaspaRpcUtxos(raw, "addr2");
      expect(utxos.length).toBe(1);
      expect(utxos[0].outpoint.transactionId).toBe("tx2");
      expect(utxos[0].amountSompi).toBe(200n);
    });

    it("should handle nested utxoEntry", () => {
      const raw = {
        utxos: [
          {
            outpoint: { transactionId: "tx3", index: 5 },
            utxoEntry: { amount: "300" }
          }
        ]
      };
      const utxos = mapKaspaRpcUtxos(raw, "addr3");
      expect(utxos[0].amountSompi).toBe(300n);
    });
  });
});
