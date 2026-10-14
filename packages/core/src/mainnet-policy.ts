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

/** A network id that names Kaspa mainnet (`mainnet`, `kaspa`, `kaspa-mainnet`, any case). */
export function isMainnetNetworkId(networkId: unknown): boolean {
  if (typeof networkId !== "string") return false;
  const n = networkId.trim().toLowerCase();
  return n === "mainnet" || n === "kaspa" || n === "kaspa-mainnet";
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
