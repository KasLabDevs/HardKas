import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { argon2id } from "hash-wasm";
import { 
  EncryptedKeystoreV2, 
  KeystorePayload, 
  KeystoreUnlockResult 
} from "./types.js";

import { writeFileAtomic } from "@hardkas/core";

/**
 * HardKAS Keystore V2 Implementation
 * 
 * Uses Argon2id for KDF and AES-256-GCM for encryption.
 * Designed for local developer workflows.
 */
export class KeystoreManager {
  /**
   * Keystore container format version. Separate from ARTIFACT_VERSION.
   * This versions the encrypted keystore envelope, not HardKAS artifacts.
   */
  private static readonly KEYSTORE_FORMAT_VERSION = "2.0.0";
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
    if (password.length < 8) throw new Error("Password must be at least 8 characters long.");

    const salt = crypto.randomBytes(16);
    const nonce = crypto.randomBytes(12);

    const iterations = options.iterations || 3;
    const memory = options.memory || 65536; // 64MB
    const parallelism = options.parallelism || 1;

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
      kdf: {
        algorithm: "argon2id",
        memory,
        iterations,
        parallelism,
        salt: salt.toString("base64")
      },
      cipher: {
        algorithm: "aes-256-gcm",
        nonce: nonce.toString("base64"),
        tag: tag.toString("base64")
      },
      encryptedPayload: encryptedPayload.toString("base64"),
      createdAt: new Date().toISOString(),
      metadata: {
        label: options.label,
        network: options.network,
        address: payload.address
      }
    };
  }

  /**
   * Decrypts an encrypted keystore using a password.
   */
  static async decryptEncryptedKeystore(
    keystore: EncryptedKeystoreV2,
    password: string
  ): Promise<KeystoreUnlockResult> {
    if (keystore.version !== this.KEYSTORE_FORMAT_VERSION) {
      return { success: false, error: `Unsupported keystore version: ${keystore.version}` };
    }

    try {
      const salt = Buffer.from(keystore.kdf.salt, "base64");
      const nonce = Buffer.from(keystore.cipher.nonce, "base64");
      const tag = Buffer.from(keystore.cipher.tag, "base64");
      const encryptedData = Buffer.from(keystore.encryptedPayload, "base64");

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
      decipher.setAuthTag(tag);

      const decrypted = Buffer.concat([
        decipher.update(encryptedData),
        decipher.final()
      ]);

      // Memory zeroization
      derivedKey.fill(0);

      const payload = JSON.parse(decrypted.toString("utf8")) as KeystorePayload;
      return { success: true, payload };
    } catch (e) {
      return { success: false, error: "Invalid password or corrupted keystore." };
    }
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
      const keystore = JSON.parse(data);
      if (keystore.type !== this.KEYSTORE_FORMAT_TYPE) {
        throw new Error(`Invalid keystore type: ${keystore.type}`);
      }
      return keystore as EncryptedKeystoreV2;
    } catch (e) {
      throw new Error(`Failed to load keystore at ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  /**
   * Saves an encrypted keystore to the filesystem.
   */
  static async saveEncryptedKeystore(filePath: string, keystore: EncryptedKeystoreV2): Promise<void> {
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
      throw new Error(`Failed to save keystore at ${filePath}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
