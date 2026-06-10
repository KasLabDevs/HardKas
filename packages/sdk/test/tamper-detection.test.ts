import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Hardkas } from "../src/index.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("SDK Tamper Detection & Forensic Regression", () => {
  let sdk: Hardkas;
  let tmpDir: string;

  beforeAll(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-tamper-"));
    sdk = await Hardkas.create({
      cwd: tmpDir,
      autoBootstrap: true,
      network: "simulated"
    });
  });

  afterAll(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should reject tampered signedTx during verify, simulate, and send", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const signed = await sdk.tx.sign(plan, "alice");

    // Tamper the amount without updating contentHash
    const tampered = JSON.parse(JSON.stringify(signed));
    tampered.amountSompi = tampered.amountSompi + "99";

    // 1. artifacts.verify must throw or return valid: false (for memory object)
    const verResult = await sdk.artifacts.verify(tampered, { throwOnInvalid: false });
    console.log("TAMPER RESULT:", JSON.stringify(verResult, null, 2));
    expect(verResult.valid).toBe(false);
    expect(verResult.reason).toBe("content_hash_mismatch");

    // 2. tx.simulate must throw
    await expect(sdk.tx.simulate(tampered)).rejects.toThrow(
      /content_hash_mismatch|corrupted or invalid/
    );

    // 3. tx.send must throw
    await expect(sdk.tx.send(tampered as any)).rejects.toThrow(
      /content_hash_mismatch|corrupted or invalid/
    );
  });

  it("should reject tampered plan during verify and sign", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });

    const tampered = JSON.parse(JSON.stringify(plan));
    tampered.to.address = "kaspa:fake";

    const verResult = await sdk.artifacts.verify(tampered, { throwOnInvalid: false });
    expect(verResult.valid).toBe(false);

    await expect(sdk.tx.sign(tampered as any, "alice")).rejects.toThrow(
      /content_hash_mismatch|corrupted or invalid/
    );
  });

  it("should reject tampered receipt during replay verify", async () => {
    const plan = await sdk.tx.plan({ from: "alice", to: "bob", amount: "10" });
    const signed = await sdk.tx.sign(plan, "alice");
    const { receipt } = await sdk.tx.simulate(signed);

    const tampered = JSON.parse(JSON.stringify(receipt));
    tampered.amountSompi = "99999999999999";

    const replayResult = await sdk.replay.verify(tampered, {
      throwOnInvalid: false
    } as any);
    // Since replay verify doesn't throw, it should return passed: false
    expect(replayResult.passed).toBe(false);
    expect(replayResult.determinism).toBe("failed");
  });

  it("should pass forensic regression test for forensic-Tamper-Detection-1780477460463.json", async () => {
    // The user copied the forensic dump to HardKas-repo/evidence/crypto-audit-081/forensic-Tamper-Detection-1780477460463.json
    const forensicPath = path.resolve(
      __dirname,
      "../../../evidence/crypto-audit-081/forensic-Tamper-Detection-1780477460463.json"
    );
    if (!fs.existsSync(forensicPath)) {
      console.warn("Forensic dump not found, skipping specific regression test.");
      return;
    }

    const dump = JSON.parse(fs.readFileSync(forensicPath, "utf-8"));
    const tamperedArtifact = dump.mutatedInput;

    // Our patched SDK should reject this instantly
    const result = await sdk.artifacts.verify(tamperedArtifact, {
      throwOnInvalid: false
    });
    console.log("FORENSIC RESULT:", JSON.stringify(result, null, 2));
    expect(result.valid).toBe(false);
    expect(result.reason).toBe("content_hash_mismatch");
  });
});
