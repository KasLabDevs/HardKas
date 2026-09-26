import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { KeystoreManager } from "./keystore.js";
import type { GeneratedKaspaDevAccount } from "./real-keygen.js";
import { deterministicCompare, getNetworkPrefix } from "@hardkas/core";
import { resolveHardkasAccount } from "./resolve.js";
import { KaspaWasmPrivateKeySigner } from "./kaspa-wasm-signer.js";
import type { HardkasTxPlanSigner } from "./types.js";

// Hardcoded explicit dev password for simnet convenience, as requested.
export const DEV_ACCOUNTS_PASSWORD = "hardkas-local-dev";

// A completely deterministic static seed used ONLY for simnet.
const SIMNET_DETERMINISTIC_SEED = "hardkas-deterministic-simnet-seed-v1";

export async function ensureDevAccounts(workspaceDir: string): Promise<void> {
  const devAccountsDir = path.join(workspaceDir, ".hardkas", "dev-accounts");
  if (!fs.existsSync(devAccountsDir)) {
    await fs.promises.mkdir(devAccountsDir, { recursive: true });
  }

  // Pre-generate alice (0), bob (1), carol (2), dave (3), erin (4).
  //
  // DEF-27 (Wave 4): erin was previously advertised as kind:"kaspa" by
  // createDeterministicAccounts() (in @hardkas/localnet) with a placeholder
  // address, but never provisioned here. That advertised-without-authority
  // state violated the deterministic identity invariant. Erin is now
  // included so all five advertised identities have reproducible signing
  // authority under the same canonical scheme.
  await getOrCreateDevAccount(workspaceDir, 0, "alice");
  await getOrCreateDevAccount(workspaceDir, 1, "bob");
  await getOrCreateDevAccount(workspaceDir, 2, "carol");
  await getOrCreateDevAccount(workspaceDir, 3, "dave");
  await getOrCreateDevAccount(workspaceDir, 4, "erin");
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

  // Dev accounts are simnet-only. Derivation uses the pinned SDK; if it cannot
  // load, there is no account to return (never an empty placeholder).
  const network = "simnet";
  const { loadKaspaWasm } = await import("./signer-backend.js");
  const kaspaWasm = await loadKaspaWasm();
  const kp = new kaspaWasm.PrivateKey(privateKeyHex).toKeypair();
  const address = kp.toAddress(getNetworkPrefix(network)).toString();
  const publicKey = kp.publicKey;
  const privateKey = privateKeyHex;

  const accountData: GeneratedKaspaDevAccount = {
    address,
    privateKey,
    publicKey
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
  accounts.sort((a, b) => deterministicCompare(a.name, b.name));
  return accounts;
}

export async function createDevSigner(
  workspaceDir: string,
  accountNameOrAddress: string
): Promise<HardkasTxPlanSigner> {
  const account = resolveHardkasAccount({
    nameOrAddress: accountNameOrAddress,
    config: { cwd: workspaceDir } as any
  });

  if (account.kind !== "kaspa") {
    throw new Error(`Account '${accountNameOrAddress}' is not a private key account, cannot create local dev signer.`);
  }

  return new KaspaWasmPrivateKeySigner({
    account: account as any,
    allowMainnet: false
  });
}
