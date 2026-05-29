import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { KeystoreManager } from "./keystore.js";
import type { GeneratedKaspaDevAccount } from "./real-keygen.js";

// Hardcoded explicit dev password for simnet convenience, as requested.
export const DEV_ACCOUNTS_PASSWORD = "hardkas-local-dev";

// A completely deterministic static seed used ONLY for simnet.
const SIMNET_DETERMINISTIC_SEED = "hardkas-deterministic-simnet-seed-v1";

export async function ensureDevAccounts(workspaceDir: string): Promise<void> {
  const devAccountsDir = path.join(workspaceDir, ".hardkas", "dev-accounts");
  if (!fs.existsSync(devAccountsDir)) {
    await fs.promises.mkdir(devAccountsDir, { recursive: true });
  }

  // Pre-generate alice (0) and bob (1)
  await getOrCreateDevAccount(workspaceDir, 0, "alice");
  await getOrCreateDevAccount(workspaceDir, 1, "bob");
}

export async function getOrCreateDevAccount(
  workspaceDir: string,
  index: number,
  alias: string
): Promise<GeneratedKaspaDevAccount> {
  const devAccountsDir = path.join(workspaceDir, ".hardkas", "dev-accounts");
  const filePath = path.join(devAccountsDir, `${alias}.json`);

  if (fs.existsSync(filePath)) {
    const keystore = await KeystoreManager.loadEncryptedKeystore(filePath);
    const unlock = await KeystoreManager.decryptEncryptedKeystore(
      keystore,
      DEV_ACCOUNTS_PASSWORD
    );
    if (!unlock.success || !unlock.payload) {
      throw new Error(
        `Failed to decrypt dev account ${alias}. Expected password: ${DEV_ACCOUNTS_PASSWORD}`
      );
    }
    return {
      address: unlock.payload.address,
      privateKey: unlock.payload.privateKey,
      publicKey: unlock.payload.publicKey!
    };
  }

  // Derive deterministically using sha256 of seed + index
  const seedString = `${SIMNET_DETERMINISTIC_SEED}-${index}`;
  const privateKeyHex = crypto.createHash("sha256").update(seedString).digest("hex");

  // Dynamically load kaspa to get the public key and address
  let sdkModule;
  try {
    // @ts-ignore
    sdkModule = await import(/* @vite-ignore */ "@kaspa/core-lib");
  } catch (e) {
    console.warn(
      `\n[Warning] Kaspa SDK (@kaspa/core-lib) is not installed in the workspace.\nCould not generate dev account '${alias}'.`
    );
    return { address: "", privateKey: "", publicKey: "" };
  }

  const sdk = sdkModule.default || sdkModule;
  const privKey = new sdk.PrivateKey(privateKeyHex);
  const pubKey = privKey.toPublicKey();
  const address = pubKey.toAddress("simnet").toString();

  const accountData: GeneratedKaspaDevAccount = {
    address,
    privateKey: privKey.toString(),
    publicKey: pubKey.toString()
  };

  // Save to .hardkas/dev-accounts/<alias>.json
  if (!fs.existsSync(devAccountsDir)) {
    await fs.promises.mkdir(devAccountsDir, { recursive: true });
  }

  const payload: any = {
    address: accountData.address,
    privateKey: accountData.privateKey,
    network: "simnet"
  };
  if (accountData.publicKey) {
    payload.publicKey = accountData.publicKey;
  }

  const keystore = await KeystoreManager.createEncryptedKeystore(
    payload,
    DEV_ACCOUNTS_PASSWORD,
    {
      label: alias,
      network: "simnet"
    }
  );

  await KeystoreManager.saveEncryptedKeystore(filePath, keystore);

  return accountData;
}

export function listDevAccountsSync(
  workspaceDir: string
): { name: string; address: string }[] {
  const devAccountsDir = path.join(workspaceDir, ".hardkas", "dev-accounts");
  if (!fs.existsSync(devAccountsDir)) {
    return [];
  }

  const accounts: { name: string; address: string }[] = [];
  const files = fs.readdirSync(devAccountsDir);
  for (const file of files) {
    if (file.endsWith(".json")) {
      const name = path.basename(file, ".json");
      try {
        const data = fs.readFileSync(path.join(devAccountsDir, file), "utf-8");
        const keystore = JSON.parse(data);
        if (keystore.type === "hardkas.encryptedKeystore.v2") {
          accounts.push({
            name,
            address: keystore.metadata?.address || ""
          });
        }
      } catch (e) {
        // ignore corrupted
      }
    }
  }

  // Sort them so alice is generally first, bob second
  accounts.sort((a, b) => a.name.localeCompare(b.name));
  return accounts;
}
