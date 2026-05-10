import type { NetworkId } from "@hardkas/core";

export type WalletFeature =
  | "address:read"
  | "transaction:sign"
  | "transaction:signAndSubmit"
  | "message:sign"
  | "network:switch";

export interface KaspaWalletAccount {
  readonly address: string;
  readonly publicKey?: Uint8Array | undefined;
  readonly networkId: NetworkId;
}

export interface KaspaUnsignedTransaction {
  readonly version: number;
  readonly inputs: readonly unknown[];
  readonly outputs: readonly unknown[];
  readonly payload?: Uint8Array | undefined;
}

export interface KaspaSignedTransaction {
  readonly transaction: unknown;
  readonly txId?: string;
}

export interface KaspaWalletAdapter {
  readonly id: string;
  readonly name: string;
  readonly icon?: string;
  readonly installed: boolean;
  readonly features: readonly WalletFeature[];

  connect(options?: { networkId?: NetworkId | undefined } | undefined): Promise<KaspaWalletAccount>;
  disconnect(): Promise<void>;

  getAccount(): Promise<KaspaWalletAccount | null>;
  getNetwork(): Promise<NetworkId>;

  signTransaction(tx: KaspaUnsignedTransaction): Promise<KaspaSignedTransaction>;

  signAndSubmitTransaction?(
    tx: KaspaUnsignedTransaction
  ): Promise<{ txId: string }>;

  signMessage?(message: Uint8Array): Promise<{ signature: Uint8Array }>;

  switchNetwork?(networkId: NetworkId): Promise<void>;

  on(
    event: "connect" | "disconnect" | "accountChanged" | "networkChanged",
    listener: (...args: unknown[]) => void
  ): () => void;
}

export interface WalletDiscoveryResult {
  readonly adapters: readonly KaspaWalletAdapter[];
}

export async function detectKaspaWallets(
  adapters: readonly KaspaWalletAdapter[]
): Promise<WalletDiscoveryResult> {
  return {
    adapters: adapters.filter((adapter) => adapter.installed)
  };
}

export async function connectKaspaWallet(options: {
  readonly adapters: readonly KaspaWalletAdapter[];
  readonly preferredWalletId?: string;
  readonly networkId?: NetworkId;
}): Promise<KaspaWalletAdapter> {
  const installed = options.adapters.filter((adapter) => adapter.installed);

  if (installed.length === 0) {
    throw new Error("No compatible Kaspa wallet provider was detected.");
  }

  const selected =
    options.preferredWalletId === undefined
      ? installed[0]
      : installed.find((adapter) => adapter.id === options.preferredWalletId);

  if (!selected) {
    throw new Error(`Wallet provider not found: ${options.preferredWalletId}`);
  }

  await selected.connect({ networkId: options.networkId });

  return selected;
}
