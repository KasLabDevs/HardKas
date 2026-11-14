import { HardkasError } from "./errors.js";

/*
 * MAINNET TOTAL LOCKDOWN (owner decision, 2026-11-09) · the product policy of this release line: HardKAS makes NO
 * network connection to mainnet — reads included — and signs, broadcasts or deploys nothing on it, until the product is
 * complete, independently audited and the owner authorizes it explicitly. It revokes the read exception of
 * SDK-MAINNET-BROADCAST-GUARD-1 (MG-C2: "reading and planning on mainnet stay allowed") and prevails over any policy,
 * test or document that allowed a mainnet connection.
 *
 * Two constants, one layer shared by every path (CLI, SDK, RPC transport, toolkit, Silver, covenants, artifacts):
 *  - MAINNET_TRANSACTIONS_ENABLED → `assertMainnetTransactionsDisabled`: MAINNET_SIGNING_DISABLED /
 *    MAINNET_BROADCAST_DISABLED (offline signing included: no signed mainnet transaction is ever produced);
 *  - MAINNET_CONNECTIONS_ENABLED → `assertMainnetConnectionsDisabled`: MAINNET_CONNECTION_DISABLED, raised before any
 *    connection — by the endpoint authority (@hardkas/config resolveNodeEndpoint), by the RPC transport
 *    (@hardkas/kaspa-rpc OfficialRpcSession, before it creates a client when the expected network is mainnet, and
 *    right after the node's one identity answer when the node says mainnet), and by the paths that do not reach a node
 *    through those two.
 * `allowPublic` (which may open testnet), `experimental`, `allowMainnet`, an external signer, a direct call, a
 * `HARDKAS_*` variable or any configuration never lift either: they are constants, not settings.
 *
 * Order (decided once, pinned by the tests): the operation's own guard names the refusal. A signature is
 * MAINNET_SIGNING_DISABLED and a broadcast MAINNET_BROADCAST_DISABLED — both raised before any connection, signer call
 * or record; every other operation that would reach a mainnet node (a read, a plan, a wait, a diagnostic, a deploy's
 * reads) is MAINNET_CONNECTION_DISABLED. Only fully offline operations stay available (artifact integrity checks,
 * address derivation, unsigned records), and none of them produces a signed mainnet transaction.
 *
 * The one unavoidable limit: an endpoint declared as ANOTHER network (or a raw `--url` with no network) can only be
 * known to be mainnet from the node's own answer. The transport asks the node once (getServerInfo) before anything
 * else; when it says mainnet, the connection is closed and refused (MAINNET_CONNECTION_DISABLED) and nothing else is
 * asked. A node that lies about its network is outside what any client can decide.
 */

/** Whether HardKAS signs or broadcasts on mainnet. A constant: enabling it is an explicit product decision. */
export const MAINNET_TRANSACTIONS_ENABLED = false as const;

/**
 * MAINNET TOTAL LOCKDOWN: whether HardKAS connects to mainnet at all (reads included). A constant: enabling it is an
 * explicit, later product decision of the owner — never a flag, option, variable or configuration.
 */
export const MAINNET_CONNECTIONS_ENABLED = false as const;

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
 * WALLET-HD-0 · HardKAS's own spellings of its local simulated world, besides the rusty-kaspa simnet type itself
 * (`simnet`, `simnet-<n>`, `kaspa-simnet`): the simulator's `simulated` and the Docker localnet's `local-docker-simnet`.
 */
export const SIMNET_NETWORK_ALIASES: ReadonlySet<string> = new Set(["simulated", "local-docker-simnet"]);

/**
 * WALLET-HD-0 · whether a network NAME means the local simnet — the only network a synthetic (predictable-key) HardKAS
 * identity may exist on. Decided by the name alone, never by an address prefix: `kaspasim` (a prefix), a misspelling,
 * an empty string or any unknown name is NOT simnet (fail closed).
 */
export function isSimnetNetworkId(networkId: unknown): boolean {
  if (typeof networkId !== "string") return false;
  const n = networkId.trim().toLowerCase();
  return n !== "" && (networkTypeOf(n) === "simnet" || SIMNET_NETWORK_ALIASES.has(n));
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

/** The typed code of the permanent refusal of an unplanned send on mainnet (see `assertUnplannedSendNotOnMainnet`). */
export const MAINNET_UNPLANNED_SEND_REFUSED = "MAINNET_UNPLANNED_SEND_REFUSED" as const;

/**
 * Owner rule (2026-11-11), permanent: NOT tied to MAINNET_TRANSACTIONS_ENABLED, so lifting the lockdown one day does not
 * lift it. A mainnet broadcast goes out only with the plan that authorized it, so that HardKAS can check the signed
 * transaction against that plan (SIGNED_PLAN_MISMATCH) and check its fee limit. The unplanned-send escape
 * (`allowUnplannedSignedTransaction`, CLI `--allow-unplanned`) is for simnet, devnet and testnets only. Throws when ANY
 * of the network identities involved is of the mainnet type. While the lockdown holds, its own refusal
 * (MAINNET_BROADCAST_DISABLED) comes first.
 */
export function assertUnplannedSendNotOnMainnet(networkIds: ReadonlyArray<unknown>, context?: string): void {
  const seen = networkIds.filter((n): n is string => typeof n === "string" && n.trim() !== "");
  if (!seen.some(isMainnetNetworkId)) return;
  throw new HardkasError(
    MAINNET_UNPLANNED_SEND_REFUSED,
    `An unplanned send is never allowed on mainnet${context ? ` (${context})` : ""}: a mainnet transaction goes out only ` +
      `with the plan that authorized it, so that HardKAS can check the signed transaction against it and check its fee limit. ` +
      `allowUnplannedSignedTransaction (CLI --allow-unplanned) applies to simnet, devnet and testnets only. Nothing was sent or recorded.`,
    { metadata: { networks: [...new Set(seen)] } }
  );
}

/** The typed code of every mainnet connection refusal (core, config, RPC transport, toolkit, CLI, SDK). */
export const MAINNET_CONNECTION_DISABLED = "MAINNET_CONNECTION_DISABLED" as const;

/**
 * The one text of a mainnet connection refusal. `context` names the operation or endpoint; `contacted` says whether
 * the refusal came after the node's single identity answer (an endpoint declared as another network) or before any
 * connection at all.
 */
export function mainnetConnectionDisabledMessage(context?: string, contacted: "nothing" | "identity-only" = "nothing"): string {
  return (
    `MAINNET_CONNECTION_DISABLED: mainnet connections are disabled in HardKAS${context ? ` (${context})` : ""}, reads ` +
    `included, even to an endpoint you declare. No flag, option, environment variable or configuration enables them ` +
    `(allowPublic, experimental, allowMainnet, HARDKAS_*). Use simnet, devnet or a testnet; mainnet records are verified ` +
    `offline only. ` +
    (contacted === "identity-only"
      ? `The node answered only its identity (getServerInfo); the connection was closed and nothing else was asked. Nothing was sent.`
      : `Nothing was contacted or sent.`)
  );
}

export function mainnetConnectionDisabledError(
  context?: string,
  metadata: Record<string, unknown> = {},
  contacted: "nothing" | "identity-only" = "nothing"
): HardkasError {
  return new HardkasError(MAINNET_CONNECTION_DISABLED, mainnetConnectionDisabledMessage(context, contacted), {
    metadata: { ...metadata, contacted }
  });
}

/** Whether an error is a mainnet connection refusal (any layer: a HardkasError or the RPC transport's typed error). */
export function isMainnetConnectionDisabledError(e: unknown): boolean {
  return (e as { code?: unknown } | null)?.code === MAINNET_CONNECTION_DISABLED;
}

/**
 * MAINNET TOTAL LOCKDOWN · refuses, before any connection, an operation when ANY of the network identities involved
 * (the name asked for, the network its config entry declares, the artifact's, the instance's) is of the mainnet type —
 * `mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet[-<n>]`, any case. Throws MAINNET_CONNECTION_DISABLED. Nothing in the
 * environment or the configuration can make it return on mainnet.
 */
export function assertMainnetConnectionsDisabled(networkIds: ReadonlyArray<unknown>, context?: string): void {
  if (MAINNET_CONNECTIONS_ENABLED) return;
  const seen = networkIds.filter((n): n is string => typeof n === "string" && n.trim() !== "");
  if (!seen.some(isMainnetNetworkId)) return;
  throw mainnetConnectionDisabledError(context, { networks: [...new Set(seen)] });
}
