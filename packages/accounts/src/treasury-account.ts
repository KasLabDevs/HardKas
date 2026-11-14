import { createHash } from "node:crypto";
import { getNetworkPrefix } from "@hardkas/core";
import { loadKaspaWasmSync } from "./signer-backend.js";
import type { HardkasKaspaAccount } from "./types.js";

export const LOCALNET_TREASURY_ACCOUNT_NAME = "__localnet_treasury";
export const LOCALNET_TREASURY_SEED = "hardkas-deterministic-simnet-treasury-v1";

export interface LocalnetTreasuryAccount extends HardkasKaspaAccount {
  readonly kind: "kaspa";
  readonly network: "simnet";
  readonly address: string;
  readonly privateKey: string;
  readonly publicKey: string;
}

let cachedTreasury: LocalnetTreasuryAccount | undefined;

/**
 * Returns the deterministic simnet-only Treasury account used by `localnet seed`
 * and `localnet fund --treasury` to distribute exact non-coinbase UTXOs (1 -> N)
 * to local dev accounts without keeping the treasury key inside `.hardkas/dev-accounts/`.
 */
export function getLocalnetTreasuryAccount(): LocalnetTreasuryAccount {
  if (cachedTreasury) {
    return { ...cachedTreasury };
  }
  const sdk = loadKaspaWasmSync();
  const privateKey = createHash("sha256").update(LOCALNET_TREASURY_SEED).digest("hex");
  const privKey = new sdk.PrivateKey(privateKey);
  const kp = privKey.toKeypair();
  const address = kp.toAddress(getNetworkPrefix("simnet")).toString();
  const publicKey = typeof kp.publicKey === "object" ? kp.publicKey.toString() : String(kp.publicKey);

  cachedTreasury = {
    name: LOCALNET_TREASURY_ACCOUNT_NAME,
    kind: "kaspa",
    network: "simnet",
    address,
    privateKey,
    publicKey
  };
  return { ...cachedTreasury };
}
