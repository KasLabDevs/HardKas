import fs from "node:fs";
import path from "node:path";
import type { HardkasConfig } from "@hardkas/config";
import { createDeterministicAccounts } from "@hardkas/localnet";
import type { HardkasAccount, HardkasSyntheticAccount } from "./types.js";
import { CrossWorldAccountCollisionError, AccountNetworkMismatchError } from "@hardkas/core";
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

  // 1. Direct address parsing
  if (nameOrAddress.startsWith("kaspa:sim_")) {
    return {
      name: nameOrAddress,
      kind: "synthetic",
      executionMode: "simulator",
      address: nameOrAddress
    };
  }
  if (
    nameOrAddress.startsWith("kaspa:") ||
    nameOrAddress.startsWith("kaspatest:") ||
    nameOrAddress.startsWith("kaspasim:")
  ) {
    let network: string | undefined = "mainnet";
    if (nameOrAddress.startsWith("kaspasim:")) network = "simnet";
    else if (nameOrAddress.startsWith("kaspatest:")) {
      const match = nameOrAddress.match(/^kaspatest:(\d+)_/);
      network = match ? `testnet-${match[1]}` : undefined;
    }
    return {
      name: nameOrAddress,
      kind: "external-wallet",
      ...(network ? { network } : {}),
      address: nameOrAddress
    };
  }

  // 1.5 Handle index aliases (0 -> alice, 1 -> bob)
  let alias = nameOrAddress;
  if (alias === "0") alias = "alice";
  if (alias === "1") alias = "bob";

  // Use listHardkasAccounts to ensure we catch collisions across all sources
  const accounts = listHardkasAccounts(config);
  const found = accounts.find(a => a.name === alias);

  if (found) {
    return found;
  }

  // 6. Not found
  const available = accounts.map((a) => a.name).join(", ");
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
      kind: "synthetic", executionMode: "simulator",
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
            if (!keystore.metadata?.network) {
              throw new AccountNetworkMismatchError({ expected: "known network", actual: "undefined", detail: `at ${path.join(devAccountsDir, file)}` });
            }
            accounts.set(name, {
              name,
              kind: "kaspa", network: keystore.metadata.network,
              address: keystore.payload?.address || keystore.metadata?.address,
              keystorePath: path.join(devAccountsDir, file)
            });
          }
        } catch (e) {
          if (e instanceof AccountNetworkMismatchError) throw e;
          // Ignore
        }
      }
    }
  }

  // Add from unified keystore.json
  const keystoreJsonPath = path.join(workspaceRoot, ".hardkas", "keystore.json");
  if (fs.existsSync(keystoreJsonPath)) {
    try {
      const data = fs.readFileSync(keystoreJsonPath, "utf-8");
      const ks = JSON.parse(data);
      for (const [name, acc] of Object.entries(ks)) {
        const existing = accounts.get(name);
        const configKind = (acc as any).type === "simulated" ? "synthetic" : "kaspa";
        if (existing && existing.kind !== configKind) {
          console.error(`COLLISION DETECTED for ${name}. existing:`, existing, `configKind:`, configKind, `workspaceRoot:`, workspaceRoot, `keystoreJsonPath:`, keystoreJsonPath);
          throw new CrossWorldAccountCollisionError({ accountId: name, worlds: [existing.kind, configKind] });
        }
        if ((acc as any).type === "simulated") {
          accounts.set(name, {
            name,
            kind: "synthetic", executionMode: "simulator",
            address: (acc as any).address
          });
        } else {
          if (!(acc as any).network) {
            throw new AccountNetworkMismatchError({ expected: "known network", actual: "undefined", detail: "in keystore.json" });
          }
          accounts.set(name, {
            name,
            kind: "kaspa", network: (acc as any).network,
            address: (acc as any).address
          });
        }
      }
    } catch(e) {
      if (e instanceof CrossWorldAccountCollisionError || e instanceof AccountNetworkMismatchError) throw e;
      // Ignore
    }
  }

  // Add from real account store
  const realStore = loadRealAccountStoreSync({ cwd: workspaceRoot });
  if (realStore) {
    for (const realAcc of listRealDevAccounts(realStore)) {
      accounts.set(realAcc.name, {
        name: realAcc.name,
        kind: "kaspa", network: "simnet", // Wait, listRealDevAccounts returns accounts, does it have network? The legacy real store assumed simnet. We'll leave it as simnet for now, or maybe the store should provide it.
        address: realAcc.address,
        ...(realAcc.privateKeyEnv ? { privateKeyEnv: realAcc.privateKeyEnv } : {}),
        ...(realAcc.privateKey ? { privateKey: realAcc.privateKey } : {})
      });
    }
  }

  // Add from encrypted keystore directory
  const keystoreDir = path.join(process.cwd(), ".hardkas", "keystore");
  if (fs.existsSync(keystoreDir)) {
    const files = fs.readdirSync(keystoreDir);
    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const name = path.basename(file, ".json");
          const data = fs.readFileSync(path.join(keystoreDir, file), "utf-8");
          const keystore = JSON.parse(data);
          if (keystore.type === "hardkas.encryptedKeystore.v2") {
            if (!keystore.metadata?.network) {
              throw new AccountNetworkMismatchError({ expected: "known network", actual: "undefined", detail: `at ${path.join(keystoreDir, file)}` });
            }
            accounts.set(name, {
              name,
              kind: "kaspa", network: keystore.metadata.network,
              address: keystore.payload?.address || keystore.metadata?.address, // Payloads are encrypted, but address might be in metadata
              keystorePath: path.join(keystoreDir, file)
            });
          }
        } catch (e) {
          if (e instanceof AccountNetworkMismatchError) throw e;
          // Ignore corrupted keystores in listing
        }
      }
    }
  }

  // Override/Add from config
  if (config?.accounts) {
    for (const [name, accConfig] of Object.entries(config.accounts)) {
      const existing = accounts.get(name);
      const configKind = (accConfig as any).kind === "simulated" ? "synthetic" : (accConfig as any).kind;
      if (existing && existing.kind !== configKind) {
        console.error(`COLLISION DETECTED for ${name}. existing:`, existing, `configKind:`, configKind);
        throw new CrossWorldAccountCollisionError({ accountId: name, worlds: [existing.kind, configKind] });
      }
      accounts.set(name, {
        name,
        ...accConfig,
        kind: configKind,
        ...(configKind === "synthetic" ? { executionMode: "simulator" } : {})
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
        // @ts-ignore - Third party lib lacking types
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
      } catch (e: unknown) {
        if (e instanceof Error && (e as any).code === "HARDKAS_INVALID_ADDRESS") throw e;
        if (
          e instanceof Error &&
          ((e as any).code === "ERR_MODULE_NOT_FOUND" ||
          ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)).includes("Cannot find module") ||
          ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)).includes("kaspa-wasm"))
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
    const evmAddress = (account as HardkasSyntheticAccount).evmAddress;
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

  if (account.kind === "kaspa" || account.kind === "evm-private-key") {
    desc.privateKeyEnv = account.privateKeyEnv;
  }

  if (account.kind === "external-wallet" && account.walletId) {
    desc.walletId = account.walletId;
  }

  return desc;
}
