import { describe, it, expect } from "vitest";
import { KeystoreManager } from "../src/keystore.js";
import { KeystorePayload } from "../src/types.js";

describe("KeystoreManager", () => {
  const mockPayload: KeystorePayload = {
    address: "kaspa:qpvm558XvY5pXpXpXpXpXpXpXpXpXpXpXq",
    privateKey: "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
    network: "devnet"
  };
  const password = "secure-password-123";

  it("should encrypt and decrypt a payload correctly", async () => {
    const keystore = await KeystoreManager.createEncryptedKeystore(mockPayload, password, {
      label: "test-account",
      network: "devnet"
    });

    // Keystore format version (separate from ARTIFACT_VERSION)
    expect(keystore.version).toBe("2.0.0");
    expect(keystore.metadata.label).toBe("test-account");
    expect(keystore.encryptedPayload).not.toBe(JSON.stringify(mockPayload));

    const result = await KeystoreManager.decryptEncryptedKeystore(keystore, password);
    expect(result.success).toBe(true);
    expect(result.payload).toEqual(mockPayload);
  });

  it("should fail with wrong password", async () => {
    const keystore = await KeystoreManager.createEncryptedKeystore(mockPayload, password, {
      label: "test",
      network: "devnet"
    });

    const result = await KeystoreManager.decryptEncryptedKeystore(keystore, "wrong-password");
    expect(result.success).toBe(false);
    expect(result.error).toContain("Invalid password");
  });

  it("should fail with corrupted ciphertext", async () => {
    const keystore = await KeystoreManager.createEncryptedKeystore(mockPayload, password, {
      label: "test",
      network: "devnet"
    });

    // Corrupt one byte of encrypted payload
    const buffer = Buffer.from(keystore.encryptedPayload, "base64");
    buffer[0]! ^= 0xff;
    keystore.encryptedPayload = buffer.toString("base64");

    const result = await KeystoreManager.decryptEncryptedKeystore(keystore, password);
    expect(result.success).toBe(false);
  });

  it("should fail with corrupted auth tag", async () => {
    const keystore = await KeystoreManager.createEncryptedKeystore(mockPayload, password, {
      label: "test",
      network: "devnet"
    });

    // Corrupt auth tag
    const tag = Buffer.from(keystore.cipher.tag, "base64");
    tag[0]! ^= 0xff;
    keystore.cipher.tag = tag.toString("base64");

    const result = await KeystoreManager.decryptEncryptedKeystore(keystore, password);
    expect(result.success).toBe(false);
  });

  it("should produce different ciphertext for same payload/password (unique salt/nonce)", async () => {
    const k1 = await KeystoreManager.createEncryptedKeystore(mockPayload, password, {
      label: "t1",
      network: "devnet"
    });
    const k2 = await KeystoreManager.createEncryptedKeystore(mockPayload, password, {
      label: "t2",
      network: "devnet"
    });

    expect(k1.kdf.salt).not.toBe(k2.kdf.salt);
    expect(k1.cipher.nonce).not.toBe(k2.cipher.nonce);
    expect(k1.encryptedPayload).not.toBe(k2.encryptedPayload);
  });

  it("should support password change", async () => {
    const keystore = await KeystoreManager.createEncryptedKeystore(mockPayload, password, {
      label: "test",
      network: "devnet"
    });

    const newPassword = "new-secure-password";
    const updatedKeystore = await KeystoreManager.changeKeystorePassword(keystore, password, newPassword);

    expect(updatedKeystore.encryptedPayload).not.toBe(keystore.encryptedPayload);

    const oldResult = await KeystoreManager.decryptEncryptedKeystore(updatedKeystore, password);
    expect(oldResult.success).toBe(false);

    const newResult = await KeystoreManager.decryptEncryptedKeystore(updatedKeystore, newPassword);
    expect(newResult.success).toBe(true);
    expect(newResult.payload).toEqual(mockPayload);
  });

  it("should not contain private key in plaintext in the keystore JSON", async () => {
    const keystore = await KeystoreManager.createEncryptedKeystore(mockPayload, password, {
      label: "test",
      network: "devnet"
    });

    const json = JSON.stringify(keystore);
    expect(json).not.toContain(mockPayload.privateKey);
  });

  it("should support loading and saving from filesystem", async () => {
    const keystore = await KeystoreManager.createEncryptedKeystore(mockPayload, password, {
      label: "test-io",
      network: "devnet"
    });

    const tempPath = "test-keystore.json";
    await KeystoreManager.saveEncryptedKeystore(tempPath, keystore);
    
    const loaded = await KeystoreManager.loadEncryptedKeystore(tempPath);
    expect(loaded).toEqual(keystore);

    const result = await KeystoreManager.decryptEncryptedKeystore(loaded, password);
    expect(result.success).toBe(true);
    expect(result.payload).toEqual(mockPayload);

    // Cleanup
    import("node:fs").then(fs => fs.unlinkSync(tempPath));
  });

  it("should reject empty passwords", async () => {
    await expect(KeystoreManager.createEncryptedKeystore(mockPayload, "", {
      label: "test",
      network: "devnet"
    })).rejects.toThrow(/Password cannot be empty/);
  });

  it("should reject unsupported version", async () => {
    const keystore = await KeystoreManager.createEncryptedKeystore(mockPayload, password, {
      label: "test",
      network: "devnet"
    });

    (keystore as any).version = "1.0.0";
    const result = await KeystoreManager.decryptEncryptedKeystore(keystore, password);
    expect(result.success).toBe(false);
    expect(result.error).toContain("Unsupported keystore version");
  });
});
