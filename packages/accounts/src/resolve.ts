import fs from "node:fs";
import path from "node:path";
import type { HardkasConfig } from "@hardkas/config";
import { createDeterministicAccounts } from "@hardkas/localnet";
import type { HardkasAccount, HardkasSyntheticAccount } from "./types.js";
import { CrossWorldAccountCollisionError, AccountNetworkMismatchError, AccountNetworkConflictError, stripBom } from "@hardkas/core";
import {
  loadRealAccountStoreSync,
  getRealDevAccount,
  listRealDevAccounts,
  attachInspectRedactor,
  addressMatchesNetwork
} from "./real-accounts.js";

/**
 * ACCOUNT-STORE-NETWORK-1: the network an address prefix alone settles, if any. kaspasim: is simnet (the network
 * legacy real-store accounts were always taken for), kaspa: is mainnet; kaspatest: names no single network
 * (testnet-10, testnet-11, …) and stays unbound.
 */
function networkFromAddressPrefix(address: string): string | undefined {
  if (address.startsWith("kaspasim:")) return "simnet";
  if (address.startsWith("kaspa:") && !address.startsWith("kaspa:sim_")) return "mainnet";
  return undefined;
}

export interface ResolveAccountOptions {
  nameOrAddress: string;
  config?: HardkasConfig | undefined;
  executionTarget?: import("@hardkas/core").HardkasExecutionTarget | undefined;
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
  const accounts = listHardkasAccounts(config, options.executionTarget);
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

export function assertAccountCompatible(account: HardkasAccount, target: import("@hardkas/core").HardkasExecutionTarget): void {
  // If the account specifies an execution mode explicitly, it must match the target's domain and mode.
  // Note: we're lenient with 'kaspa' kinds not explicitly pinning mode since they could be used across node and simulator
  // depending on configuration, but we enforce strict checks on 'synthetic' accounts.
  if (account.kind === "synthetic" && target.mode !== "simulator") {
    throw new AccountNetworkMismatchError({
      expected: `Execution mode 'simulator'`,
      actual: `Execution mode '${target.mode}'`,
      detail: `Account '${account.name}' is a synthetic simulator account and cannot be used with mode '${target.mode}'.`
    });
  }

  if ("network" in account && account.network && target.network && account.network !== target.network) {
    // If the account is explicitly bound to a network, it must match the execution target.
    throw new AccountNetworkMismatchError({
      expected: target.network,
      actual: account.network,
      detail: `Account '${account.name}' is bound to network '${account.network}' but execution target is '${target.network}'.`
    });
  }

  // ACCOUNT-STORE-NETWORK-1: an account not bound to one network (a legacy kaspatest: entry) is still bound to its
  // address's network family — a kaspatest: key never passes for a simnet or mainnet target, nor the reverse.
  if (
    account.kind === "kaspa" &&
    target.mode !== "simulator" &&
    target.network &&
    typeof account.address === "string" &&
    !account.address.startsWith("kaspa:sim_") &&
    !addressMatchesNetwork(account.address, target.network)
  ) {
    throw new AccountNetworkMismatchError({
      expected: target.network,
      actual: `address ${account.address}`,
      detail: `Account '${account.name}' has an address of another network than the execution target '${target.network}'.`
    });
  }
}

/**
 * HARDKAS-NETWORK-PORTABILITY-1 (C1): the network the listing is for — the execution target's, else the workspace's
 * execution default, else the legacy `defaultNetwork` mirror. Undefined when nothing says.
 */
function listingNetwork(config?: HardkasConfig, executionTarget?: import("@hardkas/core").HardkasExecutionTarget): string | undefined {
  if (executionTarget?.network) return String(executionTarget.network);
  const exec: any = config?.execution;
  const target = exec?.default ? exec.targets?.[exec.default] : undefined;
  if (typeof target?.network === "string") return target.network;
  return typeof config?.defaultNetwork === "string" ? config.defaultNetwork : undefined;
}

export function listHardkasAccounts(config?: HardkasConfig, executionTarget?: import("@hardkas/core").HardkasExecutionTarget): HardkasAccount[] {
  const accounts: Map<string, HardkasAccount> = new Map();

  let targetMode = "localnet";

  if (executionTarget) {
    targetMode = executionTarget.mode;
  } else {
    const execConfig: any = config?.execution;
    if (execConfig) {
      if (execConfig.mode) {
        targetMode = execConfig.mode;
      } else if (execConfig.default) {
        const targetName = execConfig.default;
        const target = execConfig.targets?.[targetName];
        if (target?.mode) {
          targetMode = target.mode;
        } else if (targetName === "simulator") {
          targetMode = "simulator";
        }
      }
    } else if (config?.defaultNetwork === "simulated") {
      targetMode = "simulator";
    }
  }

  // Add deterministic accounts first (defaults). HARDKAS-NETWORK-PORTABILITY-1 (C1): they are simnet keys (kaspasim:
  // addresses) or simulator identities — offered on the simulator and on simnet only, never as accounts of a public or
  // other network, where they do not exist.
  const network = listingNetwork(config, executionTarget);
  const presetsApply = targetMode === "simulator" || network === undefined || network === "simnet" || network === "simulated";
  const detAccounts = presetsApply ? createDeterministicAccounts() : [];
  for (const det of detAccounts) {
    if (targetMode === "simulator") {
      accounts.set(det.name, {
        name: det.name,
        kind: "synthetic",
        executionMode: "simulator",
        address: `kaspa:sim_${det.name}`,
        evmAddress: det.evmAddress
      });
    } else {
      accounts.set(det.name, {
        name: det.name,
        kind: "kaspa",
        network: "simnet",
        address: det.address
      });
    }
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
          const keystore = JSON.parse(stripBom(data));
          if (keystore.type === "hardkas.encryptedKeystore.v2") {
            if (!keystore.metadata?.network) {
              throw new AccountNetworkMismatchError({ expected: "known network", actual: "undefined", detail: `at ${path.join(devAccountsDir, file)}` });
            }
            if (targetMode === "simulator") {
              accounts.set(name, {
                name,
                kind: "synthetic",
                executionMode: "simulator",
                address: `kaspa:sim_${name}`,
                keystorePath: path.join(devAccountsDir, file),
                keystoreKind: "dev-account"
              } as HardkasAccount);
            } else {
              accounts.set(name, {
                name,
                kind: "kaspa",
                network: keystore.metadata.network,
                address: keystore.payload?.address || keystore.metadata?.address,
                keystorePath: path.join(devAccountsDir, file),
                keystoreKind: "dev-account"
              } as HardkasAccount);
            }
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
      const ks = JSON.parse(stripBom(data));
      for (const [name, acc] of Object.entries(ks)) {
        if ((acc as any).type === "simulated") {
          if (targetMode === "simulator") {
            accounts.set(name, {
              name,
              kind: "synthetic",
              executionMode: "simulator",
              address: (acc as any).address
            });
          }
        } else {
          if (!(acc as any).network) {
            throw new AccountNetworkMismatchError({ expected: "known network", actual: "undefined", detail: "in keystore.json" });
          }
          accounts.set(name, {
            name,
            kind: "kaspa",
            network: (acc as any).network,
            address: (acc as any).address
          });
        }
      }
    } catch(e) {
      if (e instanceof CrossWorldAccountCollisionError || e instanceof AccountNetworkMismatchError) throw e;
      // Ignore
    }
  }

  // Add from real account store.
  // ACCOUNT-STORE-NETWORK-1: an entry's network is its own `network` (written by generate/import since 2026-10-15),
  // never a constant: it used to be "simnet" for every entry, and an account's keystore (below) silently replaced it.
  // A legacy entry (no `network`) gets what its address prefix settles; its keystore, if any, decides below — and a
  // store entry that contradicts its keystore or its address is a conflict, not a choice.
  const realStore = loadRealAccountStoreSync({ cwd: workspaceRoot });
  const storeEntryNetwork = new Map<string, string | undefined>();
  if (realStore) {
    for (const realAcc of listRealDevAccounts(realStore)) {
      if (realAcc.network !== undefined && !addressMatchesNetwork(realAcc.address, realAcc.network)) {
        throw new AccountNetworkConflictError({
          account: realAcc.name,
          sources: { storeEntry: realAcc.network, address: realAcc.address },
          detail: "the store entry's network does not fit its address"
        });
      }
      const network = realAcc.network ?? networkFromAddressPrefix(realAcc.address);
      storeEntryNetwork.set(realAcc.name, realAcc.network);
      accounts.set(realAcc.name, {
        name: realAcc.name,
        kind: "kaspa",
        ...(network ? { network } : {}),
        address: realAcc.address,
        ...(realAcc.privateKeyEnv ? { privateKeyEnv: realAcc.privateKeyEnv } : {}),
        ...(realAcc.privateKey ? { privateKey: realAcc.privateKey } : {})
      } as HardkasAccount);
    }
  }

  // Add from encrypted keystore directory: the workspace's, like every source above (SDK-WORKSPACE-KEYSTORE-1:
  // the process cwd is not HardKAS state; reading it here let another directory's keystores pass for this
  // workspace's accounts).
  const keystoreDir = path.join(workspaceRoot, ".hardkas", "keystore");
  if (fs.existsSync(keystoreDir)) {
    const files = fs.readdirSync(keystoreDir);
    for (const file of files) {
      if (file.endsWith(".json")) {
        try {
          const name = path.basename(file, ".json");
          const data = fs.readFileSync(path.join(keystoreDir, file), "utf-8");
          const keystore = JSON.parse(stripBom(data));
          if (keystore.type === "hardkas.encryptedKeystore.v2") {
            if (!keystore.metadata?.network) {
              throw new AccountNetworkMismatchError({ expected: "known network", actual: "undefined", detail: `at ${path.join(keystoreDir, file)}` });
            }
            const keystoreNetwork = String(keystore.metadata.network);
            const keystoreAddress = keystore.payload?.address || keystore.metadata?.address; // Payloads are encrypted, but address might be in metadata
            // ACCOUNT-STORE-NETWORK-1: the keystore, its address and the store entry of the same name must agree
            if (typeof keystoreAddress === "string" && !addressMatchesNetwork(keystoreAddress, keystoreNetwork)) {
              throw new AccountNetworkConflictError({ account: name, sources: { keystore: keystoreNetwork, address: keystoreAddress }, detail: "the keystore's network does not fit its address" });
            }
            if (storeEntryNetwork.has(name)) {
              const entryNetwork = storeEntryNetwork.get(name);
              const entryAddress = accounts.get(name)?.address;
              if (entryNetwork !== undefined && entryNetwork !== keystoreNetwork) {
                throw new AccountNetworkConflictError({ account: name, sources: { storeEntry: entryNetwork, keystore: keystoreNetwork } });
              }
              if (typeof entryAddress === "string" && typeof keystoreAddress === "string" && entryAddress !== keystoreAddress) {
                throw new AccountNetworkConflictError({ account: name, sources: { storeEntryAddress: entryAddress, keystoreAddress }, detail: "the store entry and the keystore name different addresses" });
              }
            }
            accounts.set(name, {
              name,
              kind: "kaspa", network: keystoreNetwork,
              address: keystoreAddress,
              keystorePath: path.join(keystoreDir, file)
            });
          }
        } catch (e) {
          if (e instanceof AccountNetworkMismatchError || e instanceof AccountNetworkConflictError) throw e;
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

  // Defense in depth: every resolved account carries a self-redacting
  // util.inspect handler. Any accidental `console.log(account)` or default
  // Node error formatter stringifies with secret-bearing fields masked.
  const list = Array.from(accounts.values());
  for (const a of list) attachInspectRedactor(a as unknown as object);
  return list;
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
        const { loadKaspaWasm } = await import("./signer-backend.js");
        const kaspa = await loadKaspaWasm();
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
        if (e instanceof Error && (e as any).code === "WASM_TOOLCHAIN_INTEGRITY_FAILED") throw e;
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

  // HARDKAS-NETWORK-PORTABILITY-1 (C1): which network an account belongs to, when it is bound to one
  if ("network" in account && typeof (account as any).network === "string") {
    desc.network = (account as any).network;
  }

  if (account.kind === "kaspa" || account.kind === "evm-private-key") {
    desc.privateKeyEnv = account.privateKeyEnv;
  }

  if (account.kind === "external-wallet" && account.walletId) {
    desc.walletId = account.walletId;
  }

  return desc;
}
