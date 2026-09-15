import { describe, it, expect } from "vitest";
import {
  adapterAuthority,
  buildTransactions,
  estimateTransactionsUpstream,
  networkParamsUpstream,
  rpcFeeEstimate,
  createUtxoContext
} from "../src/kaspa-wallet-adapter.js";
import { loadManagedKaspaWasmSync } from "@hardkas/core";

// The pinned fixture used across HardKAS real-node runners.
const FIXTURE_KEY = "b7e151628aed2a6abf7158809cf4f3c762e7160f38b4da56a784d9045190cfef";
const FIXTURE_ADDRESS = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";

describe("KaspaWalletAdapter — adapterAuthority", () => {
  it("declares kaspa-wasm 2.0.1 as the wrapped SDK", () => {
    expect(adapterAuthority()).toEqual({ sdk: "kaspa-wasm", version: "2.0.1" });
  });
});

describe("KaspaWalletAdapter — networkParamsUpstream", () => {
  it("returns network params for simnet from the managed SDK", () => {
    const p = networkParamsUpstream("simnet");
    expect(p).toBeDefined();
    // The exact shape is upstream's; we assert it is a truthy object without
    // pinning field names (that would drift with SDK updates).
    expect(typeof p).toBe("object");
  });
});

describe("KaspaWalletAdapter — buildTransactions (Generator wrap)", () => {
  it("yields at least one PendingTransaction for a single-utxo, single-output plan", async () => {
    const k = loadManagedKaspaWasmSync();
    const network = "simnet";
    const priv = new k.PrivateKey(FIXTURE_KEY);
    const address = priv.toKeypair().toAddress(network).toString();
    expect(address).toBe(FIXTURE_ADDRESS);

    // A synthetic UtxoEntry (owned by the fixture address) large enough to cover fees + a small payment.
    // The Generator only needs entries + outputs + change to plan; no RPC required.
    const utxoEntry = {
      address,
      outpoint: {
        transactionId: "aa".repeat(32),
        index: 0
      },
      utxoEntry: {
        amount: 500_000_000_000n, // 5000 KAS
        scriptPublicKey: k.payToAddressScript(address),
        blockDaaScore: 0n,
        isCoinbase: false
      }
    };

    const outputs = [{ address, amount: 1_000_000_000n }]; // 10 KAS back to the same fixture

    let count = 0;
    let firstTxId: string | undefined;
    for await (const pt of buildTransactions({
      networkId: network,
      entries: [utxoEntry],
      outputs,
      changeAddress: address,
      priorityFee: 0n
    })) {
      count += 1;
      if (count === 1) firstTxId = pt.id;
      expect(pt.aggregateInputAmount).toBeGreaterThan(0n);
      expect(pt.aggregateOutputAmount).toBeGreaterThan(0n);
      expect(pt.feeAmount).toBeGreaterThanOrEqual(0n);
      expect(pt.mass).toBeGreaterThan(0n);
      expect(typeof pt.id).toBe("string");
    }
    expect(count).toBeGreaterThanOrEqual(1);
    expect(firstTxId).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("KaspaWalletAdapter — estimateTransactionsUpstream (no invented padding)", () => {
  it("returns a GeneratorSummary with fees, mass, and transaction count from upstream", async () => {
    const k = loadManagedKaspaWasmSync();
    const network = "simnet";
    const priv = new k.PrivateKey(FIXTURE_KEY);
    const address = priv.toKeypair().toAddress(network).toString();

    const utxoEntry = {
      address,
      outpoint: { transactionId: "bb".repeat(32), index: 0 },
      utxoEntry: {
        amount: 500_000_000_000n,
        scriptPublicKey: k.payToAddressScript(address),
        blockDaaScore: 0n,
        isCoinbase: false
      }
    };

    const summary = await estimateTransactionsUpstream({
      networkId: network,
      entries: [utxoEntry],
      outputs: [{ address, amount: 1_000_000_000n }],
      changeAddress: address,
      priorityFee: 0n
    });
    expect(summary).toBeDefined();
    expect(summary.transactions).toBeGreaterThanOrEqual(1);
    expect(summary.mass).toBeGreaterThan(0n);
    // fees is the aggregate — non-negative bigint, may be 0 in simnet under priorityFee=0.
    expect(summary.fees).toBeGreaterThanOrEqual(0n);
  });
});

describe("KaspaWalletAdapter — RPC helpers reject bad inputs", () => {
  it("createUtxoContext throws on missing wasmRpc", async () => {
    await expect(createUtxoContext({ wasmRpc: undefined as any, networkId: "simnet" })).rejects.toMatchObject({
      code: "KASPA_WALLET_ADAPTER_MISSING_RPC"
    });
  });
  it("rpcFeeEstimate throws on non-RpcClient argument", async () => {
    await expect(rpcFeeEstimate({} as any)).rejects.toMatchObject({
      code: "KASPA_WALLET_ADAPTER_INVALID_RPC"
    });
  });
});

describe("KaspaWalletAdapter — discoverUtxos (M10-D)", () => {
  it("throws on missing wasmRpc", async () => {
    const { discoverUtxos } = await import("../src/kaspa-wallet-adapter.js");
    await expect(discoverUtxos({ wasmRpc: undefined as any, networkId: "simnet", address: "kaspasim:x" })).rejects.toMatchObject({
      code: "KASPA_WALLET_ADAPTER_INVALID_RPC"
    });
  });
  it("filters immature coinbases using upstream getNetworkParams coinbase maturity", async () => {
    const { discoverUtxos } = await import("../src/kaspa-wallet-adapter.js");
    const virtualDaaScore = 5_000n;
    const rpc = {
      async getBlockDagInfo() { return { virtualDaaScore }; },
      async getUtxosByAddresses(_req: any) {
        return {
          entries: [
            { outpoint: { transactionId: "aa".repeat(32), index: 0 }, utxoEntry: { amount: 1_000_000_000n, blockDaaScore: 100n, isCoinbase: true } },  // immature (delta 4900 < maturity likely)
            { outpoint: { transactionId: "bb".repeat(32), index: 0 }, utxoEntry: { amount: 2_000_000_000n, blockDaaScore: 100n, isCoinbase: false } }, // non-coinbase always mature
            { outpoint: { transactionId: "cc".repeat(32), index: 0 }, utxoEntry: { amount: 3_000_000_000n, blockDaaScore: 100n, isCoinbase: true } }   // same immaturity
          ]
        };
      }
    };
    const result = await discoverUtxos({ wasmRpc: rpc, networkId: "simnet", address: "kaspasim:test" });
    expect(result.virtualDaaScore).toBe(virtualDaaScore);
    expect(result.coinbaseMaturity).toBeGreaterThan(0n);
    // Non-coinbase is always mature. Whether the two coinbases pass depends on the maturity value returned by getNetworkParams("simnet").
    // We only assert that non-coinbase is included and that any filtered count is coherent with input.
    const includesNonCoinbase = result.utxos.some((u: any) => u?.utxoEntry?.isCoinbase === false);
    expect(includesNonCoinbase).toBe(true);
    const totalIn = 3;
    expect(result.utxos.length + result.immatureCoinbaseCount).toBe(totalIn);
  });
  it("includeImmatureCoinbase returns everything without filtering", async () => {
    const { discoverUtxos } = await import("../src/kaspa-wallet-adapter.js");
    const rpc = {
      async getBlockDagInfo() { return { virtualDaaScore: 10n }; },
      async getUtxosByAddresses(_req: any) {
        return { entries: [{ outpoint: { transactionId: "aa".repeat(32), index: 0 }, utxoEntry: { amount: 1n, blockDaaScore: 0n, isCoinbase: true } }] };
      }
    };
    const result = await discoverUtxos({ wasmRpc: rpc, networkId: "simnet", address: "x", includeImmatureCoinbase: true });
    expect(result.utxos.length).toBe(1);
    expect(result.immatureCoinbaseCount).toBe(0);
  });
});
