export type HardkasAccountKind =
  | "simulated"
  | "kaspa-private-key"
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
  version: "2.0.0";  // Keystore format version, not ARTIFACT_VERSION
  type: "hardkas.encryptedKeystore.v2";  // Keystore format type
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

export interface HardkasSimulatedAccount extends HardkasBaseAccount {
  kind: "simulated";
  address: string;
}

export interface HardkasKaspaPrivateKeyAccount extends HardkasBaseAccount {
  kind: "kaspa-private-key";
  privateKeyEnv?: string | undefined;
  address?: string;
}

export interface HardkasExternalWalletAccount extends HardkasBaseAccount {
  kind: "external-wallet";
  walletId?: string;
  address?: string;
}

export interface HardkasEvmPrivateKeyAccount extends HardkasBaseAccount {
  kind: "evm-private-key";
  privateKeyEnv?: string | undefined;
  address?: string;
}

export type HardkasAccount =
  | HardkasSimulatedAccount
  | HardkasKaspaPrivateKeyAccount
  | HardkasExternalWalletAccount
  | HardkasEvmPrivateKeyAccount;

export type HardkasSignerKind =
  | "simulated"
  | "kaspa-private-key"
  | "external-wallet"
  | "unsupported";

export interface SignTxPlanInput {
  planArtifact: any; // Using any here to avoid circular dependency with @hardkas/artifacts if needed, or cast later
  accountName: string;
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
