import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { argon2id } from "hash-wasm";
import { KeystoreManager } from "../src/keystore.js";

/*
 * TX-07 (C) / L-01 (audit 3-nov): keystore v2 (Argon2id + AES-256-GCM) left `metadata.network` / `metadata.address`
 * outside the authenticated data (no AAD), so a file edited to say another network still unlocked, and its KDF
 * parameters had no bounds (a file could ask Argon2id for any memory: DoS on unlock). Now: new keystores (format 2.1.0)
 * bind network and address (and the KDF parameters) as AES-GCM AAD; legacy 2.0.0 files still open, with their metadata
 * checked against the encrypted payload; KDF parameters are bounded before any derivation.
 */

const PW = "tx07-password-only";
const payload = { address: "kaspasim:qqtx07addressaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", privateKey: "11".repeat(32), network: "simnet" };

async function legacyKeystore(): Promise<any> {
  // the 2.0.0 envelope exactly as the previous implementation wrote it: no AAD
  const salt = crypto.randomBytes(16);
  const nonce = crypto.randomBytes(12);
  const key = Buffer.from(await argon2id({ password: PW, salt, parallelism: 1, iterations: 3, memorySize: 65536, hashLength: 32, outputType: "hex" }), "hex");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, nonce);
  const enc = Buffer.concat([cipher.update(JSON.stringify(payload), "utf8"), cipher.final()]);
  return {
    version: "2.0.0",
    type: "hardkas.encryptedKeystore.v2",
    kdf: { algorithm: "argon2id", memory: 65536, iterations: 3, parallelism: 1, salt: salt.toString("base64") },
    cipher: { algorithm: "aes-256-gcm", nonce: nonce.toString("base64"), tag: cipher.getAuthTag().toString("base64") },
    encryptedPayload: enc.toString("base64"),
    createdAt: new Date().toISOString(),
    metadata: { label: "legacy", network: "simnet", address: payload.address }
  };
}

describe("TX-07 · keystore metadata authenticated, KDF bounded", () => {
  it("a new keystore binds network and address: editing either makes it refuse to unlock with the right password (KEYSTORE_UNLOCK_FAILED: AES-GCM cannot tell an edit from a wrong password)", async () => {
    const ks: any = await KeystoreManager.createEncryptedKeystore(payload, PW, { label: "a", network: "simnet" });
    expect(ks.version).toBe("2.1.0");
    expect((await KeystoreManager.decryptEncryptedKeystore(ks, PW)).success).toBe(true);
    for (const edit of [(k: any) => (k.metadata.network = "testnet-10"), (k: any) => (k.metadata.address = "kaspatest:qqother")]) {
      const tampered = structuredClone(ks);
      edit(tampered);
      const r: any = await KeystoreManager.decryptEncryptedKeystore(tampered, PW);
      expect(r.success).toBe(false);
      expect(r.code).toBe("KEYSTORE_UNLOCK_FAILED");
    }
  });

  it("a legacy 2.0.0 keystore still opens (metadata checked against the payload); an edited address or network type is refused", async () => {
    const legacy = await legacyKeystore();
    const ok: any = await KeystoreManager.decryptEncryptedKeystore(legacy, PW);
    expect(ok.success).toBe(true);
    expect(ok.metadataAuthenticated).toBe(false);
    for (const edit of [(k: any) => (k.metadata.address = "kaspasim:qqother"), (k: any) => (k.metadata.network = "testnet-10")]) {
      const tampered = structuredClone(legacy);
      edit(tampered);
      const r: any = await KeystoreManager.decryptEncryptedKeystore(tampered, PW);
      expect(r.success).toBe(false);
      expect(r.code).toBe("KEYSTORE_METADATA_MISMATCH");
    }
  });

  it("KDF parameters out of bounds are refused before any derivation (no multi-GB Argon2id from a file)", async () => {
    const ks: any = await KeystoreManager.createEncryptedKeystore(payload, PW, { label: "b", network: "simnet" });
    for (const edit of [(k: any) => (k.kdf.memory = 1_000_000_000), (k: any) => (k.kdf.iterations = 10_000), (k: any) => (k.kdf.parallelism = 0)]) {
      const bad = structuredClone(ks);
      edit(bad);
      const started = Date.now();
      const r: any = await KeystoreManager.decryptEncryptedKeystore(bad, PW);
      expect(r.success).toBe(false);
      expect(r.code).toBe("KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS");
      expect(Date.now() - started).toBeLessThan(2000);
    }
    await expect(KeystoreManager.createEncryptedKeystore(payload, PW, { label: "c", network: "simnet", iterations: 1 })).rejects.toMatchObject({ code: "KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS" });
  });
});
