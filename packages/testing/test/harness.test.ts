import { describe, it, expect } from "vitest";
import { createTestHarness, createFixture } from "../src/index.js";
import "../src/setup.js";

describe("TestHarness", () => {
  it("creates harness with default 3 accounts", () => {
    const h = createTestHarness();
    expect(h.accountNames().length).toBe(3);
  });

  it("send returns accepted receipt", () => {
    const h = createTestHarness();
    const names = h.accountNames();
    const result = h.send({ from: names[0]!, to: names[1]!, amountSompi: 10_000_000_000n });
    expect(result.ok).toBe(true);
    expect(result.receipt).toBeAccepted();
  });

  it("send updates balances correctly", () => {
    const h = createTestHarness({ accounts: 2, initialBalance: 100_000_000_000n });
    const [alice, bob] = h.accountNames();
    const preBob = h.balanceOf(bob!);
    h.send({ from: alice!, to: bob!, amountSompi: 25_000_000_000n });
    const postBob = h.balanceOf(bob!);
    expect(postBob - preBob).toBe(25_000_000_000n);
  });

  it("receipt has valid txId", () => {
    const h = createTestHarness();
    const names = h.accountNames();
    const result = h.send({ from: names[0]!, to: names[1]!, amountSompi: 1_000_000_000n });
    expect(result.receipt).toHaveValidTxId();
  });

  it("reset returns to initial state", () => {
    const h = createTestHarness({ accounts: 2, initialBalance: 50_000_000_000n });
    const [alice] = h.accountNames();
    const initialBalance = h.balanceOf(alice!);
    h.send({ from: alice!, to: h.accountNames()[1]!, amountSompi: 10_000_000_000n });
    h.reset();
    expect(h.balanceOf(alice!)).toBe(initialBalance);
  });

  it("fixture applies setup transactions", () => {
    const f = createFixture({
      name: "funded-bob",
      accounts: 3,
      initialBalance: 100_000_000_000n,
      setup: [
        { from: "alice", to: "bob", amountSompi: 30_000_000_000n }
      ]
    });
    const bobBalance = f.balanceOf("bob");
    expect(bobBalance).toBeGreaterThan(100_000_000_000n);
  });

  it("insufficient funds fails gracefully", () => {
    const h = createTestHarness({ accounts: 2, initialBalance: 10_000_000_000n });
    const [alice, bob] = h.accountNames();
    const result = h.send({ from: alice!, to: bob!, amountSompi: 999_000_000_000n });
    expect(result.ok).toBe(false);
    expect(result.receipt).toBeFailed();
  });
});

describe("Custom Matchers", () => {
  it("toBeAccepted works on valid receipt", () => {
    expect({ status: "accepted", txId: "simtx_abc" }).toBeAccepted();
  });

  it("toBeFailed works on failed receipt", () => {
    expect({ status: "failed" }).toBeFailed();
  });

  it("toHaveValidContentHash works on 64-char hex", () => {
    expect({ contentHash: "a".repeat(64) }).toHaveValidContentHash();
  });

  it("toHaveValidContentHash fails on short hash", () => {
    expect(() => {
      expect({ contentHash: "abc" }).toHaveValidContentHash();
    }).toThrow();
  });
});
