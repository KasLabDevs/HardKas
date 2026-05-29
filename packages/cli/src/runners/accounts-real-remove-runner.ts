import {
  loadRealAccountStore,
  saveRealAccountStore,
  removeRealDevAccount
} from "@hardkas/accounts";

export interface AccountsRealRemoveOptions {
  name: string;
  workspaceRoot?: string;
}

export async function runAccountsRealRemove(options: AccountsRealRemoveOptions): Promise<{
  formatted: string;
}> {
  const cwd = options.workspaceRoot || process.cwd();
  const store = await loadRealAccountStore({ cwd });
  if (!store) throw new Error("Real account store not found.");

  const newStore = removeRealDevAccount(store, options.name);
  await saveRealAccountStore(newStore, { cwd });

  return { formatted: `Account '${options.name}' removed successfully.` };
}
