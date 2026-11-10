import {
  loadRealAccountStore,
  saveRealAccountStore,
  createEmptyRealAccountStore,
  getDefaultRealAccountsPath
} from "@hardkas/accounts";
import { HardkasCliError } from "../cli-errors.js";
import { backupFileNoOverwrite } from "../backup-file.js";

export interface AccountsRealInitOptions {
  force?: boolean;
  /** ESCALÓN 3 · P2: the explicit confirmation that a store holding accounts is replaced (a backup is still kept). */
  discardAccounts?: boolean;
  workspaceRoot?: string;
}

export async function runAccountsRealInit(
  options: AccountsRealInitOptions = {}
): Promise<{
  path: string;
  backup?: string;
  formatted: string;
}> {
  const cwd = options.workspaceRoot || process.cwd();
  const filePath = getDefaultRealAccountsPath(cwd);
  const existing = await loadRealAccountStore({ cwd });

  if (existing && !options.force) {
    throw new HardkasCliError(
      "REAL_ACCOUNT_STORE_EXISTS",
      `Real account store already exists at ${filePath}. Nothing was changed.`,
      { suggestion: "'accounts real generate' and 'accounts real import' add accounts to it. --force replaces it (a backup is kept)." }
    );
  }

  // ESCALÓN 3 · P2: `--force` used to replace the store with an empty one, silently: every account entry was gone,
  // with no copy. A store that holds accounts is now replaced only with --discard-accounts, and every replaced store
  // is first copied to a backup that never overwrites another file. Keystore files are never touched.
  if (existing && existing.accounts.length > 0 && !options.discardAccounts) {
    const names = existing.accounts.map((a) => a.name).join(", ");
    throw new HardkasCliError(
      "REAL_ACCOUNT_STORE_NOT_EMPTY",
      `The real account store at ${filePath} holds ${existing.accounts.length} account(s) (${names}). --force alone never empties a store with accounts. Nothing was changed.`,
      {
        suggestion:
          "'accounts real generate' and 'accounts real import' add accounts to the existing store. To start over anyway, pass --force --discard-accounts: the store is copied to a backup first."
      }
    );
  }

  const backup = existing ? backupFileNoOverwrite(filePath) : undefined;
  const store = createEmptyRealAccountStore();
  await saveRealAccountStore(store, { cwd });

  const lines = [
    "Real dev account store initialized",
    "",
    `Path:    ${filePath}`,
    `Network: ${store.networkId}`,
    ...(backup ? [`Backup:  ${backup} (the previous store, ${existing!.accounts.length} account(s))`] : []),
    "",
    "WARNING:",
    "  Development keys only. Do not use on mainnet."
  ];

  return {
    path: filePath,
    ...(backup ? { backup } : {}),
    formatted: lines.join("\n")
  };
}
