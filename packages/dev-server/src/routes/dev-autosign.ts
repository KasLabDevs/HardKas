import { declaredNetworkIdOf, isMainnetNetworkId, isSimnetNetworkId, networkTypeOf } from "@hardkas/core";
import { resolveNodeEndpoint } from "@hardkas/config";

/*
 * TX-06 / ESCALÓN 4 · P38 (+ P35) · the one server decision on signing with the dev-server's own accounts for an HTTP
 * client. Every route that does it asks here: `POST /api/tx/send` with `allowDevAutoSign` and `POST /api/tx/sign`
 * (dapp-tx.ts), and the escrow routes `POST /api/escrows/:id/fund` and `POST /api/escrows/:id/sign` (escrow.ts, since
 * the pre-release round: they signed with the server's dev accounts without the variable). Moved here from dapp-tx.ts
 * unchanged, so both route files share it without the escrow routes loading the SDK; dapp-tx.ts re-exports it.
 */

/** P35 · the network a name is and the one its config entry declares (an alias such as `prod` decides by the latter too). */
function namesOf(network: string, config: unknown): string[] {
  return [network, declaredNetworkIdOf(config, network) ?? network];
}

/** P35 · mainnet by any spelling (`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet`, any case) or by its config entry. */
export function isMainnetDevServerNetwork(network: string, config?: unknown): boolean {
  return namesOf(network, config).some(isMainnetNetworkId);
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "[::1]", "::1"]);

/** P38 · the node a simnet name reaches is on this machine: its endpoint (declared, else the canonical localnet) is loopback. */
function simnetEndpointIsLocal(network: string, config: unknown): boolean {
  try {
    const { url } = resolveNodeEndpoint({ config: (config ?? {}) as any, networkId: network });
    return LOOPBACK_HOSTS.has(new URL(url).hostname.toLowerCase());
  } catch {
    return false;
  }
}

/**
 * TX-06 / ESCALÓN 4 · P38 · whether THIS server signs with its own accounts for an HTTP client (POST /api/tx/send with
 * `allowDevAutoSign`, POST /api/tx/sign, POST /api/escrows/:id/fund and /sign). Disabled by default: only the server's
 * operator opens it, with `HARDKAS_DEV_SERVER_AUTOSIGN=1` in the server's environment, and then only on the local
 * worlds: the simulated ledger (`simulated`, nothing reaches a node) and a local simnet (the name and the network its
 * config entry declares are simnet, and its node endpoint is loopback). Any other network is refused, TN10 and devnet
 * included, and mainnet in any spelling or alias always (P35). The client's `allowDevAutoSign: true` is only its
 * explicit request on /send: required, never enough by itself.
 */
export function serverAllowsDevAutoSign(network: string, env: NodeJS.ProcessEnv = process.env, config?: unknown): boolean {
  if (env.HARDKAS_DEV_SERVER_AUTOSIGN !== "1") return false;
  const name = String(network ?? "");
  if (isMainnetDevServerNetwork(name, config)) return false;
  const [own, declared] = namesOf(name, config) as [string, string];
  if (own === "simulated" && declared === "simulated") return true;
  // the declared network must be simnet; the name itself may be an alias, but never another network type
  const ownType = networkTypeOf(own);
  if (!isSimnetNetworkId(declared) || (ownType !== undefined && ownType !== "simnet")) return false;
  return simnetEndpointIsLocal(name, config);
}

/** The refusal of a server signature for a client, with the network named and nothing planned, signed or sent. */
export function autoSignRefusal(network: string): { code: string; message: string } {
  return {
    code: "DEV_AUTOSIGN_NOT_ALLOWED",
    message:
      `This dev-server does not sign for clients on "${network}". Server-side signing for HTTP clients is off by default; ` +
      "the server's operator enables it with HARDKAS_DEV_SERVER_AUTOSIGN=1 in the server's environment, and then only on " +
      "the simulated ledger or a local simnet (never testnet, devnet or mainnet). Nothing was planned, signed or sent."
  };
}
