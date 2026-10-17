import { HardkasError } from "./errors.js";

/*
 * SDK-MAINNET-BROADCAST-GUARD-1 · the product policy of this release line: HardKAS does not sign or broadcast
 * transactions on mainnet. One authority for every high-level path (SDK tx.sign / tx.send, workflows through them,
 * WalletToolkit, the CLI, the accounts signer). `allowPublic` (which may open testnet), `experimental`, an external
 * signer or a direct call never lift it. The raw RPC transport (`sdk.rpc`, @hardkas/kaspa-rpc) is a low-level API
 * outside this policy and is not a safe way to broadcast on mainnet.
 */

/** Whether HardKAS signs or broadcasts on mainnet. A constant: enabling it is an explicit product decision. */
export const MAINNET_TRANSACTIONS_ENABLED = false as const;

/** The Kaspa network types (rusty-kaspa `NetworkType`). */
export type KaspaNetworkType = "mainnet" | "testnet" | "devnet" | "simnet";

/**
 * MAINNET-PERIMETER-1 (B2): the network TYPE an id names, the way rusty-kaspa parses a NetworkId — `<type>[-<suffix>]`
 * (consensus/core/src/network.rs), so `mainnet-1` is mainnet — plus HardKAS's `kaspa` / `kaspa-` spellings, any case,
 * trimmed. `undefined` for any other name (a config alias such as "prod", "simulated"): such a name never decides by
 * itself; the network a config entry declares does (see `declaredNetworkIdOf`).
 */
export function networkTypeOf(networkId: unknown): KaspaNetworkType | undefined {
  if (typeof networkId !== "string") return undefined;
  let n = networkId.trim().toLowerCase();
  if (n === "kaspa") return "mainnet";
  if (n.startsWith("kaspa-")) n = n.slice("kaspa-".length);
  const m = /^(mainnet|testnet|devnet|simnet)(?:-\d+)?$/.exec(n);
  return m ? (m[1] as KaspaNetworkType) : undefined;
}

/** A network id of the mainnet type (`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet[-<n>]`, any case). */
export function isMainnetNetworkId(networkId: unknown): boolean {
  return networkTypeOf(networkId) === "mainnet";
}

/**
 * MAINNET-PERIMETER-1 (B2): the network a config entry DECLARES (`networks[name].network`), else the name itself. A
 * config may name an entry anything ("prod"); the guard decides from what the entry says it is, not from its name.
 */
export function declaredNetworkIdOf(config: unknown, name: unknown): string | undefined {
  if (typeof name !== "string") return undefined;
  const declared = (config as { networks?: Record<string, { network?: unknown } | undefined> } | undefined)?.networks?.[name]?.network;
  return typeof declared === "string" && declared.trim() !== "" ? declared : name;
}

export type MainnetTransactionOperation = "sign" | "broadcast";

/**
 * Refuses a sign or a broadcast when ANY of the network identities involved (the artifact's, the instance's, the
 * node's when known) is mainnet — never only the one a caller declares. Throws `MAINNET_SIGNING_DISABLED` or
 * `MAINNET_BROADCAST_DISABLED` before anything is signed, sent or recorded.
 */
export function assertMainnetTransactionsDisabled(
  operation: MainnetTransactionOperation,
  networkIds: ReadonlyArray<unknown>,
  context?: string
): void {
  if (MAINNET_TRANSACTIONS_ENABLED) return;
  const seen = networkIds.filter((n): n is string => typeof n === "string" && n.trim() !== "");
  if (!seen.some(isMainnetNetworkId)) return;
  const sign = operation === "sign";
  throw new HardkasError(
    sign ? "MAINNET_SIGNING_DISABLED" : "MAINNET_BROADCAST_DISABLED",
    `Mainnet ${sign ? "signing" : "broadcast"} is disabled in HardKAS${context ? ` (${context})` : ""}: ` +
      `allowPublic, an external signer or a direct call do not enable it. Use simnet or testnet for real transactions. ` +
      `Nothing was ${sign ? "signed" : "sent"} or recorded.`,
    { metadata: { operation, networks: [...new Set(seen)] } }
  );
}
