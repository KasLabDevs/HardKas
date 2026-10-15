import fs from "node:fs";
import path from "node:path";
import { AccountNetworkConflictError, stripBom } from "@hardkas/core";
import type { NetworkId } from "@hardkas/core";
import {
  loadRealAccountStoreSync,
  saveRealAccountStore,
  getDefaultRealAccountsPath,
  addressMatchesNetwork,
  type RealAccountStore,
  type RealDevAccount
} from "./real-accounts.js";

// ACCOUNT-STORE-NETWORK-1 (2026-10-15): an explicit, two-step migration of a real-account store written before entries
// recorded their network. `plan…` only reads: per account, the store entry's network, its keystore's network (the
// keystore METADATA only — the encrypted payload is never read out) and whether the address fits. `apply…` writes only a
// coherent store, and only the missing entry networks; keys, keystores and the legacy store-level label are untouched.

export type RealAccountNetworkStatus = "ok" | "migrate" | "conflict" | "undetermined";

export interface RealAccountNetworkReport {
  readonly name: string;
  readonly address: string;
  readonly storeEntryNetwork: string | null;
  readonly keystoreNetwork: string | null;
  readonly proposedNetwork: string | null;
  readonly status: RealAccountNetworkStatus;
  readonly reason?: string;
}

export interface RealAccountNetworkMigrationPlan {
  readonly storePath: string;
  /** The legacy store-level label (informational: it was "simnet" for every store, whatever its accounts were). */
  readonly storeNetworkId: string | null;
  /** True when every account is "ok" or "migrate" — the only state `apply` writes. */
  readonly coherent: boolean;
  readonly accounts: readonly RealAccountNetworkReport[];
}

function keystoreNetworkOf(root: string, account: RealDevAccount): string | null {
  const candidates = [
    ...(account.keystoreRef ? [path.resolve(root, account.keystoreRef)] : []),
    path.join(root, ".hardkas", "keystore", `${account.name}.json`)
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const parsed = JSON.parse(stripBom(fs.readFileSync(file, "utf8"))) as { metadata?: { network?: unknown } };
    const network = parsed?.metadata?.network;
    return typeof network === "string" && network !== "" ? network : null;
  }
  return null;
}

function prefixNetwork(address: string): string | null {
  if (address.startsWith("kaspasim:")) return "simnet";
  if (address.startsWith("kaspa:") && !address.startsWith("kaspa:sim_")) return "mainnet";
  return null; // kaspatest: names no single network
}

/** Read-only: what the migration would do, account by account. Writes nothing. */
export function planRealAccountNetworkMigration(options: { readonly cwd: string }): RealAccountNetworkMigrationPlan {
  const storePath = getDefaultRealAccountsPath(options.cwd);
  const store = loadRealAccountStoreSync({ cwd: options.cwd });
  if (!store) return { storePath, storeNetworkId: null, coherent: true, accounts: [] };
  const accounts: RealAccountNetworkReport[] = store.accounts.map((a) => {
    const entry = a.network ?? null;
    const keystore = keystoreNetworkOf(options.cwd, a);
    const base = { name: a.name, address: a.address, storeEntryNetwork: entry, keystoreNetwork: keystore };
    if (entry !== null && keystore !== null && entry !== keystore) {
      return { ...base, proposedNetwork: null, status: "conflict" as const, reason: `store entry says ${entry}, keystore says ${keystore}` };
    }
    const proposed = entry ?? keystore ?? prefixNetwork(a.address);
    if (proposed === null) {
      return { ...base, proposedNetwork: null, status: "undetermined" as const, reason: "no entry network, no keystore, and the address prefix names no single network" };
    }
    if (!addressMatchesNetwork(a.address, proposed)) {
      return { ...base, proposedNetwork: null, status: "conflict" as const, reason: `the address does not fit ${proposed}` };
    }
    return { ...base, proposedNetwork: proposed, status: entry !== null ? ("ok" as const) : ("migrate" as const) };
  });
  return {
    storePath,
    storeNetworkId: store.networkId ?? null,
    coherent: accounts.every((r) => r.status === "ok" || r.status === "migrate"),
    accounts
  };
}

/**
 * Writes the proposed network onto every "migrate" entry — only when the whole store is coherent (all-or-nothing:
 * a conflict or an undetermined account refuses with ACCOUNT_NETWORK_CONFLICT and writes nothing). Idempotent.
 */
export async function applyRealAccountNetworkMigration(options: { readonly cwd: string }): Promise<{ written: number; plan: RealAccountNetworkMigrationPlan }> {
  const plan = planRealAccountNetworkMigration(options);
  if (!plan.coherent) {
    const blocking = plan.accounts.filter((r) => r.status === "conflict" || r.status === "undetermined");
    throw new AccountNetworkConflictError({
      account: blocking.map((r) => r.name).join(", "),
      sources: Object.fromEntries(blocking.map((r) => [r.name, r.reason ?? r.status])),
      detail: "the store was not migrated; nothing was written"
    });
  }
  const toWrite = new Map(plan.accounts.filter((r) => r.status === "migrate").map((r) => [r.name, r.proposedNetwork as NetworkId]));
  if (toWrite.size === 0) return { written: 0, plan };
  const store = loadRealAccountStoreSync({ cwd: options.cwd }) as RealAccountStore;
  const next: RealAccountStore = {
    ...store,
    accounts: store.accounts.map((a) => (toWrite.has(a.name) && a.network === undefined ? { ...a, network: toWrite.get(a.name)! } : a))
  };
  await saveRealAccountStore(next, { cwd: options.cwd });
  return { written: toWrite.size, plan };
}
