import { describe, it, expect } from "vitest";
import { normalizeEvmTransactionReceipt } from "../src/evm-receipts.js";

describe("EVM Receipt Normalization", () => {
  it("should return null for null input", () => {
    expect(normalizeEvmTransactionReceipt(null)).toBeNull();
  });

  it("should return null if transactionHash is missing", () => {
    expect(normalizeEvmTransactionReceipt({ status: "0x1" })).toBeNull();
  });

  it("should normalize successful receipt", () => {
    const raw = {
      transactionHash: "0x" + "a".repeat(64),
      status: "0x1",
      blockNumber: "0x123",
      gasUsed: "0x5208",
      effectiveGasPrice: "0x3b9aca00",
      from: "0x123",
      to: "0x456"
    };

    const result = normalizeEvmTransactionReceipt(raw);
    expect(result).not.toBeNull();
    expect(result?.status).toBe("success");
    expect(result?.blockNumber).toBe(291n);
    expect(result?.gasUsed).toBe(21000n);
    expect(result?.effectiveGasPrice).toBe(1000000000n);
    expect(result?.txHash).toBe(raw.transactionHash);
  });

  it("should normalize reverted receipt", () => {
    const raw = {
      transactionHash: "0x" + "b".repeat(64),
      status: "0x0"
    };

    const result = normalizeEvmTransactionReceipt(raw);
    expect(result?.status).toBe("reverted");
  });

  it("should normalize unknown status", () => {
    const raw = {
      transactionHash: "0x" + "c".repeat(64),
      status: "0x2"
    };

    const result = normalizeEvmTransactionReceipt(raw);
    expect(result?.status).toBe("unknown");
  });
});
