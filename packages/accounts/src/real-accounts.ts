import fs from "node:fs";
import path from "node:path";
import type { NetworkId } from "@hardkas/core";
import { writeFileAtomicSync } from "@hardkas/core";
import { HardkasArtifactBase, HARDKAS_VERSION, ARTIFACT_SCHEMAS, ARTIFACT_VERSION } from "@hardkas/artifacts";

export interface RealAccountStore extends HardkasArtifactBase {
  readonly schema: "hardkas.realAccountStore.v1";
  readonly networkId: NetworkId; // usually "simnet" or "testnet-10"
  readonly mode: "real";
  readonly connectionMode?: "node" | "rpc";
  readonly warning: string;
  readonly accounts: readonly RealDevAccount[];
}

export interface RealDevAccount {
  readonly name: string;
  readonly address: string;
  readonly publicKey?: string;
  /** @deprecated Use keystoreRef for encrypted storage. Plaintext keys in this field are considered legacy/unsafe. */
  readonly privateKey?: string;
  /** Reference to the encrypted keystore file in .hardkas/keystore/ */
  readonly keystoreRef?: string;
  readonly createdAt: string;
}

export function getDefaultRealAccountsPath(cwd: string = process.cwd()): string {
  return path.join(cwd, ".hardkas", "accounts.real.json");
}

export function createEmptyRealAccountStore(): RealAccountStore {
  return {
    schema: ARTIFACT_SCHEMAS.REAL_ACCOUNT_STORE,
    hardkasVersion: HARDKAS_VERSION,
    version: ARTIFACT_VERSION,
    createdAt: new Date().toISOString(),
    networkId: "simnet" as NetworkId,
    mode: "real",
    connectionMode: "node",
    warning: "HardKAS: Development account store. Encrypted storage is default. Unsafe plaintext storage is legacy.",
    accounts: []
  };
}

export function loadRealAccountStoreSync(options?: {
  readonly cwd?: string;
  readonly path?: string;
}): RealAccountStore | null {
  const filePath = options?.path || getDefaultRealAccountsPath(options?.cwd);

  if (!fs.existsSync(filePath)) {
    return null;
  }

  try {
    const data = fs.readFileSync(filePath, "utf-8");
    const store = JSON.parse(data) as RealAccountStore;

    // Check for plaintext keys
    const plaintextAccounts = store.accounts.filter(a => a.privateKey);
    if (plaintextAccounts.length > 0) {
      const names = plaintextAccounts.map(a => a.name).join(", ");
      console.warn(`\n  ⚠️  [SECURITY WARNING] Plaintext private keys detected in legacy account store for: ${names}`);
      console.warn(`     Location: ${filePath}`);
      console.warn(`     Recommendation: Re-import these accounts using encrypted keystores.\n`);
    }

    return store;
  } catch (e) {
    throw new Error(`Failed to load real account store at ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export async function loadRealAccountStore(options?: {
  readonly cwd?: string;
  readonly path?: string;
}): Promise<RealAccountStore | null> {
  return loadRealAccountStoreSync(options);
}

export async function loadOrCreateRealAccountStore(options?: {
  readonly cwd?: string;
  readonly path?: string;
}): Promise<RealAccountStore> {
  const store = await loadRealAccountStore(options);
  if (store) return store;

  const newStore = createEmptyRealAccountStore();
  await saveRealAccountStore(newStore, options);
  return newStore;
}

export async function saveRealAccountStore(
  store: RealAccountStore,
  options?: {
    readonly cwd?: string;
    readonly path?: string;
  }
): Promise<void> {
  const filePath = options?.path || getDefaultRealAccountsPath(options?.cwd);

  try {
    // Enforce restrictive permissions (0600) via atomic write
    writeFileAtomicSync(filePath, JSON.stringify(store, null, 2), {
      encoding: "utf-8",
      mode: 0o600
    });
  } catch (e) {
    throw new Error(`Failed to save real account store at ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export function validateAccountName(name: string): void {
  if (!name) {
    throw new Error("Account name is required.");
  }
  const nameRegex = /^[a-zA-Z0-9_-]+$/;
  if (!nameRegex.test(name)) {
    throw new Error(`Invalid account name '${name}'. Only letters, numbers, dashes and underscores are allowed.`);
  }
}

export function validateAddressPrefix(address: string): void {
  if (!address) {
    throw new Error("Address is required.");
  }
  const validPrefixes = ["kaspa:", "kaspatest:", "kaspasim:"];
  const hasValidPrefix = validPrefixes.some(prefix => address.startsWith(prefix));
  if (!hasValidPrefix) {
    throw new Error(`Invalid address '${address}'. Must start with one of: ${validPrefixes.join(", ")}`);
  }
}

export function importRealDevAccount(
  store: RealAccountStore,
  account: {
    readonly name: string;
    readonly address: string;
    readonly publicKey?: string;
    readonly privateKey?: string;
  }
): RealAccountStore {
  validateAccountName(account.name);
  validateAddressPrefix(account.address);

  if (store.accounts.some(a => a.name.toLowerCase() === account.name.toLowerCase())) {
    throw new Error(`Account with name '${account.name}' already exists.`);
  }

  const newAccount: RealDevAccount = {
    ...account,
    createdAt: new Date().toISOString()
  };

  return {
    ...store,
    accounts: [...store.accounts, newAccount]
  };
}

export function removeRealDevAccount(
  store: RealAccountStore,
  name: string
): RealAccountStore {
  const index = store.accounts.findIndex(a => a.name.toLowerCase() === name.toLowerCase());
  if (index === -1) {
    throw new Error(`Account with name '${name}' not found.`);
  }

  const newAccounts = [...store.accounts];
  newAccounts.splice(index, 1);

  return {
    ...store,
    accounts: newAccounts
  };
}

export function getRealDevAccount(
  store: RealAccountStore,
  name: string
): RealDevAccount | null {
  return store.accounts.find(a => a.name.toLowerCase() === name.toLowerCase()) || null;
}

export function listRealDevAccounts(
  store: RealAccountStore
): readonly RealDevAccount[] {
  return store.accounts;
}

/**
 * Resolves a name (alias) or a direct Kaspa address from the real store.
 */
export function resolveRealAccountOrAddress(
  store: RealAccountStore | null,
  nameOrAddress: string
): { address: string; name?: string } {
  // 1. Try to find as account name
  const account = store ? getRealDevAccount(store, nameOrAddress) : null;
  if (account) {
    return { address: account.address, name: account.name };
  }

  // 2. Otherwise assume it's a direct address
  if (nameOrAddress.startsWith("kaspa:") || nameOrAddress.startsWith("kaspatest:") || nameOrAddress.startsWith("kaspasim:")) {
    return { address: nameOrAddress };
  }
  
  throw new Error(`'${nameOrAddress}' is not a registered real account name and is not a valid Kaspa address.`);
}
