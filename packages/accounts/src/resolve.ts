import fs from "node:fs";
import path from "node:path";
import type { HardkasConfig } from "@hardkas/config";
import { createDeterministicAccounts } from "@hardkas/localnet";
import type { HardkasAccount, HardkasSimulatedAccount } from "./types.js";
import {
  loadRealAccountStoreSync,
  getRealDevAccount,
  listRealDevAccounts
} from "./real-accounts.js";

export interface ResolveAccountOptions {
  nameOrAddress: string;
  config?: HardkasConfig | undefined;
}

export function resolveHardkasAccount(options: ResolveAccountOptions): HardkasAccount {
  const { nameOrAddress, config } = options;

  // 1. If it starts with "kaspa:", "kaspatest:", "kaspasim:", it's a direct address
  if (
    nameOrAddress.startsWith("kaspa:") ||
    nameOrAddress.startsWith("kaspatest:") ||
    nameOrAddress.startsWith("kaspasim:")
  ) {
    return {
      name: nameOrAddress,
      kind: "external-wallet",
      address: nameOrAddress
    };
  }

  // 1.5 Handle index aliases (0 -> alice, 1 -> bob)
  let alias = nameOrAddress;
  if (alias === "0") alias = "alice";
  if (alias === "1") alias = "bob";

  // 2. Check dev accounts first (simnet priority)
  const workspaceRoot = (config as any)?.cwd || process.cwd();
  const devAccountPath = path.join(
    workspaceRoot,
    ".hardkas",
    "dev-accounts",
    `${alias}.json`
  );
  if (fs.existsSync(devAccountPath)) {
    try {
      const data = fs.readFileSync(devAccountPath, "utf-8");
      const keystore = JSON.parse(data);
      if (keystore.type === "hardkas.encryptedKeystore.v2") {
        return {
          name: alias,
          kind: "kaspa-private-key",
          address: keystore.metadata?.address,
          keystorePath: devAccountPath
        };
      }
    } catch (e) {
      // Ignore read errors and fall through
    }
  }

  // 3. Check config.accounts
  if (config?.accounts && config.accounts[alias]) {
    const accConfig = config.accounts[alias];
    return {
      name: alias,
      ...accConfig
    } as HardkasAccount;
  }

  // 4. Check real account store
  const realStore = loadRealAccountStoreSync();
  const realAcc = realStore ? getRealDevAccount(realStore, alias) : null;
  if (realAcc) {
    return {
      name: realAcc.name,
      kind: "kaspa-private-key", // Assuming Kaspa for now, could be extensible
      address: realAcc.address,
      ...(realAcc.privateKeyEnv ? { privateKeyEnv: realAcc.privateKeyEnv } : {}),
      ...(realAcc.privateKey ? { privateKey: realAcc.privateKey } : {})
    };
  }

  // 5. Fallback to deterministic accounts
  const detAccounts = createDeterministicAccounts();
  const det = detAccounts.find((a: any) => a.name === alias);
  if (det) {
    return {
      name: det.name,
      kind: "simulated",
      address: det.address,
      evmAddress: det.evmAddress
    };
  }

  // 6. Not found
  const available = listHardkasAccounts(config)
    .map((a) => a.name)
    .join(", ");
  throw new Error(
    `Unknown HardKAS account '${nameOrAddress}'. Available accounts: ${available}`
  );
}

export function listHardkasAccounts(config?: HardkasConfig): HardkasAccount[] {
  const accounts: Map<string, HardkasAccount> = new Map();

  // Add deterministic accounts first (defaults)
  const detAccounts = createDeterministicAccounts();
  for (const det of detAccounts) {
    accounts.set(det.name, {
      name: det.name,
      kind: "simulated",
      address: det.address,
      evmAddress: det.evmAddress
    });
  }

  // Add dev-accounts (simnet deterministic)
  const workspaceRoot = (config as any)?.cwd || process.cwd();
  const devAccountsDir = path.join(workspaceRoot, ".hardkas", "dev-accounts");
  if (fs.existsSync(devAccountsDir)) {
    const files = fs.readdirSync(devAccountsDir);
    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const name = path.basename(file, ".json");
          const data = fs.readFileSync(path.join(devAccountsDir, file), "utf-8");
          const keystore = JSON.parse(data);
          if (keystore.type === "hardkas.encryptedKeystore.v2") {
            accounts.set(name, {
              name,
              kind: "kaspa-private-key",
              address: keystore.payload?.address || keystore.metadata?.address,
              keystorePath: path.join(devAccountsDir, file)
            });
          }
        } catch (e) {
          // Ignore
        }
      }
    }
  }

  // Add from real account store
  const realStore = loadRealAccountStoreSync();
  if (realStore) {
    for (const realAcc of listRealDevAccounts(realStore)) {
      accounts.set(realAcc.name, {
        name: realAcc.name,
        kind: "kaspa-private-key",
        address: realAcc.address,
        ...(realAcc.privateKeyEnv ? { privateKeyEnv: realAcc.privateKeyEnv } : {}),
        ...(realAcc.privateKey ? { privateKey: realAcc.privateKey } : {})
      });
    }
  }

  // Add from encrypted keystore directory
  const keystoreDir = path.join(process.cwd(), ".hardkas", "keystore");
  if (fs.existsSync(keystoreDir)) {
    const cwd = (config as any)?.cwd || process.cwd();
    const files = fs.readdirSync(keystoreDir);
    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const name = path.basename(file, ".json");
          const data = fs.readFileSync(path.join(keystoreDir, file), "utf-8");
          const keystore = JSON.parse(data);
          if (keystore.type === "hardkas.encryptedKeystore.v2") {
            accounts.set(name, {
              name,
              kind: "kaspa-private-key",
              address: keystore.payload?.address || keystore.metadata?.address, // Payloads are encrypted, but address might be in metadata
              keystorePath: path.join(keystoreDir, file)
            });
          }
        } catch (e) {
          // Ignore corrupted keystores in listing
        }
      }
    }
  }

  // Override/Add from config
  if (config?.accounts) {
    for (const [name, accConfig] of Object.entries(config.accounts)) {
      accounts.set(name, {
        name,
        ...accConfig
      } as HardkasAccount);
    }
  }

  return Array.from(accounts.values());
}

export async function resolveHardkasAccountAddress(
  accountOrAddress: string,
  config?: HardkasConfig,
  context: "L1" | "L2" = "L1"
): Promise<string> {
  if (
    accountOrAddress.startsWith("kaspa:") ||
    accountOrAddress.startsWith("kaspatest:") ||
    accountOrAddress.startsWith("kaspasim:")
  ) {
    if (context === "L2") {
      throw new Error(
        `Invalid L2 address provided: ${accountOrAddress}. Expected EVM address or account alias.`
      );
    }

    // Add runtime address validation, skip for simulated internal accounts
    if (!accountOrAddress.startsWith("kaspa:sim_")) {
      try {
        // @ts-ignore
        const kaspa = await import("kaspa-wasm");
        try {
          if (typeof kaspa.Address === "function" || kaspa.Address) {
            new kaspa.Address(accountOrAddress);
          }
        } catch (e) {
          const err = new Error(
            `HARDKAS_INVALID_ADDRESS: Invalid Kaspa address format or checksum.`
          );
          (err as any).code = "HARDKAS_INVALID_ADDRESS";
          throw err;
        }
      } catch (e: any) {
        if (e.code === "HARDKAS_INVALID_ADDRESS") throw e;
        if (
          e.code === "ERR_MODULE_NOT_FOUND" ||
          e.message.includes("Cannot find module") ||
          e.message.includes("kaspa-wasm")
        ) {
          const err = new Error(
            "ADDRESS_VALIDATOR_UNAVAILABLE: The Kaspa address validator backend is not available."
          );
          (err as any).code = "ADDRESS_VALIDATOR_UNAVAILABLE";
          throw err;
        }
        throw e;
      }
    }

    return accountOrAddress;
  }

  if (accountOrAddress.startsWith("0x") && accountOrAddress.length === 42) {
    return accountOrAddress;
  }

  const account = resolveHardkasAccount({ nameOrAddress: accountOrAddress, config });

  if (context === "L2") {
    const evmAddress = (account as HardkasSimulatedAccount).evmAddress;
    if (!evmAddress) {
      throw new Error(
        `Account '${account.name}' does not have an EVM address configured for L2.`
      );
    }
    return evmAddress;
  }

  if (!account.address) {
    throw new Error(`Account '${account.name}' does not have a resolved address yet.`);
  }

  return account.address;
}

export function describeAccount(account: HardkasAccount): Record<string, unknown> {
  const desc: Record<string, unknown> = {
    name: account.name,
    kind: account.kind
  };

  if (account.address) {
    desc.address = account.address;
  }

  if (account.kind === "kaspa-private-key" || account.kind === "evm-private-key") {
    desc.privateKeyEnv = account.privateKeyEnv;
  }

  if (account.kind === "external-wallet" && account.walletId) {
    desc.walletId = account.walletId;
  }

  return desc;
}
