export type HardkasAccountKind =
  | "synthetic"
  | "kaspa"
  | "external-wallet"
  | "evm-private-key";

export interface KeystorePayload {
  address: string;
  privateKey: string;
  publicKey?: string;
  network: string;
}

export interface KeystoreKdfParams {
  algorithm: "argon2id" | "scrypt";
  memory: number;
  iterations: number;
  parallelism: number;
  salt: string; // base64
}

export interface KeystoreCipherParams {
  algorithm: "aes-256-gcm";
  nonce: string; // base64
  tag: string; // base64
}

/**
 * Encrypted keystore envelope format.
 * version/type here refer to the keystore container format, NOT artifact schema version.
 * This is intentionally separate from ARTIFACT_VERSION.
 */
export interface EncryptedKeystoreV2 {
  version: "2.0.0"; // Keystore format version, not ARTIFACT_VERSION
  type: "hardkas.encryptedKeystore.v2"; // Keystore format type
  kdf: KeystoreKdfParams;
  cipher: KeystoreCipherParams;
  encryptedPayload: string; // base64
  createdAt: string; // ISO date
  metadata: {
    label: string;
    network: string;
    [key: string]: any;
  };
}

export interface KeystoreUnlockResult {
  success: boolean;
  payload?: KeystorePayload;
  error?: string;
}

export interface HardkasBaseAccount {
  name: string;
  kind: HardkasAccountKind;
  address?: string;
}

export interface HardkasSyntheticAccount extends HardkasBaseAccount {
  kind: "synthetic";
  executionMode: "simulator";
  address: string;
  evmAddress?: string;
}

export interface HardkasKaspaAccount extends HardkasBaseAccount {
  kind: "kaspa";
  network: "simnet" | "testnet-10" | "testnet-11" | "mainnet" | string;
  privateKeyEnv?: string;
  privateKey?: string;
  keystorePath?: string;
  address: string;
}

export interface HardkasExternalWalletAccount extends HardkasBaseAccount {
  kind: "external-wallet";
  network?: "simnet" | "testnet-10" | "testnet-11" | "mainnet" | string;
  walletId?: string;
  address?: string;
}

export interface HardkasEvmPrivateKeyAccount extends HardkasBaseAccount {
  kind: "evm-private-key";
  privateKeyEnv?: string;
  address?: string;
}

export type HardkasAccount =
  | HardkasSyntheticAccount
  | HardkasKaspaAccount
  | HardkasExternalWalletAccount
  | HardkasEvmPrivateKeyAccount;

export type HardkasSignerKind =
  | "synthetic"
  | "kaspa"
  | "external-wallet"
  | "unsupported";

import { TxInputAuthorizer } from "./authorizers.js";

export interface SignTxPlanInput {
  planArtifact: any; // Using any here to avoid circular dependency with @hardkas/artifacts if needed, or cast later
  accountName?: string; // Made optional to support purely covenant transactions
  authorizers?: Readonly<Record<number, TxInputAuthorizer>>;
}

export interface SignTxPlanResult {
  signatureKind: HardkasSignerKind;
  signerAddress: string;
  txId?: string;
  signedTransaction: {
    format: "hex" | "simulated" | "unknown";
    payload: string;
  };
  signature?: {
    value: string;
  };
}

export interface HardkasTxPlanSigner {
  kind: HardkasSignerKind;
  signTxPlan(input: SignTxPlanInput): Promise<SignTxPlanResult>;
}

export interface HardkasSigner<TTx = unknown, TSignedTx = unknown> {
  account: HardkasAccount;
  signTransaction(tx: TTx): Promise<TSignedTx>;
}
