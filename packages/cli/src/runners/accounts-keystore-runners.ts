import fs from "node:fs";
import path from "node:path";
import enquirer from "enquirer";
import {
  KeystoreManager,
  loadRealAccountStore,
  createEmptyRealAccountStore,
  saveRealAccountStore,
  importRealDevAccount
} from "@hardkas/accounts";
import { UI } from "../ui.js";
import { acquirePassword, acquirePrivateKey } from "./secrets.js";
import { withSdk } from "./with-sdk.js";
import { assertAccountName, assertAccountNamesFree, keystorePathIn } from "./keystore-names.js";

/**
 * INT9-C4 · the network an imported key is for. It was "devnet" for every address that is not mainnet's, so a simnet
 * (kaspasim:) import wrote a keystore that contradicts its own address and the account could not sign
 * (AccountNetworkConflictError). Now: `--network` (it must fit the address), else what the address prefix settles
 * (kaspa → mainnet, kaspasim → simnet, kaspadev → devnet). A testnet address (kaspatest) names no testnet: the workspace's
 * testnet-<n>, else undefined (the caller decides whether it needs one). Simulator identities (kaspa:sim_…) keep the
 * former value. Decided before any key or password is read.
 */
async function importNetworkOf(address: string, explicit: string | undefined, workspaceRoot: string): Promise<string | undefined> {
  const { validateAddressNetwork } = await import("@hardkas/accounts");
  if (explicit !== undefined) {
    validateAddressNetwork(address, explicit);
    return explicit;
  }
  if (address.startsWith("kaspa:sim_")) return "devnet";
  if (address.startsWith("kaspa:")) return "mainnet";
  if (address.startsWith("kaspasim:")) return "simnet";
  if (address.startsWith("kaspadev:")) return "devnet";
  if (address.startsWith("kaspatest:")) {
    try {
      const { loadHardkasConfig } = await import("@hardkas/config");
      const { config } = await loadHardkasConfig({ workspaceRoot });
      const exec: any = (config as any).execution;
      const target = exec?.default ? exec.targets?.[exec.default] : undefined;
      const name: string | undefined = typeof target?.network === "string" ? target.network : (config as any).defaultNetwork;
      const entry = name ? ((config as any).networks?.[name] as { network?: unknown } | undefined) : undefined;
      const network = typeof entry?.network === "string" ? entry.network : name;
      if (typeof network === "string" && /^testnet-\d+$/.test(network)) return network;
    } catch {
      // no workspace configuration: no testnet to take
    }
  }
  return undefined;
}

/**
 * Runner for 'hardkas accounts import --encrypted'
 */
export async function runAccountsKeystoreImport(options: {
  name?: string;
  address?: string;
  /** INT9-C4: the network the key is for (default: from the address; a testnet address needs it or the workspace's testnet). */
  network?: string;
  privateKey?: string;
  privateKeyStdin?: boolean;
  privateKeyEnv?: string;
  passwordStdin?: boolean;
  passwordEnv?: string;
  unsafePlaintext?: boolean;
  fixture?: string;
  yes?: boolean;
  json?: boolean;
  workspaceRoot: string;
}) {
  // ESCALÓN 4 · P36 · MAINNET TOTAL LOCKDOWN: no mainnet key enters the store while mainnet is locked down (Kaspa's
  // sighash does not commit to the network, so it could sign a manipulated plan). Refused with the signing code first,
  // before any key, password or fixture is read: a `--network` of the mainnet type in any spelling, a config entry that
  // declares one (an alias such as `prod`), and a mainnet address (`kaspa:`), which names mainnet by itself.
  {
    const { refuseMainnetSigning, workspaceConfigForGuard } = await import("../mainnet-guard.js");
    const given = typeof options.address === "string" ? options.address.trim().toLowerCase() : "";
    const addressNetwork = given.startsWith("kaspa:") && !given.startsWith("kaspa:sim_") ? "mainnet" : undefined;
    refuseMainnetSigning(
      await workspaceConfigForGuard(options.workspaceRoot),
      [options.network, addressNetwork],
      "accounts real import: no mainnet key is imported while mainnet is locked down"
    );
  }
  let name = options.name || "default";
  let address = options.address;

  if (options.fixture) {
    const { HardkasFixtureSigner, getHardkasFixtureKey } = await import(
      "@hardkas/testing"
    );
    // DEF-14 fix (Wave 0): fixture identities live in an explicit, auditable
    // registry — HardKAS does NOT derive private keys from arbitrary user-supplied
    // strings. Unknown fixture names fail closed with HARDKAS_UNKNOWN_FIXTURE.
    const signer = new HardkasFixtureSigner("simnet", options.fixture);
    address = await signer.getAddress();
    options.privateKey = getHardkasFixtureKey(options.fixture);
    name = options.fixture;
    options.unsafePlaintext = true;
    options.yes = true;
  }

  // CONTAINMENT-2 (R1-I1, R1-I2): the name is decided before any key or password is read and before anything is
  // written: a valid account name, not taken in this workspace (in any case) and, for an encrypted import, ONE plain
  // keystore file of this workspace's keystore directory. An existing account's keystore is never replaced.
  assertAccountName(name);
  const keystoreTarget = options.unsafePlaintext
    ? undefined
    : await withSdk({ cwd: options.workspaceRoot }, (sdk) => ({
        dir: sdk.workspace.keystoreDir,
        root: sdk.workspace.root,
        path: keystorePathIn(sdk, name)
      }));
  assertAccountNamesFree([name], (await loadRealAccountStore({ cwd: options.workspaceRoot }))?.accounts ?? [], keystoreTarget?.dir, "imported");

  // AUD-20: a mainnet key is never written in plaintext; refused before the key is even read.
  if (options.unsafePlaintext && address && address.startsWith("kaspa:") && !address.startsWith("kaspa:sim_")) {
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "PLAINTEXT_MAINNET_FORBIDDEN",
      "Plaintext storage is refused for mainnet keys. Nothing was imported; import it encrypted (--password-env <VAR> or --password-stdin).",
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }

  if (options.unsafePlaintext) {
    UI.warning(
      "LEGACY MODE: Storing private keys in plaintext is unsafe and discouraged."
    );
    if (!options.yes) {
      const confirmed = await UI.confirm(
        "Are you sure you want to store this key in plaintext?"
      );
      if (!confirmed) throw new Error("Import cancelled by user.");
    }
  } else {
    UI.info(
      "HardKAS: Encrypted keystore is for local developer workflows, not institutional custody."
    );
    UI.info("Do not import mainnet keys unless you fully understand the risks.");
  }

  if (!address) {
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError("ACCOUNT_ADDRESS_REQUIRED", "--address is required for import (the account's Kaspa address). Nothing was read or imported.", {
      exitCode: HardkasExitCode.USAGE_ERROR
    });
  }

  // INT9-C4: the network the key is for, before any key or password is read (an encrypted keystore records it)
  let network: string | undefined;
  try {
    network = await importNetworkOf(address, options.network, options.workspaceRoot);
  } catch (e: unknown) {
    const err = e as { code?: unknown; message?: unknown } | null | undefined;
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError(String(err?.code ?? "NETWORK_ADDRESS_MISMATCH"), `${String(err?.message ?? e)} Nothing was imported.`, { exitCode: HardkasExitCode.USAGE_ERROR });
  }
  if (network === undefined && !options.unsafePlaintext) {
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "ACCOUNT_NETWORK_REQUIRED",
      `'${address}' is a testnet address and names no testnet: pass --network testnet-<n> (the workspace declares none). Nothing was imported.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }

  if (name === "hardkas-local-docker-test-only") {
    const isMainnet = address.startsWith("kaspa:") && !address.startsWith("kaspa:sim_");
    if (isMainnet) {
      throw new Error(
        "Fixture 'hardkas-local-docker-test-only' is strictly blocked on mainnet. (TEST_ONLY_DO_NOT_USE_FOR_FUNDS)"
      );
    }
  }

  // Acquire Private Key
  let privateKeyUsedAsArg = false;
  let finalKey: string | undefined;

  if (options.privateKeyStdin || options.privateKeyEnv) {
    finalKey = await acquirePrivateKey({
      stdin: !!options.privateKeyStdin,
      env: options.privateKeyEnv,
      interactive: !options.json,
      message: `Enter private key for account '${name}':`
    });
  } else if (options.privateKey) {
    finalKey = options.privateKey;
    privateKeyUsedAsArg = true;
  } else {
    finalKey = await acquirePrivateKey({
      interactive: !options.json,
      message: `Enter private key for account '${name}':`
    });
  }

  if (privateKeyUsedAsArg) {
    const warningMsg =
      "--private-key may be recorded in shell history, process lists, CI logs, or terminal scrollback.";
    const suggestion = "Use --private-key-stdin or --private-key-env instead.";

    if (!options.json) {
      UI.securityWarning("PRIVATE_KEY_ARG_DEPRECATED", warningMsg, suggestion);
    }
  }

  if (!finalKey) {
    throw new Error("Private key is required for import.");
  }

  let keystoreRef: string | undefined;

  if (!options.unsafePlaintext) {
    // Acquire Password
    const password = await acquirePassword({
      stdin: !!options.passwordStdin,
      env: options.passwordEnv,
      interactive: !options.json,
      message: `Enter new keystore password for account '${name}':`
    });

    if (!password) {
      throw new Error("Password cannot be empty for encrypted storage.");
    }

    // Create keystore
    const keystore = await KeystoreManager.createEncryptedKeystore(
      {
        address,
        privateKey: finalKey,
        network: network!
      },
      password,
      {
        label: name,
        network: network!
      }
    );

    // Save to <keystoreDir>/<name>.json: the path decided (and contained) before anything was read
    if (!fs.existsSync(keystoreTarget!.dir)) fs.mkdirSync(keystoreTarget!.dir, { recursive: true });
    await KeystoreManager.saveEncryptedKeystore(keystoreTarget!.path, keystore);
    keystoreRef = path.relative(keystoreTarget!.root, keystoreTarget!.path).split(path.sep).join("/");
  }

  // DEF-13: transactional store update. Load without side effects, validate via
  // importRealDevAccount (throws on collision/invalid-name/invalid-address), and
  // only touch disk after the in-memory transition succeeds. If any step above
  // fails, the on-disk store is byte-unchanged (or, if it did not exist, remains
  // absent from disk).
  const loadedStore = await loadRealAccountStore({ cwd: options.workspaceRoot });
  const baseStore = loadedStore ?? createEmptyRealAccountStore();
  const nextStore = importRealDevAccount(baseStore, {
    name,
    address,
    // INT9-C4: the store entry names the network too (ACCOUNT-STORE-NETWORK-1), except a simulator identity's
    ...(network !== undefined && !address.startsWith("kaspa:sim_") ? { network: network as any } : {}),
    ...(options.unsafePlaintext ? { privateKey: finalKey } : {}),
    ...(options.privateKeyEnv ? { privateKeyEnv: options.privateKeyEnv } : {}),
    ...(keystoreRef ? { keystoreRef } : {})
  });
  await saveRealAccountStore(nextStore, { cwd: options.workspaceRoot });

  const warnings = [];
  if (privateKeyUsedAsArg) {
    warnings.push({
      code: "PRIVATE_KEY_ARG_DEPRECATED",
      severity: "warning",
      message:
        "--private-key is deprecated and unsafe. Use --private-key-stdin or --private-key-env."
    });
  }

  return {
    success: true,
    name,
    encrypted: !options.unsafePlaintext,
    warnings,
    formatted: options.unsafePlaintext
      ? `✓ Successfully imported account '${name}' (UNSAFE PLAINTEXT)`
      : `✓ Successfully imported and encrypted account '${name}'`
  };
}

/**
 * Runner for 'hardkas accounts session-open <name>'
 */
export async function runAccountsSessionOpen(options: {
  name: string;
  passwordStdin?: boolean;
  passwordEnv?: string;
  workspaceRoot: string;
}) {
  const { name } = options;
  // CONTAINMENT-2 (R1-I1): the name is checked before anything else happens (opening the workspace included), then
  // its one plain keystore file of this workspace is decided before anything is read
  assertAccountName(name);
  const filePath = await withSdk({ cwd: options.workspaceRoot }, (sdk) => keystorePathIn(sdk, name));

  if (!fs.existsSync(filePath)) {
    throw new Error(`Keystore for account '${name}' not found at ${filePath}`);
  }

  const keystore = await KeystoreManager.loadEncryptedKeystore(filePath);

  const password = await acquirePassword({
    stdin: !!options.passwordStdin,
    env: options.passwordEnv,
    message: `Enter password for account '${name}':`
  });

  const result = await KeystoreManager.decryptEncryptedKeystore(keystore, password);

  if (result.success) {
    UI.success(`Access to account '${name}' verified.`);
    UI.info("Note: This does not create a production wallet session or daemon.");
    UI.info("Decrypted key material is process-local and will not be persisted.");
  } else {
    throw new Error(result.error || "Failed to unlock keystore.");
  }
}

/**
 * Runner for 'hardkas accounts change-password <name>'
 */
export async function runAccountsKeystoreChangePassword(options: {
  name: string;
  workspaceRoot: string;
  passwordEnv?: string | undefined;
  passwordStdin?: boolean | undefined;
  newPasswordEnv?: string | undefined;
}) {
  const { name } = options;
  // CONTAINMENT-2 (R1-I1): the name is checked before anything else happens (opening the workspace included), then
  // its one plain keystore file of this workspace is decided before anything is read or prompted for
  assertAccountName(name);
  // L1-CORE-1 B4: the new password comes from --new-password-env, or from a prompt (with confirmation) on a terminal.
  // Without either the command fails here, typed, before the keystore is read or any password is asked for.
  if (!options.newPasswordEnv && (options.passwordStdin || !process.stdin.isTTY)) {
    const { HardkasCliError, HardkasExitCode } = await import("../cli-errors.js");
    throw new HardkasCliError(
      "KEYSTORE_PASSWORD_REQUIRED",
      `A new keystore password is required: ${options.passwordStdin ? "stdin carries the current one" : "there is no terminal to prompt on"}. Pass it with --new-password-env <VAR>. Nothing was changed.`,
      { exitCode: HardkasExitCode.USAGE_ERROR }
    );
  }
  const filePath = await withSdk({ cwd: options.workspaceRoot }, (sdk) => keystorePathIn(sdk, name));

  const keystore = await KeystoreManager.loadEncryptedKeystore(filePath);

  const oldPassword = await acquirePassword({
    stdin: options.passwordStdin,
    env: options.passwordEnv,
    message: "Enter current password:"
  });

  let newPassword: string;
  if (options.newPasswordEnv) {
    // a variable is not mistyped: no confirmation
    newPassword = await acquirePassword({ env: options.newPasswordEnv });
  } else {
    newPassword = await acquirePassword({
      message: "Enter new password:"
    });

    const confirm = await acquirePassword({
      message: "Confirm new password:"
    });

    if (newPassword !== confirm) {
      throw new Error("New passwords do not match.");
    }
  }

  const updatedKeystore = await KeystoreManager.changeKeystorePassword(
    keystore,
    oldPassword,
    newPassword
  );

  await KeystoreManager.saveEncryptedKeystore(filePath, updatedKeystore);
  UI.success(`Successfully changed password for account '${name}'.`);
}
