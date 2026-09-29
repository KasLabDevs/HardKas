import { loadManagedKaspaWasmSync } from "./kaspa-wasm.js";
import { CANONICAL_LOCALNET } from "./node-identity.js";

/**
 * Per-network parameters, from the pinned kaspa-wasm SDK only
 * (`getNetworkParams`, `RpcClient.defaultPort`): HardKAS keeps no table of them.
 * HardKAS maps just its own names: the HardKAS simulator (`simulated`) takes
 * simnet's parameters, and simnet's default RPC endpoint is the canonical
 * localnet's.
 *
 * The SDK's maturities are wallet-core settings (wallet/core/src/utxo/settings.rs,
 * literal constants). On devnet they give a coinbase maturity of 100 DAA while
 * consensus at 10 BPS requires 1000; that is upstream's to fix and is not
 * overridden here.
 */

function paramsError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

// Testnets the pinned SDK has parameters for. On any other suffix, such as the
// retired testnet-11, its getNetworkParams aborts (Rust `unreachable!`), so those
// are refused before the call.
const SDK_TESTNETS: ReadonlySet<string> = new Set(["testnet-10", "testnet-12"]);

/** The SDK's name for a HardKAS network id. */
function sdkNetworkName(networkId: string | undefined, code: string): string {
  if (networkId === "simulated") return "simnet";
  if (!networkId) throw paramsError(code, "no network given");
  if (/^testnet(-\d+)?$/.test(networkId) && !SDK_TESTNETS.has(networkId)) {
    throw paramsError(code, `the pinned kaspa-wasm has no parameters for '${networkId}'`);
  }
  return networkId;
}

export interface KaspaSdkNetworkParams {
  /** DAA blocks before a coinbase output may be spent. */
  readonly coinbaseMaturityDaa: bigint;
  /** DAA blocks the reference wallet waits before spending a user output (wallet policy). */
  readonly userMaturityDaa: bigint;
}

/** A network's maturities as the pinned SDK gives them. */
export function sdkNetworkParams(networkId: string | undefined): KaspaSdkNetworkParams {
  const name = sdkNetworkName(networkId, "NETWORK_PARAMS_UNRESOLVED");
  const k = loadManagedKaspaWasmSync();
  let params: any;
  try {
    params = k.getNetworkParams(name);
  } catch (e: any) {
    throw paramsError("NETWORK_PARAMS_UNRESOLVED", `kaspa-wasm has no parameters for '${networkId}': ${e?.message ?? e}`);
  }
  const coinbase = params?.coinbaseTransactionMaturityPeriodDaa;
  const user = params?.userTransactionMaturityPeriodDaa;
  if (coinbase === undefined || coinbase === null || user === undefined || user === null) {
    throw paramsError("NETWORK_PARAMS_UNRESOLVED", `kaspa-wasm returned no maturities for '${networkId}'`);
  }
  return { coinbaseMaturityDaa: BigInt(coinbase), userMaturityDaa: BigInt(user) };
}

/**
 * Coinbase maturity (DAA) of a network, from the SDK. An explicit override (a
 * network's `consensusParams.coinbaseMaturity` in the HardKAS config) wins.
 * Fails closed with COINBASE_MATURITY_UNRESOLVED for networks the SDK does not
 * know.
 */
export function getCoinbaseMaturity(networkId?: string, overrideParams?: { coinbaseMaturity?: bigint | number }): bigint {
  if (overrideParams?.coinbaseMaturity !== undefined) {
    return BigInt(overrideParams.coinbaseMaturity);
  }
  try {
    return sdkNetworkParams(networkId).coinbaseMaturityDaa;
  } catch (e: any) {
    const reason = String(e?.message ?? e).replace(/^NETWORK_PARAMS_UNRESOLVED: /, "");
    throw paramsError(
      "COINBASE_MATURITY_UNRESOLVED",
      `Cannot resolve the coinbase maturity for network '${networkId ?? "unknown"}' (${reason}). Provide an explicit override.`
    );
  }
}

/**
 * Default wRPC (JSON) listen address, `host:port`, of a network: the canonical
 * localnet for simnet, the SDK's default port elsewhere.
 */
export function defaultRpcListen(networkId: string): string {
  if (networkId === "simnet" || networkId === "simulated") {
    return `${CANONICAL_LOCALNET.host}:${CANONICAL_LOCALNET.ports.jsonRpc}`;
  }
  // The port depends on the network type only, so any testnet suffix is safe here.
  const k = loadManagedKaspaWasmSync();
  try {
    return `127.0.0.1:${k.RpcClient.defaultPort(k.Encoding.SerdeJson, networkId)}`;
  } catch (e: any) {
    throw paramsError("RPC_PORT_UNRESOLVED", `kaspa-wasm has no default port for '${networkId}': ${e?.message ?? e}`);
  }
}
