import fs from "node:fs";
import path from "node:path";
import enquirer from "enquirer";
import { KeystoreManager, loadOrCreateRealAccountStore, saveRealAccountStore, importRealDevAccount } from "@hardkas/accounts";
import { UI } from "../ui.js";
import { acquirePassword, acquirePrivateKey } from "./secrets.js";

/**
 * Runner for 'hardkas accounts import --encrypted'
 */
export async function runAccountsKeystoreImport(options: {
  name?: string;
  address?: string;
  privateKey?: string;
  privateKeyStdin?: boolean;
  privateKeyEnv?: string;
  passwordStdin?: boolean;
  passwordEnv?: string;
  unsafePlaintext?: boolean;
  yes?: boolean;
  json?: boolean;
}) {
  const name = options.name || "default";
  const address = options.address;

  if (options.unsafePlaintext) {
    UI.warning("LEGACY MODE: Storing private keys in plaintext is unsafe and discouraged.");
    if (!options.yes) {
      const confirmed = await UI.confirm("Are you sure you want to store this key in plaintext?");
      if (!confirmed) throw new Error("Import cancelled by user.");
    }
  } else {
    UI.info("HardKAS: Encrypted keystore is for local developer workflows, not institutional custody.");
    UI.info("Do not import mainnet keys unless you fully understand the risks.");
  }

  if (!address) {
    throw new Error("Address is required for import.");
  }

  // Acquire Private Key
  let privateKeyUsedAsArg = false;
  let finalKey: string | undefined;

  if (options.privateKeyStdin || options.privateKeyEnv) {
    finalKey = await acquirePrivateKey({
      stdin: !!options.privateKeyStdin,
      env: options.privateKeyEnv,
      message: `Enter private key for account '${name}':`
    });
  } else if (options.privateKey) {
    finalKey = options.privateKey;
    privateKeyUsedAsArg = true;
  } else {
    finalKey = await acquirePrivateKey({
      message: `Enter private key for account '${name}':`
    });
  }

  if (privateKeyUsedAsArg) {
    const warningMsg = "--private-key may be recorded in shell history, process lists, CI logs, or terminal scrollback.";
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
        network: address.startsWith("kaspa:") ? "mainnet" : "devnet"
      },
      password,
      {
        label: name,
        network: address.startsWith("kaspa:") ? "mainnet" : "devnet"
      }
    );

    // Save to .hardkas/keystore/<name>.json
    const keystoreDir = path.join(process.cwd(), ".hardkas", "keystore");
    const filePath = path.join(keystoreDir, `${name}.json`);
    await KeystoreManager.saveEncryptedKeystore(filePath, keystore);
    keystoreRef = `.hardkas/keystore/${name}.json`;
  }

  // Update Metadata Index (accounts.real.json)
  let store = await loadOrCreateRealAccountStore();
  store = importRealDevAccount(store, {
    name,
    address,
    ...(options.unsafePlaintext ? { privateKey: finalKey } : {}),
    ...(keystoreRef ? { keystoreRef } : {})
  });
  await saveRealAccountStore(store);

  const warnings = [];
  if (privateKeyUsedAsArg) {
    warnings.push({
      code: "PRIVATE_KEY_ARG_DEPRECATED",
      severity: "warning",
      message: "--private-key is deprecated and unsafe. Use --private-key-stdin or --private-key-env."
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
}) {
  const { name } = options;
  const filePath = path.join(process.cwd(), ".hardkas", "keystore", `${name}.json`);

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
export async function runAccountsKeystoreChangePassword(options: { name: string }) {
  const { name } = options;
  const filePath = path.join(process.cwd(), ".hardkas", "keystore", `${name}.json`);

  const keystore = await KeystoreManager.loadEncryptedKeystore(filePath);

  const oldPassword = await acquirePassword({
    message: 'Enter current password:'
  });

  const newPassword = await acquirePassword({
    message: 'Enter new password:'
  });

  const confirm = await acquirePassword({
    message: 'Confirm new password:'
  });

  if (newPassword !== confirm) {
    throw new Error("New passwords do not match.");
  }

  const updatedKeystore = await KeystoreManager.changeKeystorePassword(
    keystore,
    oldPassword,
    newPassword
  );

  await KeystoreManager.saveEncryptedKeystore(filePath, updatedKeystore);
  UI.success(`Successfully changed password for account '${name}'.`);
}
