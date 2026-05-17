import { getActiveSession, loadSessionStore } from "@hardkas/sessions";
import { resolveHardkasAccountAddress, listHardkasAccounts } from "@hardkas/accounts";
import { LoadedHardkasConfig } from "@hardkas/config";

export type BridgeLocalResolutionSource =
  | "explicit"
  | "named-session"
  | "active-session";

export interface ResolvedBridgeLocalContext {
  source: BridgeLocalResolutionSource;
  sessionName?: string;
  l1: {
    walletName: string;
    address: string;
  };
  l2: {
    accountName?: string;
    address: `0x${string}`;
  };
  bridgeMode: "local-simulated";
}

export interface ResolveBridgeOptions {
  config: LoadedHardkasConfig;
  sessionName?: string;
  from?: string;
  toIgra?: string;
}

/**
 * Resolves the L1/L2 bridge context with the following priority:
 * 1. Explicit flags (--from, --to-igra)
 * 2. Named session (--session)
 * 3. Active session
 */
export async function resolveBridgeLocalContext(options: ResolveBridgeOptions): Promise<ResolvedBridgeLocalContext> {
  const { config, sessionName, from, toIgra } = options;

  // 1. Explicit
  if (from && toIgra) {
    const l1Address = resolveHardkasAccountAddress(from, config.config);
    return {
      source: "explicit",
      l1: { walletName: from, address: l1Address },
      l2: { address: toIgra.startsWith("0x") ? (toIgra as `0x${string}`) : `0x${toIgra}` as `0x${string}` },
      bridgeMode: "local-simulated"
    };
  }

  // 2. Named Session
  if (sessionName) {
    const store = loadSessionStore();
    const session = store.sessions[sessionName];
    if (!session) {
      throw new Error(`Session "${sessionName}" not found.`);
    }
    return validateAndFormatSession(session, "named-session", config);
  }

  // 3. Active Session
  const activeSession = getActiveSession();
  if (activeSession) {
    return validateAndFormatSession(activeSession, "active-session", config);
  }

  // 4. Failure
  throw new Error(
    "No bridge context resolved.\n\n" +
    "Provide one of:\n" +
    "  hardkas bridge local plan --amount 100 --session <name>\n" +
    "  hardkas bridge local plan --amount 100 --from <wallet> --to-igra <0x...>\n" +
    "  hardkas session use <name>"
  );
}

function validateAndFormatSession(
  session: any, 
  source: BridgeLocalResolutionSource, 
  config: LoadedHardkasConfig
): ResolvedBridgeLocalContext {
  // Validate bridge mode
  if (session.bridge.mode !== "local-simulated") {
    throw new Error(`Session "${session.name}" has bridge mode "${session.bridge.mode}". Only "local-simulated" is supported in this command.`);
  }

  // Validate accounts exist in current config
  const accounts = listHardkasAccounts(config.config);
  const l1Found = accounts.find(a => a.name === session.l1.wallet);
  const l2Found = accounts.find(a => a.name === session.l2.account);

  if (!l1Found) {
    throw new Error(`Session "${session.name}" refers to missing L1 wallet "${session.l1.wallet}".`);
  }

  return {
    source,
    sessionName: session.name,
    l1: { 
      walletName: session.l1.wallet, 
      address: l1Found.address || session.l1.address || "" 
    },
    l2: { 
      accountName: session.l2.account, 
      address: (session.l2.address || "") as `0x${string}`
    },
    bridgeMode: "local-simulated"
  };
}
