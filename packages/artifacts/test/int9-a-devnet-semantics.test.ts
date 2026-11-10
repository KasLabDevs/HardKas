import { describe, it, expect } from "vitest";
import { verifyArtifactSemantics } from "../src/index.js";

// INT9-A (devnet, found by the real devnet cycle) · the semantic network/address check knew mainnet, testnet and
// "everything else is simnet": a devnet plan (kaspadev: addresses) was "corrupted or invalid" (NETWORK_ADDRESS_MISMATCH)
// and `tx sign` refused it, so no devnet payment could be signed. devnet has its own prefix; a simnet address on a devnet
// artifact (or the reverse) is still a mismatch — one network is never read as another.

const DEVNET = "kaspadev:qp63dtwu0hq2dpagch22zxpvmptvd3qx7j5d6prtz7pe7zp6qej45vdmfrvuf";
const SIMNET = "kaspasim:qr0lr4ml9fn3chekrqmjdkergxl93l4wrk3dankcgvjq776s9wn9jeadh9sjw";
const mismatch = (r: any) => r.issues.filter((i: any) => i.code === "NETWORK_ADDRESS_MISMATCH");

describe("INT9-A · the semantic address check knows devnet", () => {
  it("a devnet artifact with kaspadev: addresses has no network/address mismatch", () => {
    const r = verifyArtifactSemantics({ schema: "hardkas.txPlan.v2", networkId: "devnet", mode: "rpc", from: { address: DEVNET }, to: { address: DEVNET } } as any);
    expect(mismatch(r)).toEqual([]);
  });

  it("a simnet address on a devnet artifact, or a devnet address on a simnet one, is a mismatch", () => {
    expect(mismatch(verifyArtifactSemantics({ schema: "hardkas.txPlan.v2", networkId: "devnet", mode: "rpc", from: { address: SIMNET } } as any))).toHaveLength(1);
    expect(mismatch(verifyArtifactSemantics({ schema: "hardkas.txPlan.v2", networkId: "simnet", mode: "rpc", from: { address: DEVNET } } as any))).toHaveLength(1);
  });
});
