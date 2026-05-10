export interface GeneratedKaspaDevAccount {
  readonly address: string;
  readonly publicKey?: string;
  readonly privateKey: string;
  readonly mnemonic?: string;
}

export interface KaspaKeyGenerator {
  generateAccount(options?: {
    readonly networkId?: "simnet" | "testnet-10" | "mainnet";
  }): Promise<GeneratedKaspaDevAccount>;
}

/**
 * Placeholder implementation for Kaspa key generation.
 * This ensures we don't implement custom crypto logic and wait for a verified SDK integration.
 */
export class UnsupportedKaspaKeyGenerator implements KaspaKeyGenerator {
  async generateAccount(): Promise<GeneratedKaspaDevAccount> {
    throw new Error(
      "Real Kaspa key generation is not configured. Install/configure a supported Kaspa SDK adapter."
    );
  }
}
