import { 
  loadOrCreateRealAccountStore, 
  saveRealAccountStore, 
  importRealDevAccount 
} from "@hardkas/accounts";

export interface AccountsRealImportOptions {
  name: string;
  address: string;
  publicKey?: string;
  privateKey?: string;
}

export async function runAccountsRealImport(options: AccountsRealImportOptions): Promise<{
  formatted: string;
}> {
  let store = await loadOrCreateRealAccountStore();

  store = importRealDevAccount(store, {
    name: options.name,
    address: options.address,
    ...(options.publicKey ? { publicKey: options.publicKey } : {}),
    ...(options.privateKey ? { privateKey: options.privateKey } : {})
  });

  await saveRealAccountStore(store);

  return { formatted: `Account '${options.name}' imported successfully.` };
}
