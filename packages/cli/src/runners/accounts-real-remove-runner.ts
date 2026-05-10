import { 
  loadRealAccountStore, 
  saveRealAccountStore, 
  removeRealDevAccount 
} from "@hardkas/accounts";

export interface AccountsRealRemoveOptions {
  name: string;
}

export async function runAccountsRealRemove(options: AccountsRealRemoveOptions): Promise<{
  formatted: string;
}> {
  const store = await loadRealAccountStore();
  if (!store) throw new Error("Real account store not found.");

  const newStore = removeRealDevAccount(store, options.name);
  await saveRealAccountStore(newStore);

  return { formatted: `Account '${options.name}' removed successfully.` };
}
