import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createEscrow, escrowResolution, escrowTermsOf, ESCROW_SOURCE } from "../src/index.js";

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
  // C-10: the cases say version "v1" (the contract whose two amounts they carry); versionless, the differing amounts alone
  // are now refused, which would hide the key and script refusals this test is about
  it("refuses configurations the v1 contract cannot take", async () => {
    const v1 = { ...config, version: "v1" as const };
    const cases = [
      { ...v1, buyer: { publicKeyHex: "03" + config.buyer.publicKeyHex } }, // compressed ECDSA key
      { ...v1, sellerDestinationSpk: "xyz" },
      { ...v1, refundAmount: 0n },
      { ...v1, releaseAmount: "lots" }
    ];
    for (const c of cases) {
      await expect(createEscrow(c as any)).rejects.toMatchObject({ code: "ESCROW_CONFIG_INVALID" });
    }
  });

  // C-10 (audit 2026-11-13): CHANGED. This used the versionless config below (refund 1 KAS, release 2 KAS), which reached
  // the compiler as a v2 EscrowFull with principal = refund. Such a config is now ESCROW_CONFIG_INVALID before any
  // compiler is looked for (see C-10 below), so the compiler check uses the v1 escrow those amounts belong to.
  it("has no compiler but the managed, verified one", async () => {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-escrow-home-"));
    try {
      await expect(createEscrow({ ...config, version: "v1" }, { home })).rejects.toMatchObject({ code: "ESCROW_SILVERC_UNAVAILABLE" });
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
  // C-10: CHANGED. This used the versionless config, which escrowResolution read as a legacy v1 escrow while createEscrow
  // compiled it as a v2 EscrowFull. A legacy v1 escrow now says so (version "v1"); the outputs are the v1 contract's.
  it("names each branch's signers in parameter order and the outputs the contract enforces (v1)", () => {
    const v1 = { ...config, version: "v1" as const };
    expect(escrowResolution(v1, "refundBuyer")).toEqual({
      branch: "refundBuyer",
      args: [{ kind: "signer", signer: "buyer" }, { kind: "signer", signer: "arbiter" }],
      requiredOutputs: [{ amountSompi: 100000000n, scriptPublicKey: { version: 0, script: config.buyerDestinationSpk } }]
    });
    expect(escrowResolution(v1, "releaseToSeller").requiredOutputs?.[0]?.amountSompi).toBe(200000000n);
    expect(escrowResolution(v1, "mutualRelease").requiredOutputs).toBeUndefined();
    expect(() => escrowResolution(v1, "steal" as any)).toThrow(/ESCROW_BRANCH_UNKNOWN/);
  });
});

describe("C-10 · createEscrow and escrowResolution read a config the same way (escrowTermsOf)", () => {
  const { refundAmount: _r, releaseAmount: _s, ...parties } = config;
  const codeOf = (f: () => unknown) => {
    try {
      f();
      return "OK";
    } catch (e: any) {
      return e?.code ?? String(e?.message);
    }
  };

  it("C10-1 the versionless config with refundAmount ≠ releaseAmount is refused by both, before any compiler: an EscrowFull has one principal", async () => {
    // before: createEscrow compiled an EscrowFull with principal 1 KAS and escrowResolution's releaseToSeller asked for 2 KAS
    // (the arbiter could never release to the seller)
    const home = fs.mkdtempSync(path.join(os.tmpdir(), "hardkas-escrow-home-"));
    try {
      const refused = await createEscrow(config, { home }).then(() => undefined, (e: any) => e);
      expect(refused?.code).toBe("ESCROW_CONFIG_INVALID");
      expect(String(refused?.message)).toMatch(/one principal/);
      expect(String(refused?.message)).toMatch(/version "v1"/);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
    for (const branch of ["refundBuyer", "releaseToSeller", "mutualRelease"] as const) {
      expect(codeOf(() => escrowResolution(config, branch)), branch).toBe("ESCROW_CONFIG_INVALID");
    }
    // principal given and a legacy amount that differs from it: the same refusal
    expect(codeOf(() => escrowTermsOf({ ...parties, principal: 100000000n, releaseAmount: 200000000n }))).toBe("ESCROW_CONFIG_INVALID");
    expect(codeOf(() => escrowTermsOf({ ...parties } as any))).toBe("ESCROW_CONFIG_INVALID");
  });

  it("C10-2 one (version, mode, principal) for both: a v2 full config pays the same principal on every branch; equal legacy amounts are that principal", () => {
    for (const c of [{ ...parties, principal: 300000000n }, { ...parties, refundAmount: 300000000n, releaseAmount: 300000000n }, { ...parties, refundAmount: "300000000" }]) {
      expect(escrowTermsOf(c as any)).toEqual({ version: "v2", mode: "full", principal: 300000000n });
      expect(escrowResolution(c as any, "releaseToSeller").requiredOutputs).toEqual([{ amountSompi: 300000000n, scriptPublicKey: { version: 0, script: config.sellerDestinationSpk } }]);
      expect(escrowResolution(c as any, "refundBuyer").requiredOutputs).toEqual([{ amountSompi: 300000000n, scriptPublicKey: { version: 0, script: config.buyerDestinationSpk } }]);
      const mutual = escrowResolution(c as any, "mutualRelease").requiredOutputs!;
      expect(mutual.reduce((s, o) => s + o.amountSompi, 0n)).toBe(300000000n);
    }
  });

  it("C10-3 v1 and split read the same way by both: v1 keeps its two amounts; a versionless split config is EscrowSplit (it was resolved as v1)", () => {
    expect(escrowTermsOf({ ...config, version: "v1" })).toEqual({ version: "v1", mode: "full", refundAmount: 100000000n, releaseAmount: 200000000n });
    const split = { ...parties, buyerAmount: 100000000n, sellerAmount: 200000000n };
    expect(escrowTermsOf(split)).toEqual({ version: "v2", mode: "split", buyerAmount: 100000000n, sellerAmount: 200000000n });
    expect(escrowResolution(split, "executeSplit").requiredOutputs?.map((o) => o.amountSompi)).toEqual([100000000n, 200000000n]);
    expect(escrowResolution(split, "fullRelease").requiredOutputs?.map((o) => o.amountSompi)).toEqual([300000000n]);
    expect(codeOf(() => escrowTermsOf({ ...config, version: "v1", releaseAmount: undefined } as any))).toBe("ESCROW_CONFIG_INVALID");
  });
});
