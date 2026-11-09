import { describe, it, expect } from "vitest";
import { GENESIS_HASH, createKaspaSimulator, encodeKaspaAddress, scriptPublicKeyForAddress, SOMPI_PER_KAS, CONSENSUS_COINBASE_MATURITY } from "../src/index.js";

/*
 * SIM-13 / SIM-14 / SIM-15 / SIM-16 (audit 6-nov-2026), simulator only.
 */

describe("SIM-13 · acceptance: a transaction is accepted by the chain block that merges its block", () => {
  it("not by the block that contains it; getTransaction returns that transaction and its accepting block", async () => {
    const sim = createKaspaSimulator({ automine: false, bootstrapDevAccounts: true });
    const { transactionId } = await sim.transfer({ from: sim.accounts.alice, to: sim.accounts.bob, amountSompi: 10n * SOMPI_PER_KAS });
    const [containing] = sim.mine(1);
    expect(containing!.transactionIds).toContain(transactionId);
    expect(containing!.acceptedTransactionIds).not.toContain(transactionId);

    let vc = await sim.rpc.getVirtualChainFromBlock({ startHash: GENESIS_HASH, includeAcceptedTransactionIds: true });
    expect(vc.acceptedTransactionIds.some((a) => a.acceptedTransactionIds.includes(transactionId))).toBe(false);
    expect((await sim.rpc.getTransaction(transactionId))?.acceptingBlockHash).toBeNull();

    const [accepting] = sim.mine(1);
    vc = await sim.rpc.getVirtualChainFromBlock({ startHash: GENESIS_HASH, includeAcceptedTransactionIds: true });
    const entry = vc.acceptedTransactionIds.find((a) => a.acceptedTransactionIds.includes(transactionId));
    expect(entry?.acceptingBlockHash).toBe(accepting!.header.hash);
    expect(entry?.acceptingBlockHash).not.toBe(containing!.header.hash);

    const got = await sim.rpc.getTransaction(transactionId);
    expect(got.blockHash).toBe(containing!.header.hash);
    expect(got.acceptingBlockHash).toBe(accepting!.header.hash);
    expect(got.transaction.inputs.length).toBeGreaterThan(0);
    sim.close();
  });
});

describe("SIM-14 · block hashes do not depend on the clock", () => {
  it("the same history gives the same block hashes", async () => {
    const run = async () => {
      const sim = createKaspaSimulator({ automine: false, bootstrapDevAccounts: true });
      await sim.transfer({ from: sim.accounts.alice, to: sim.accounts.bob, amountSompi: SOMPI_PER_KAS });
      const first = sim.mine(1)[0]!.header.hash;
      await new Promise((r) => setTimeout(r, 5));
      const second = sim.mine(1)[0]!.header.hash;
      sim.close();
      return [first, second];
    };
    expect(await run()).toEqual(await run());
  });
});

describe("SIM-15 / SIM-16 / maturity · funding, networks and parameters", () => {
  it("fund pays the address's real script (P2PK, ECDSA, P2SH) and refuses other networks and unknown addresses", () => {
    const sim = createKaspaSimulator({ networkId: "simnet" });
    const h32 = new Uint8Array(32).fill(7);
    expect(scriptPublicKeyForAddress(sim.accounts.bob.address, "simnet")).toBe(sim.accounts.bob.scriptPublicKey);
    expect(scriptPublicKeyForAddress(encodeKaspaAddress("kaspasim", 8, h32), "simnet")).toBe(`aa20${"07".repeat(32)}87`);
    expect(scriptPublicKeyForAddress(encodeKaspaAddress("kaspasim", 1, new Uint8Array(33).fill(2)), "simnet")).toBe(`21${"02".repeat(33)}ab`);
    expect(() => sim.fund(encodeKaspaAddress("kaspa", 0, h32), 1n)).toThrow(/SIMULATOR_ADDRESS_NETWORK_MISMATCH/);
    expect(() => sim.fund("not-an-address", 1n)).toThrow(/SIMULATOR_ADDRESS_INVALID/);
    expect(() => sim.fund(sim.accounts.bob.address, 0n)).toThrow(/SIMULATOR_FUND_AMOUNT_INVALID/);
    sim.close();
  });

  it("refuses to run as mainnet (the dev keys derive from a public seed)", () => {
    expect(() => createKaspaSimulator({ networkId: "mainnet" })).toThrow(/SIMULATOR_MAINNET_REFUSED/);
  });

  it("uses the consensus coinbase maturity (1000 DAA scores at 10 BPS)", () => {
    expect(CONSENSUS_COINBASE_MATURITY).toBe(1000n);
    const sim = createKaspaSimulator({ automine: false });
    const cb = sim.mine(1)[0]!;
    const utxo = sim.ledger.getUtxosByAddress(sim.accounts.miner.address).find((u) => u.blockDaaScore === cb.header.daaScore)!;
    expect(sim.ledger.isSpendable(utxo, cb.header.daaScore + 999n)).toBe(false);
    expect(sim.ledger.isSpendable(utxo, cb.header.daaScore + 1000n)).toBe(true);
    sim.close();
  });
});
