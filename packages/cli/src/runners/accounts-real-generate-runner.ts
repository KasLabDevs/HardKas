import {
  loadOrCreateRealAccountStore,
  loadRealAccountStoreSync,
  saveRealAccountStore,
  importRealDevAccount,
  KaspaSdkKeyGenerator,
  RealDevAccount,
  KeystoreManager
} from "@hardkas/accounts";
import path from "node:path";
import fs from "node:fs";
import { acquirePassword } from "./secrets.js";
import { UI } from "../ui.js";
import { withSdk } from "./with-sdk.js";
import { assertAccountName, assertAccountNamesFree, keystorePathIn } from "./keystore-names.js";

export interface AccountsRealGenerateOptions {
  name?: string;
  count?: number;
  networkId?: "simnet" | "testnet-10" | "mainnet";
  unsafePlaintext?: boolean;
  passwordStdin?: boolean;
  passwordEnv?: string;
  yes?: boolean;
  /** Machine-readable output: never prompts. */
  json?: boolean;
  workspaceRoot?: string;
}

export async function runAccountsRealGenerate(
  options: AccountsRealGenerateOptions
): Promise<{
  accounts: RealDevAccount[];
  formatted: string;
}> {
  const generator = new KaspaSdkKeyGenerator(
    options.networkId ? { networkId: options.networkId } : {}
  );
  const count = options.count || 1;

  // AUD-20: a mainnet key is never written in plaintext; refused before anything is generated.
  if (options.unsafePlaintext && (options.networkId ?? "simnet") === "mainnet") {
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "PLAINTEXT_MAINNET_FORBIDDEN",
      "Plaintext storage is refused for mainnet keys. Nothing was generated; generate an encrypted account (--password-env <VAR> or --password-stdin).",
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }

  const cwd = options.workspaceRoot || process.cwd();
  const generatedAccounts: RealDevAccount[] = [];

  // Demo-ready · E20: one requested account gets exactly the requested name; several are numbered.
  const names = Array.from({ length: count }, (_, i) =>
    count === 1 && options.name ? options.name : options.name ? `${options.name}${i + 1}` : `account${i}`
  );
  // CONTAINMENT-2 (R1-I1): every name is decided before anything is prompted for, read or written: a valid account
  // name and, for an encrypted account, ONE plain keystore file of this workspace's keystore directory.
  names.forEach(assertAccountName);
  const keystoreTarget = options.unsafePlaintext
    ? undefined
    : await withSdk(options.workspaceRoot ? { cwd: options.workspaceRoot } : {}, (sdk) => ({
        dir: sdk.workspace.keystoreDir,
        root: sdk.workspace.root,
        paths: names.map((n) => keystorePathIn(sdk, n))
      }));
  // A taken name is refused before anything is prompted for or written: in encrypted mode
  // the keystore file used to be written first, overwriting the existing account's keystore,
  // and only then did the store refuse the duplicate name (the account kept pointing at a
  // keystore holding another key).
  const existing = loadRealAccountStoreSync({ cwd })?.accounts ?? [];
  assertAccountNamesFree(names, existing, keystoreTarget?.dir, "generated");

  // The password (or the plaintext confirmation) comes before anything is written: without one the
  // command fails here, with no store, keystore or account left behind.
  let password = "";
  if (!options.unsafePlaintext) {
    password = await acquirePassword({
      stdin: options.passwordStdin,
      env: options.passwordEnv,
      interactive: !options.json,
      message: `Enter password to encrypt ${count} new account(s):`
    });
    if (!password) throw new Error("Password is required for encrypted storage.");
  } else {
    UI.warning("LEGACY MODE: Generating accounts in plaintext is unsafe.");
    if (!options.yes) {
      const confirmed = await UI.confirm(
        "Are you sure you want to store these keys in plaintext?"
      );
      if (!confirmed) throw new Error("Generation cancelled.");
    }
  }

  let store = await loadOrCreateRealAccountStore({ cwd });

  for (let i = 0; i < count; i++) {
    const name = names[i]!;

    // Attempt generation
    const generated = await generator.generateAccount(
      options.networkId ? { networkId: options.networkId } : {}
    );

    let keystoreRef: string | undefined;

    if (!options.unsafePlaintext) {
      const keystore = await KeystoreManager.createEncryptedKeystore(
        {
          address: generated.address,
          privateKey: generated.privateKey!,
          network: options.networkId || "simnet"
        },
        password,
        {
          label: name,
          network: options.networkId || "simnet"
        }
      );

      // the path decided (and contained) before anything was prompted for
      const filePath = keystoreTarget!.paths[i]!;
      if (!fs.existsSync(keystoreTarget!.dir)) fs.mkdirSync(keystoreTarget!.dir, { recursive: true });
      await KeystoreManager.saveEncryptedKeystore(filePath, keystore);
      keystoreRef = path.relative(keystoreTarget!.root, filePath).split(path.sep).join("/");
    }

    store = importRealDevAccount(store, {
      name,
      address: generated.address,
      ...(generated.publicKey ? { publicKey: generated.publicKey } : {}),
      ...(options.unsafePlaintext && generated.privateKey
        ? { privateKey: generated.privateKey }
        : {}),
      ...(keystoreRef ? { keystoreRef } : {})
    });

    generatedAccounts.push(store.accounts[store.accounts.length - 1]!);
  }

  await saveRealAccountStore(store);

  const lines = [
    `Generated ${count} real dev account(s)`,
    "",
    "WARNING: Development keys only. Do not use on mainnet.",
    ""
  ];

  generatedAccounts.forEach((a) => {
    lines.push(`Name:    ${a.name}`);
    lines.push(`Address: ${a.address}`);
    lines.push(`Private: yes (masked)`);
    lines.push("");
  });

  return {
    accounts: generatedAccounts,
    formatted: lines.join("\n")
  };
}
