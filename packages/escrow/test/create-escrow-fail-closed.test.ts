import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEscrow, escrowResolution, ESCROW_SOURCE } from "../src/index.js";

// Cases that compile the escrow with the pinned silverc live in
// create-escrow.silverc.test.ts (silverc level); nothing here needs a compiler.

// x-only Schnorr keys (32 bytes) and P2PK destination scripts.
const config = {
  buyer: { publicKeyHex: "0a5996ccb6b3e80c85c2921c5720bcff27d2c3e1e69da5c50674ed4466b02662" },
  seller: { publicKeyHex: "a85b9b8b7ed6fc01b7a2d4b8be357e60ea9b02a2491a5e128cc1e9fdf5522731" },
  arbiter: { publicKeyHex: "3ab915359756b5394208bd165b5120ec0be4061a1290380c5ce54460decfb881" },
  buyerDestinationSpk: "20f69a597a760c2d3eddb5e6db24e39ee0b3b429188e63cc8d8174f8cfb5e11bbdac",
  sellerDestinationSpk: "208d1f2a36b5ec63251ed7a69b0fa6bb781e6a928421c97a5b3eeef52bc5da8669ac",
  refundAmount: 100000000n,
  releaseAmount: 200000000n
};

describe("createEscrow (SilverScript v1, managed silverc)", () => {
  it("refuses configurations the v1 contract cannot take", async () => {
    const cases = [
      { ...config, buyer: { publicKeyHex: "03" + config.buyer.publicKeyHex } }, // compressed ECDSA key
      { ...config, sellerDestinationSpk: "xyz" },
      { ...config, refundAmount: 0n },
      { ...config, releaseAmount: "lots" }
    ];
    for (const c of cases) {
      await expect(createEscrow(c as any)).rejects.toMatchObject({ code: "ESCROW_CONFIG_INVALID" });
    }
  });

  it("has no compiler but the managed, verified one", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-escrow-home-"));
    try {
      await expect(createEscrow(config, { home })).rejects.toMatchObject({ code: "ESCROW_SILVERC_UNAVAILABLE" });
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  });

  it("ships a v1 source (no pre-v1 syntax)", () => {
    expect(ESCROW_SOURCE).toContain("pragma silverscript ^0.1.0;");
    expect(ESCROW_SOURCE).not.toMatch(/entrypoint function/);
  });
});

describe("escrowResolution", () => {
  it("names each branch's signers in parameter order and the outputs the contract enforces", () => {
    expect(escrowResolution(config, "refundBuyer")).toEqual({
      branch: "refundBuyer",
      args: [{ kind: "signer", signer: "buyer" }, { kind: "signer", signer: "arbiter" }],
      requiredOutputs: [{ amountSompi: 100000000n, scriptPublicKey: { version: 0, script: config.buyerDestinationSpk } }]
    });
    expect(escrowResolution(config, "releaseToSeller").requiredOutputs?.[0]?.amountSompi).toBe(200000000n);
    expect(escrowResolution(config, "mutualRelease").requiredOutputs).toBeUndefined();
    expect(() => escrowResolution(config, "steal" as any)).toThrow(/ESCROW_BRANCH_UNKNOWN/);
  });
});
