import { 
  loadRealAccountStore, 
  saveRealAccountStore, 
  createEmptyRealAccountStore,
  getDefaultRealAccountsPath 
} from "@hardkas/accounts";

export interface AccountsRealInitOptions {
  force?: boolean;
}

export async function runAccountsRealInit(options: AccountsRealInitOptions = {}): Promise<{
  path: string;
  formatted: string;
}> {
  const filePath = getDefaultRealAccountsPath();
  const existing = await loadRealAccountStore();

  if (existing && !options.force) {
    throw new Error(`Real account store already exists at ${filePath}. Use --force to overwrite.`);
  }

  const store = createEmptyRealAccountStore();
  await saveRealAccountStore(store);

  const lines = [
    "Real dev account store initialized",
    "",
    `Path:    ${filePath}`,
    `Network: ${store.networkId}`,
    "",
    "WARNING:",
    "  Development keys only. Do not use on mainnet."
  ];

  return {
    path: filePath,
    formatted: lines.join("\n")
  };
}
