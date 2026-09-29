import { describe, it, expect } from "vitest";
import {
  CANONICAL_LOCALNET,
  KASPA_NETWORK_PARAMS,
  defaultRpcListen,
  getCoinbaseMaturity,
  loadManagedKaspaWasmSync,
  sdkNetworkParams
} from "../src/index.js";

// Network parameters come from the pinned kaspa-wasm SDK, never from a HardKAS table.

const k = loadManagedKaspaWasmSync();
const code = (f: () => unknown) => {
  try {
    f();
  } catch (e: any) {
    return e.code as string;
  }
  return "NO_ERROR";
};

describe("network parameters from the pinned SDK", () => {
  it("maturities are kaspa-wasm getNetworkParams' for every network it knows", () => {
    for (const id of ["mainnet", "testnet-10", "testnet-12", "simnet", "devnet"]) {
      const sdk = k.getNetworkParams(id);
      expect(sdkNetworkParams(id), id).toEqual({
        coinbaseMaturityDaa: BigInt(sdk.coinbaseTransactionMaturityPeriodDaa),
        userMaturityDaa: BigInt(sdk.userTransactionMaturityPeriodDaa)
      });
      expect(getCoinbaseMaturity(id), id).toBe(BigInt(sdk.coinbaseTransactionMaturityPeriodDaa));
    }
  });

  it("mainnet and testnet coinbase maturity is 1000 DAA (the former HardKAS table said 244 and 100)", () => {
    expect(getCoinbaseMaturity("mainnet")).toBe(1000n);
    expect(getCoinbaseMaturity("testnet-10")).toBe(1000n);
  });

  it("the HardKAS simulator takes simnet's parameters, and an explicit override wins", () => {
    expect(getCoinbaseMaturity("simulated")).toBe(getCoinbaseMaturity("simnet"));
    expect(getCoinbaseMaturity("mainnet", { coinbaseMaturity: 7 })).toBe(7n);
  });

  it("fails closed for networks the SDK does not know, refusing testnet-11 before the SDK aborts on it", () => {
    for (const id of ["testnet-11", "testnet", "igra", undefined]) {
      expect(code(() => getCoinbaseMaturity(id)), String(id)).toBe("COINBASE_MATURITY_UNRESOLVED");
    }
    expect(code(() => sdkNetworkParams("testnet-11"))).toBe("NETWORK_PARAMS_UNRESOLVED");
    // The SDK was never driven into its abort: it still answers.
    expect(getCoinbaseMaturity("simnet")).toBe(1000n);
  });

  it("default RPC listen: the SDK's port, the canonical localnet for simnet", () => {
    for (const id of ["mainnet", "testnet-10", "testnet-11", "devnet"]) {
      expect(defaultRpcListen(id), id).toBe(`127.0.0.1:${k.RpcClient.defaultPort(k.Encoding.SerdeJson, id)}`);
    }
    expect(defaultRpcListen("simnet")).toBe(`${CANONICAL_LOCALNET.host}:${CANONICAL_LOCALNET.ports.jsonRpc}`);
    expect(code(() => defaultRpcListen("igra"))).toBe("RPC_PORT_UNRESOLVED");
  });

  it("the consensus table keeps no maturity copy", () => {
    for (const p of Object.values(KASPA_NETWORK_PARAMS)) {
      expect(p).not.toHaveProperty("coinbaseMaturityDaa");
      expect(p).not.toHaveProperty("walletUserTxMaturityDaa");
    }
  });
});
