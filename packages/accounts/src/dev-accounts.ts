import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { KeystoreManager } from "./keystore.js";
import type { GeneratedKaspaDevAccount } from "./real-keygen.js";
import { deterministicCompare } from "@hardkas/core";
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

  const network = "simnet";
  const isSimnet = ["simnet", "kaspasim", "local"].includes(network);

  let address = "";
  let privateKey = "";
  let publicKey = "";

  try {
    if (isSimnet) {
      let kaspaWasm: any;
      try {
        kaspaWasm = await import(/* @vite-ignore */ "kaspa-wasm");
      } catch (e) {
        console.warn(`\n[Warning] kaspa-wasm is not installed. Required for simnet.`);
        return { address: "", privateKey: "", publicKey: "" };
      }
      const privKey = new kaspaWasm.PrivateKey(privateKeyHex);
      const kp = privKey.toKeypair();
      address = kp.toAddress(network).toString();
      publicKey = kp.publicKey;
      privateKey = privateKeyHex;
    } else {
      let sdkModule: any;
      try {
        // @ts-ignore - Third party lib lacking types
        sdkModule = await import(/* @vite-ignore */ "@kaspa/core-lib");
      } catch (e) {
        console.warn(`\n[Warning] @kaspa/core-lib is not installed.`);
        return { address: "", privateKey: "", publicKey: "" };
      }
      const sdk = sdkModule.default || sdkModule;
      if (typeof sdk.initRuntime === "function") {
        await sdk.initRuntime();
      }
      const privKey = new sdk.PrivateKey(privateKeyHex);
      const pubKey = privKey.toPublicKey();
      try {
        address = pubKey.toAddress(network).toString();
      } catch (e: unknown) {
        const msg = e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e);
        if (msg.includes("Second argument must be") || msg.includes("Unsupported")) {
          const err = new Error("DEV_ACCOUNT_BACKEND_UNSUPPORTED_NETWORK");
          (err as any).code = "DEV_ACCOUNT_BACKEND_UNSUPPORTED_NETWORK";
          throw err;
        }
        throw e;
      }
      publicKey = pubKey.toString();
      privateKey = privKey.toString();
    }
  } catch (e: unknown) {
    const msg = e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e);
    if (msg === "DEV_ACCOUNT_BACKEND_UNSUPPORTED_NETWORK") {
      throw e;
    }
    console.warn(`\n[Warning] Could not generate dev account '${alias}'.\n${msg}`);
    return { address: "", privateKey: "", publicKey: "" };
  }

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

  if (account.kind !== "kaspa-private-key") {
    throw new Error(`Account '${accountNameOrAddress}' is not a private key account, cannot create local dev signer.`);
  }

  return new KaspaWasmPrivateKeySigner({
    account: account as any,
    allowMainnet: false
  });
}
