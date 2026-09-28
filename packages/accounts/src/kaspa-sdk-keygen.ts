import { KaspaKeyGenerator, GeneratedKaspaDevAccount } from "./real-keygen.js";
import { getNetworkPrefix } from "@hardkas/core";

export interface KaspaSdkKeyGeneratorOptions {
  readonly networkId?: "simnet" | "testnet-10" | "mainnet";
  readonly sdkLoader?: () => Promise<any>;
}

/**
 * Adapter for Kaspa SDK key generation.
 * Uses dynamic imports to avoid breaking if the SDK is not installed.
 */
export class KaspaSdkKeyGenerator implements KaspaKeyGenerator {
  private readonly networkId: string;
  private readonly sdkLoader: () => Promise<any>;

  constructor(options?: KaspaSdkKeyGeneratorOptions) {
    this.networkId = options?.networkId || "simnet";
    const rawLoader =
      options?.sdkLoader ||
      (async () => {
        const { loadKaspaWasm } = await import("./signer-backend.js");
        return await loadKaspaWasm();
      });

    this.sdkLoader = async () => {
      try {
        return await rawLoader();
      } catch (e: any) {
        // E39: a missing or altered managed SDK already names the exact command
        // that fixes it; pass it through instead of hiding it behind another code.
        if (e?.code === "WASM_TOOLCHAIN_NOT_INSTALLED" || e?.code === "WASM_TOOLCHAIN_INTEGRITY_FAILED") throw e;
        const err = new Error(
          "WALLET_BACKEND_UNAVAILABLE: the Kaspa WASM SDK could not be loaded, so real accounts cannot be generated" +
            ` (${e?.message ?? String(e)}).\n` +
            "Check it with: hardkas toolchain status"
        );
        (err as any).code = "WALLET_BACKEND_UNAVAILABLE";
        throw err;
      }
    };
  }

  async generateAccount(options?: {
    readonly networkId?: "simnet" | "testnet-10" | "mainnet";
  }): Promise<GeneratedKaspaDevAccount> {
    const sdk = await this.sdkLoader();
    const network = options?.networkId || this.networkId;

    try {
      if (typeof sdk.PrivateKey === "function") {
        const crypto = await import("node:crypto");
        const randomBytes = crypto.randomBytes(32);
        const hex = randomBytes.toString("hex");
        const privKey = new sdk.PrivateKey(hex);
        const kp = privKey.toKeypair();
        const address = kp.toAddress(getNetworkPrefix(network)).toString();
        const privateKeyStr = typeof kp.privateKey === "object" ? hex : kp.privateKey;
        const publicKeyStr =
          typeof kp.publicKey === "object" ? kp.publicKey.toString() : kp.publicKey;

        if (typeof privateKeyStr !== "string" || !/^[0-9a-f]{64}$/i.test(privateKeyStr)) {
          throw new Error(
            "Generated private key is not a valid 64-character hex string."
          );
        }

        return {
          address,
          publicKey: publicKeyStr,
          privateKey: privateKeyStr
        };
      }

      throw new Error(
        "Loaded Kaspa SDK does not expose expected PrivateKey constructor."
      );
    } catch (e) {
      throw new Error(
        `Failed to generate account using SDK: ${e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)}`
      );
    }
  }
}
