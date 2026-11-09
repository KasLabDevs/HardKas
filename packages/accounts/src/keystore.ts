import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { argon2id } from "hash-wasm";
import { EncryptedKeystoreV2, KeystorePayload, KeystoreUnlockResult } from "./types.js";

import { writeFileAtomic, stripBom, networkTypeOf, isSimnetNetworkId } from "@hardkas/core";

/**
 * TX-07 · bounds on the Argon2id parameters a keystore may carry, checked before any derivation (a file is input: it
 * must not be able to ask for gigabytes of memory or hours of iterations). Creation also enforces a floor (OWASP's
 * Argon2id minimum: 19 MiB, 2 passes). Memory is in KiB, as hash-wasm and the file take it.
 */
export const KEYSTORE_KDF_BOUNDS = Object.freeze({
  memoryKiB: { min: 8_192, createMin: 19_456, max: 1_048_576 },
  iterations: { min: 1, createMin: 2, max: 16 },
  parallelism: { min: 1, max: 16 },
  saltBytes: { min: 16, max: 64 }
});

function keystoreError(code: string, message: string): Error {
  return Object.assign(new Error(`${code}: ${message}`), { code });
}

function kdfParamsProblem(kdf: { memory?: unknown; iterations?: unknown; parallelism?: unknown; salt?: unknown }, creating: boolean): string | undefined {
  const b = KEYSTORE_KDF_BOUNDS;
  const int = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) ? v : NaN);
  const m = int(kdf.memory);
  const t = int(kdf.iterations);
  const p = int(kdf.parallelism);
  if (!(m >= (creating ? b.memoryKiB.createMin : b.memoryKiB.min) && m <= b.memoryKiB.max)) return `memory ${String(kdf.memory)} KiB`;
  if (!(t >= (creating ? b.iterations.createMin : b.iterations.min) && t <= b.iterations.max)) return `iterations ${String(kdf.iterations)}`;
  if (!(p >= b.parallelism.min && p <= b.parallelism.max)) return `parallelism ${String(kdf.parallelism)}`;
  if (!creating) {
    const salt = typeof kdf.salt === "string" ? Buffer.from(kdf.salt, "base64") : Buffer.alloc(0);
    if (salt.length < b.saltBytes.min || salt.length > b.saltBytes.max) return `salt of ${salt.length} bytes`;
  }
  return undefined;
}

/**
 * TX-07 · the authenticated data of a 2.1.0 keystore: its type and version, the KDF parameters and the metadata that
 * decides where the key may be used (network, address). Any edit of these makes AES-GCM refuse to decrypt.
 */
function keystoreAad(k: { type: string; version: string; kdf: { algorithm: string; memory: number; iterations: number; parallelism: number; salt: string }; metadata: { network?: unknown; address?: unknown } }): Buffer {
  return Buffer.from(
    JSON.stringify([
      "hardkas.keystore.aad.v1",
      k.type,
      k.version,
      k.kdf.algorithm,
      k.kdf.memory,
      k.kdf.iterations,
      k.kdf.parallelism,
      k.kdf.salt,
      String(k.metadata.network ?? ""),
      String(k.metadata.address ?? "")
    ]),
    "utf8"
  );
}

/** The network TYPE of a name (simnet aliases included), to compare a legacy file's metadata with its payload. */
const networkKindOf = (n: unknown) => networkTypeOf(n) ?? (isSimnetNetworkId(n) ? "simnet" : typeof n === "string" ? n : undefined);

/**
 * HardKAS Keystore V2 Implementation
 *
 * Uses Argon2id for KDF and AES-256-GCM for encryption.
 * Designed for local developer workflows.
 * TX-07: format 2.1.0 authenticates the metadata (AAD); 2.0.0 files are still read, their metadata checked against the
 * encrypted payload.
 */
export class KeystoreManager {
  /**
   * Keystore container format version. Separate from ARTIFACT_VERSION.
   * This versions the encrypted keystore envelope, not HardKAS artifacts.
   */
  private static readonly KEYSTORE_FORMAT_VERSION = "2.1.0";
  /** The previous envelope (no AAD), still readable. */
  private static readonly LEGACY_KEYSTORE_FORMAT_VERSION = "2.0.0";
  private static readonly KEYSTORE_FORMAT_TYPE = "hardkas.encryptedKeystore.v2";

  /**
   * Creates an encrypted keystore from a payload and password.
   */
  static async createEncryptedKeystore(
    payload: KeystorePayload,
    password: string,
    options: {
      label: string;
      network: string;
      iterations?: number;
      memory?: number;
      parallelism?: number;
    }
  ): Promise<EncryptedKeystoreV2> {
    if (!password) throw new Error("Password cannot be empty.");
    if (password.length < 8)
      throw new Error("Password must be at least 8 characters long.");

    const salt = crypto.randomBytes(16);
    const nonce = crypto.randomBytes(12);

    const iterations = options.iterations || 3;
    const memory = options.memory || 65536; // 64MB
    const parallelism = options.parallelism || 1;
    const weak = kdfParamsProblem({ memory, iterations, parallelism }, true);
    if (weak) throw keystoreError("KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS", `Argon2id ${weak} is outside the accepted range (see KEYSTORE_KDF_BOUNDS).`);

    const kdf = { algorithm: "argon2id" as const, memory, iterations, parallelism, salt: salt.toString("base64") };
    const metadata = { label: options.label, network: options.network, address: payload.address };

    // Derive key using Argon2id
    const derivedKeyHex = await argon2id({
      password,
      salt,
      parallelism,
      iterations,
      memorySize: memory,
      hashLength: 32, // 256 bits for AES-256
      outputType: "hex"
    });
    const derivedKey = Buffer.from(derivedKeyHex, "hex");

    // Encrypt payload using AES-256-GCM
    const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, nonce);
    // TX-07: the metadata that decides where the key may be used is authenticated with the ciphertext
    cipher.setAAD(keystoreAad({ type: this.KEYSTORE_FORMAT_TYPE, version: this.KEYSTORE_FORMAT_VERSION, kdf, metadata }));
    const encryptedPayload = Buffer.concat([
      cipher.update(JSON.stringify(payload), "utf8"),
      cipher.final()
    ]);
    const tag = cipher.getAuthTag();

    // Memory zeroization (best-effort)
    derivedKey.fill(0);

    return {
      version: this.KEYSTORE_FORMAT_VERSION,
      type: this.KEYSTORE_FORMAT_TYPE,
      kdf,
      cipher: {
        algorithm: "aes-256-gcm",
        nonce: nonce.toString("base64"),
        tag: tag.toString("base64"),
        aad: "hardkas.keystore.aad.v1"
      },
      encryptedPayload: encryptedPayload.toString("base64"),
      createdAt: new Date().toISOString(),
      metadata
    } as EncryptedKeystoreV2;
  }

  /**
   * Decrypts an encrypted keystore using a password.
   */
  static async decryptEncryptedKeystore(
    keystore: EncryptedKeystoreV2,
    password: string
  ): Promise<KeystoreUnlockResult> {
    const legacy = keystore.version === this.LEGACY_KEYSTORE_FORMAT_VERSION;
    if (keystore.version !== this.KEYSTORE_FORMAT_VERSION && !legacy) {
      return {
        success: false,
        error: `Unsupported keystore version: ${keystore.version}`,
        code: "KEYSTORE_VERSION_UNSUPPORTED"
      };
    }
    // TX-07: the KDF parameters come from the file: bounded before anything is derived
    const outOfBounds = kdfParamsProblem(keystore.kdf ?? {}, false);
    if (outOfBounds || keystore.kdf?.algorithm !== "argon2id") {
      return {
        success: false,
        error: `KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS: Argon2id ${outOfBounds ?? `algorithm ${String(keystore.kdf?.algorithm)}`} is outside the accepted range; the keystore was not opened.`,
        code: "KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS"
      };
    }

    let payload: KeystorePayload;
    try {
      const salt = Buffer.from(keystore.kdf.salt, "base64");
      const nonce = Buffer.from(keystore.cipher.nonce, "base64");
      const tag = Buffer.from(keystore.cipher.tag, "base64");
      const encryptedData = Buffer.from(keystore.encryptedPayload, "base64");
      if (nonce.length !== 12 || tag.length !== 16) throw new Error("nonce/tag length");

      // Derive key
      const derivedKeyHex = await argon2id({
        password,
        salt,
        parallelism: keystore.kdf.parallelism,
        iterations: keystore.kdf.iterations,
        memorySize: keystore.kdf.memory,
        hashLength: 32,
        outputType: "hex"
      });
      const derivedKey = Buffer.from(derivedKeyHex, "hex");

      // Decrypt
      const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, nonce);
      if (!legacy) decipher.setAAD(keystoreAad(keystore as any));
      decipher.setAuthTag(tag);

      let decrypted: Buffer;
      try {
        decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
      } finally {
        // Memory zeroization
        derivedKey.fill(0);
      }

      payload = JSON.parse(decrypted.toString("utf8")) as KeystorePayload;
    } catch (e) {
      // a 2.1.0 file whose metadata was edited fails here like a wrong password: GCM cannot tell which; the message says both
      return legacy
        ? { success: false, error: "Invalid password or corrupted keystore." }
        : {
            success: false,
            error: "Invalid password, or a keystore whose authenticated metadata (network, address, KDF parameters) was edited.",
            code: "KEYSTORE_UNLOCK_FAILED"
          };
    }
    if (legacy) {
      // TX-07: a 2.0.0 file's metadata is not authenticated; it must at least agree with the encrypted payload
      const addressOk = payload.address === undefined || keystore.metadata?.address === undefined || payload.address === keystore.metadata.address;
      const networkOk =
        payload.network === undefined || keystore.metadata?.network === undefined || networkKindOf(payload.network) === networkKindOf(keystore.metadata.network);
      if (!addressOk || !networkOk) {
        return {
          success: false,
          error: "KEYSTORE_METADATA_MISMATCH: the keystore's metadata (network/address) does not match its encrypted payload; it was not opened.",
          code: "KEYSTORE_METADATA_MISMATCH"
        };
      }
    }
    return { success: true, payload, metadataAuthenticated: !legacy };
  }

  /**
   * Verifies if the password is correct for the keystore.
   */
  static async verifyKeystorePassword(
    keystore: EncryptedKeystoreV2,
    password: string
  ): Promise<boolean> {
    const result = await this.decryptEncryptedKeystore(keystore, password);
    return result.success;
  }

  /**
   * Changes the password of an encrypted keystore.
   */
  static async changeKeystorePassword(
    keystore: EncryptedKeystoreV2,
    oldPassword: string,
    newPassword: string
  ): Promise<EncryptedKeystoreV2> {
    const unlock = await this.decryptEncryptedKeystore(keystore, oldPassword);
    if (!unlock.success || !unlock.payload) {
      throw new Error("Invalid current password.");
    }

    return this.createEncryptedKeystore(unlock.payload, newPassword, {
      label: keystore.metadata.label,
      network: keystore.metadata.network,
      iterations: keystore.kdf.iterations,
      memory: keystore.kdf.memory,
      parallelism: keystore.kdf.parallelism
    });
  }

  /**
   * Loads an encrypted keystore from the filesystem.
   */
  static async loadEncryptedKeystore(filePath: string): Promise<EncryptedKeystoreV2> {
    try {
      const data = await fs.promises.readFile(filePath, "utf-8");
      const keystore = JSON.parse(stripBom(data));
      if (keystore.type !== this.KEYSTORE_FORMAT_TYPE) {
        throw new Error(`Invalid keystore type: ${keystore.type}`);
      }
      return keystore as EncryptedKeystoreV2;
    } catch (e) {
      throw new Error(
        `Failed to load keystore at ${filePath}: ${e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)}`
      );
    }
  }

  /**
   * Saves an encrypted keystore to the filesystem.
   */
  static async saveEncryptedKeystore(
    filePath: string,
    keystore: EncryptedKeystoreV2
  ): Promise<void> {
    try {
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        await fs.promises.mkdir(dir, { recursive: true });
      }
      // Enforce restrictive permissions (0600) via atomic write
      await writeFileAtomic(filePath, JSON.stringify(keystore, null, 2), {
        encoding: "utf-8",
        mode: 0o600
      });
    } catch (e) {
      throw new Error(
        `Failed to save keystore at ${filePath}: ${e instanceof Error ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)}`
      );
    }
  }
}
