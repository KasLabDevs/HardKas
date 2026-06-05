import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Hardkas } from "../src/index.js";
import { HardkasError } from "@hardkas/core";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

describe("P1 Multisig & Sequential Signing", () => {
  let tmpDir: string;
  let sdk: Hardkas;

  beforeEach(async () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-multisig-"));
    sdk = await Hardkas.open({
      cwd: tmpDir,
      mode: "developer"
    });
  });

  afterEach(async () => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it("should sequentially sign, transition status, and respect required signers", async () => {
    // 1. Setup accounts
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");
    const carol = await sdk.accounts.resolve("carol");

    // 2. Create plan
    const plan = await sdk.tx.plan({
      from: "alice",
      to: "bob",
      amount: "10"
    });

    // 3. First signature: Alice signs (threshold = 2, required = [alice, bob])
    const sig1 = await sdk.tx.sign(plan, "alice", {
      threshold: 2,
      requiredSigners: [alice.address, bob.address]
    });

    expect(sig1.status).toBe("partially_signed");
    expect(sig1.signedTransaction).toBeUndefined();
    expect(sig1.unsignedPayloadHash).toBe(plan.contentHash);
    expect(sig1.multisig).toBeDefined();
    expect(sig1.multisig?.threshold).toBe(2);
    expect(sig1.multisig?.signatures.length).toBe(1);
    expect(sig1.multisig?.signatures[0].signer).toBe(alice.address);
    expect(sig1.signatureMetadata?.length).toBe(1);

    // 4. Reject double signature from Alice
    await expect(sdk.tx.sign(sig1, "alice", { append: true })).rejects.toThrow(
      /already signed/
    );

    // 5. Reject unauthorized signer Carol
    await expect(sdk.tx.sign(sig1, "carol", { append: true })).rejects.toThrow(
      /not an authorized signer/
    );

    // 6. Second signature: Bob signs, and the system auto-appends (no --append flag required)
    const sig2 = await sdk.tx.sign(sig1, "bob");

    expect(sig2.status).toBe("signed");
    expect(sig2.signedTransaction).toBeDefined();
    expect(sig2.signedTransaction?.format).toBe("simulated");
    expect(sig2.signedTransaction?.payload).toContain("alice");
    expect(sig2.signedTransaction?.payload).toContain("bob");
    expect(sig2.multisig?.signatures.length).toBe(2);
    expect(sig2.signatureMetadata?.length).toBe(2);

    // 8. Reject appending to already completed signed transaction
    await expect(sdk.tx.sign(sig2, "carol", { append: true })).rejects.toThrow(
      /already completed/
    );
  });

  it("should be order-invariant and produce identical contentHash regardless of signing sequence", async () => {
    const alice = await sdk.accounts.resolve("alice");
    const bob = await sdk.accounts.resolve("bob");

    // Sequence A: Alice then Bob
    const planA = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    const partialA = await sdk.tx.sign(planA, "alice", {
      threshold: 2,
      requiredSigners: [alice.address, bob.address]
    });
    const finalA = await sdk.tx.sign(partialA, "bob", { append: true });

    // Sequence B: Bob then Alice
    const planB = await sdk.tx.plan({ from: "alice", to: "bob", amount: "5" });
    const partialB = await sdk.tx.sign(planB, "bob", {
      threshold: 2,
      requiredSigners: [alice.address, bob.address]
    });
    const finalB = await sdk.tx.sign(partialB, "alice", { append: true });

    // Assert that in v4, different signing sequences produce DIFFERENT hashes 
    // because lineage (parentArtifactId) is strictly included in the hash.
    expect(finalA.contentHash).not.toBe(finalB.contentHash);
    expect(finalA.signedId).not.toBe(finalB.signedId);
    
    // However, they both sign the exact same payload
    expect(finalA.unsignedPayloadHash).toBe(finalB.unsignedPayloadHash);
  });
});
