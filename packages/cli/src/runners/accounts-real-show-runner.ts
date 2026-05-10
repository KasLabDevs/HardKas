import { 
  loadRealAccountStore, 
  getRealDevAccount,
  getDefaultRealAccountsPath 
} from "@hardkas/accounts";

export interface AccountsRealShowOptions {
  name: string;
  showPrivate?: boolean;
}

export async function runAccountsRealShow(options: AccountsRealShowOptions): Promise<{
  formatted: string;
}> {
  const store = await loadRealAccountStore();
  const account = store ? getRealDevAccount(store, options.name) : null;
  
  if (!account) {
    throw new Error(`Account '${options.name}' not found in real store.`);
  }

  const lines = [
    `Account: ${account.name}`,
    `Address: ${account.address}`,
    `Created: ${account.createdAt}`,
    ""
  ];

  if (account.publicKey) lines.push(`Public Key:  ${account.publicKey}`);
  if (account.privateKey) {
    const pk = options.showPrivate ? account.privateKey : "[masked]";
    lines.push(`Private Key: ${pk}${options.showPrivate ? " (plaintext)" : ""}`);
  }

  return { formatted: lines.join("\n") };
}
