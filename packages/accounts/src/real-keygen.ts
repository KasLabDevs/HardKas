export interface GeneratedKaspaDevAccount {
  readonly address: string;
  readonly publicKey?: string;
  readonly privateKey: string;
  readonly mnemonic?: string;
  /** ECDSA spends · "ecdsa" when `address` is the key's ECDSA P2PK address; absent = Schnorr. */
  readonly keyScheme?: "ecdsa";
}

export interface KaspaKeyGenerator {
  generateAccount(options?: {
    readonly networkId?: "simnet" | "testnet-10" | "mainnet";
    /** ECDSA spends · the address scheme of the generated account (default Schnorr). */
    readonly keyScheme?: "schnorr" | "ecdsa";
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
