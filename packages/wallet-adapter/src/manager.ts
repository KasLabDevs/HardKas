import type { NetworkId } from "@hardkas/core";

export interface KaspaWalletAccount {
  address: string;
  networkId: NetworkId;
}

export interface KaspaWalletAdapter {
  id: string;
  name: string;
  installed: boolean;
  features: string[];
  connect(): Promise<KaspaWalletAccount>;
  disconnect(): Promise<void>;
  getAccount(): Promise<KaspaWalletAccount>;
  getNetwork(): Promise<NetworkId>;
  signTransaction(tx: any): Promise<any>;
  on(event: string, callback: any): void;
}

export async function detectKaspaWallets(adapters: KaspaWalletAdapter[]): Promise<{ adapters: KaspaWalletAdapter[] }> {
  return {
    adapters: adapters.filter((a) => a.installed)
  };
}

export interface ConnectWalletOptions {
  adapters: KaspaWalletAdapter[];
  preferredWalletId?: string;
  networkId?: NetworkId;
}

export async function connectKaspaWallet(options: ConnectWalletOptions): Promise<KaspaWalletAdapter> {
  const installed = options.adapters.filter((a) => a.installed);
  if (installed.length === 0) {
    throw new Error("No compatible Kaspa wallet provider was detected.");
  }

  let selected = installed[0]!;
  if (options.preferredWalletId) {
    const found = installed.find((a) => a.id === options.preferredWalletId);
    if (!found) {
      throw new Error(`Wallet provider not found: ${options.preferredWalletId}`);
    }
    selected = found;
  }

  const account = await selected.connect();

  if (options.networkId && account.networkId !== options.networkId) {
    throw new Error(`Wallet connected to ${account.networkId}, expected ${options.networkId}`);
  }

  return selected;
}
