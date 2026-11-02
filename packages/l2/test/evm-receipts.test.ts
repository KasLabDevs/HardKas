import { describe, it, expect } from "vitest";
import { normalizeEvmTransactionReceipt } from "../src/evm-receipts.js";

const FROM = "0x1111111111111111111111111111111111111111";
const TO = "0x2222222222222222222222222222222222222222";

describe("EVM Receipt Normalization", () => {
  it("should return null for null input", () => {
    expect(normalizeEvmTransactionReceipt(null)).toBeNull();
  });

  it("rejects a receipt without a valid transactionHash (typed error, not null)", () => {
    expect(() => normalizeEvmTransactionReceipt({ status: "0x1" })).toThrow(
      expect.objectContaining({ code: "L2_RECEIPT_INVALID" })
    );
  });

  it("should normalize successful receipt", () => {
    const raw = {
      transactionHash: "0x" + "a".repeat(64),
      status: "0x1",
      blockNumber: "0x123",
      gasUsed: "0x5208",
      effectiveGasPrice: "0x3b9aca00",
      from: FROM,
      to: TO
    };

    const result = normalizeEvmTransactionReceipt(raw);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("success");
    expect(result?.blockNumber).toBe(291n);
    expect(result?.gasUsed).toBe(21000n);
    expect(result?.effectiveGasPrice).toBe(1000000000n);
    expect(result?.txHash).toBe(raw.transactionHash);
    expect(result?.executionScope).toBe("l2_execution");
    expect(result?.observation).toBe("rpc_reported");
    expect(result?.l1SettlementStatus).toBe("unverified_on_l1");
  });

  it("should normalize reverted receipt", () => {
    const result = normalizeEvmTransactionReceipt({
      transactionHash: "0x" + "b".repeat(64),
      status: "0x0"
    });
    expect(result?.status).toBe("reverted");
    expect(result?.executionScope).toBe("l2_execution");
  });

  it("should normalize unknown status (never success)", () => {
    const result = normalizeEvmTransactionReceipt({
      transactionHash: "0x" + "c".repeat(64),
      status: "0x2"
    });
    expect(result?.status).toBe("unknown");
  });

  it("rejects malformed quantities and addresses with a typed error", () => {
    const h = "0x" + "d".repeat(64);
    for (const bad of [
      { transactionHash: h, blockNumber: "garbage" },
      { transactionHash: h, gasUsed: 21000 },
      { transactionHash: h, from: "0x123" },
      { transactionHash: h, contractAddress: "0xZZ" },
      { transactionHash: h, blockHash: "0x1234" }
    ]) {
      expect(() => normalizeEvmTransactionReceipt(bad)).toThrow(
        expect.objectContaining({ code: "L2_RECEIPT_INVALID" })
      );
    }
  });
});
