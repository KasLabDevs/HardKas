import fs from "node:fs";
import path from "node:path";
import enquirer from "enquirer";
import { KeystoreManager } from "@hardkas/accounts";
import { UI } from "../ui.js";

const { Password } = enquirer as any;

/**
 * Runner for 'hardkas accounts import --encrypted'
 */
export async function runAccountsKeystoreImport(options: {
  name?: string;
  address?: string;
  privateKey?: string;
  encrypted: boolean;
}) {
  const name = options.name || "default";
  const address = options.address;
  const privateKey = options.privateKey;

  if (!options.encrypted) {
    throw new Error("Plaintext import is handled by runAccountsRealImport. Use --encrypted for this runner.");
  }

  UI.warning("HardKAS encrypted keystore is for local developer workflows, not institutional custody.");
  UI.info("Do not import mainnet keys unless you fully understand the risks.");

  if (!address || !privateKey) {
    throw new Error("Address and private key are required for import.");
  }

  // Prompt for password
  const passwordPrompt = new Password({
    name: 'password',
    message: 'Enter keystore password:'
  });
  const password = await passwordPrompt.run();

  if (!password) {
    throw new Error("Password cannot be empty.");
  }

  const confirmPrompt = new Password({
    name: 'confirm',
    message: 'Confirm keystore password:'
  });
  const confirm = await confirmPrompt.run();

  if (password !== confirm) {
    throw new Error("Passwords do not match.");
  }

  // Create keystore
  const keystore = await KeystoreManager.createEncryptedKeystore(
    {
      address,
      privateKey,
      network: "devnet" // Default for now
    },
    password,
    {
      label: name,
      network: "devnet"
    }
  );

  // Save to .hardkas/keystore/<name>.json
  const keystoreDir = path.join(process.cwd(), ".hardkas", "keystore");
  const filePath = path.join(keystoreDir, `${name}.json`);
  await KeystoreManager.saveEncryptedKeystore(filePath, keystore);

  return {
    success: true,
    name,
    path: filePath,
    formatted: `Successfully imported and encrypted account '${name}' to ${filePath}`
  };
}

/**
 * Runner for 'hardkas accounts unlock <name>'
 */
export async function runAccountsKeystoreUnlock(options: { name: string }) {
  const { name } = options;
  const filePath = path.join(process.cwd(), ".hardkas", "keystore", `${name}.json`);

  const keystore = await KeystoreManager.loadEncryptedKeystore(filePath);

  const passwordPrompt = new Password({
    name: 'password',
    message: `Enter password for account '${name}':`
  });
  const password = await passwordPrompt.run();

  const result = await KeystoreManager.decryptEncryptedKeystore(keystore, password);

  if (result.success) {
    UI.success(`Password verified for account '${name}'.`);
    UI.info("Unlock is session-only. Decrypted key is not persisted.");
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

  const oldPasswordPrompt = new Password({
    name: 'old',
    message: 'Enter current password:'
  });
  const oldPassword = await oldPasswordPrompt.run();

  const newPasswordPrompt = new Password({
    name: 'new',
    message: 'Enter new password:'
  });
  const newPassword = await newPasswordPrompt.run();

  const confirmPrompt = new Password({
    name: 'confirm',
    message: 'Confirm new password:'
  });
  const confirm = await confirmPrompt.run();

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
