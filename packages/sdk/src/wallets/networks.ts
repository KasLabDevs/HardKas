/*
 * R3-C · the networks a browser wallet names, read as HardKAS network ids. BROWSER-SAFE: no Node import.
 *
 * A wallet says its network in its own words — KasWare `getNetwork()` ("kaspa_mainnet", "kaspa_testnet_10", …), Kastle the
 * id it was connected with, Kaspire nothing but its address prefix (NOTES-CROSSCHECK §2.3 item 6, UNVERIFIED against the
 * extensions). Anything HardKAS cannot read as one Kaspa L1 network is refused (WALLET_NETWORK_UNKNOWN): a KasWare on the
 * IGRA L2 has a Kaspa-looking address that does not say so, and a guess would sign for another chain.
 */

export type WalletNetworkFamily = "mainnet" | "testnet" | "simnet" | "devnet";

/** A HardKAS network id ("mainnet", "testnet-10", "simnet", "devnet") from a wallet's or a workspace's network name; undefined if none. */
export function walletNetworkIdOf(raw: unknown): string | undefined {
  if (typeof raw !== "string") return undefined;
  const s = raw.trim().toLowerCase().replace(/^kaspa[_-]?/, "").replace(/_/g, "-");
  if (s === "mainnet") return "mainnet";
  if (s === "simnet") return "simnet";
  if (s === "devnet") return "devnet";
  const t = /^testnet-?(\d+)$/.exec(s);
  return t ? `testnet-${Number(t[1])}` : undefined;
}

/** Fail closed: any network name that reads as mainnet, merely mentions it, or is the bare "kaspa" (core's spelling of mainnet), is mainnet. */
export function isMainnetName(raw: unknown): boolean {
  if (typeof raw !== "string") return false;
  return walletNetworkIdOf(raw) === "mainnet" || /mainnet/i.test(raw) || /^\s*kaspa\s*$/i.test(raw);
}

/** The network family an address prefix settles ("kaspa:" is mainnet, "kaspatest:" a testnet whose number it does not say). */
export function addressNetworkFamily(address: unknown): WalletNetworkFamily | undefined {
  if (typeof address !== "string") return undefined;
  const prefix = address.split(":")[0]?.toLowerCase();
  if (prefix === "kaspa") return "mainnet";
  if (prefix === "kaspatest") return "testnet";
  if (prefix === "kaspasim") return "simnet";
  if (prefix === "kaspadev") return "devnet";
  return undefined;
}

/** The family of a HardKAS network id. */
export function networkFamilyOf(networkId: string): WalletNetworkFamily | undefined {
  const id = walletNetworkIdOf(networkId);
  if (id === undefined) return undefined;
  return id.startsWith("testnet-") ? "testnet" : (id as WalletNetworkFamily);
}
