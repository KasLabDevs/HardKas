import { describe, it, expect } from "vitest";
import { getSilContract, silContractBytecodeHex, silverP2shLock } from "@hardkas/core";
import { createEscrow } from "../src/index.js";

// silverc level (AUD-41): compiling the v1 escrow needs the pinned silverc in
// HARDKAS_HOME. The fail-closed cases that need no compiler stay in
// create-escrow-fail-closed.test.ts at the unit level.

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

describe("createEscrow (SilverScript v1, managed silverc installed)", () => {
  it("compiles the v1 escrow and derives its P2SH lock from the SDK", async () => {
    const { artifact, state, provenance } = await createEscrow(config);
    const { contract } = getSilContract(artifact, "Escrow");
    expect(Object.keys(contract.entries).sort()).toEqual(["mutualRelease", "refundBuyer", "releaseToSeller"]);
    expect(state.redeemScriptHex).toBe(silContractBytecodeHex(contract));
    expect(state.lockingScriptHex).toBe(silverP2shLock(state.redeemScriptHex).script);
    expect(state.address).toMatch(/^kaspasim:p/);

    expect(provenance.schema).toBe("hardkas.silver.compileProvenance.v1");
    expect(provenance.compiler.releaseTag).toBe("v1.0.0");
    expect(provenance.contractName).toBe("Escrow");
    expect(provenance.lockingScriptHex).toBe(state.lockingScriptHex);
    // Constructor arguments are evidenced by digest only.
    const serialized = JSON.stringify(provenance);
    expect(serialized).not.toContain(config.buyer.publicKeyHex);
    expect(serialized).not.toContain(config.buyerDestinationSpk);
  });

  it("is deterministic for the same parties", async () => {
    const a = await createEscrow(config);
    const b = await createEscrow(config);
    expect(a.provenance.artifactSha256).toBe(b.provenance.artifactSha256);
    expect(a.state.lockingScriptHex).toBe(b.state.lockingScriptHex);
  });
});
