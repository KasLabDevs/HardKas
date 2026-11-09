import { describe, it, expect } from "vitest";
import { SilverDeployV1Schema, SilverSpendV1Schema, SilverCovenantV1Schema } from "../src/schemas.js";

// HK-01 / CA-TX-04 · a Silver record names the node that accepted the transaction. Only a verified rusty-kaspad can be
// that node: a record whose node is the in-memory simulator (or an unverified node) is not real-node evidence.
describe("HK-01 · Silver records accept only a rusty-kaspad node", () => {
  const schemas = { SilverDeployV1Schema, SilverSpendV1Schema, SilverCovenantV1Schema };
  const digest = "sha256:f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b";

  for (const [name, schema] of Object.entries(schemas)) {
    const node = (schema as any).shape.node;

    it(`${name}: a verified rusty-kaspad node with observed and expected digests is accepted`, () => {
      expect(node.safeParse({ kind: "rusty-kaspad", verified: true, imageDigest: digest, expectedImageDigest: digest, serverVersion: "2.1.0" }).success).toBe(true);
    });

    it(`${name}: a record written before the field existed (no kind) stays readable`, () => {
      expect(node.safeParse({ verified: true, imageDigest: digest, serverVersion: "2.1.0" }).success).toBe(true);
    });

    it(`${name}: the simulator or an unverified node is refused`, () => {
      expect(node.safeParse({ kind: "kaspa-simulator", verified: true, imageDigest: digest }).success).toBe(false);
      expect(node.safeParse({ kind: "unverified", verified: true, imageDigest: digest }).success).toBe(false);
      expect(node.safeParse({ kind: "rusty-kaspad", verified: false, imageDigest: digest }).success).toBe(false);
    });

    // L1-CORE-1 B3: a node HardKAS does not manage is proven by what it reports at its endpoint; no container is
    // inspected, so its record has no container or digest. A node proven by its container still needs the digest seen.
    it(`${name} (B3): a node proven by its endpoint is accepted without a digest, and only without one`, () => {
      const endpoint = { kind: "rusty-kaspad", verified: true, serverVersion: "2.1.0", verification: "endpoint", network: "simnet" };
      expect(node.safeParse(endpoint).success).toBe(true);
      for (const extra of [{ imageDigest: digest }, { expectedImageDigest: digest }, { container: "some-container" }]) {
        const r = node.safeParse({ ...endpoint, ...extra });
        expect(r.success, JSON.stringify(extra)).toBe(false);
        expect(JSON.stringify(r.error?.issues)).toMatch(/not inspected as a container/);
      }
      expect(node.safeParse({ ...endpoint, verification: "container" }).success).toBe(false);
      expect(node.safeParse({ kind: "rusty-kaspad", verified: true, serverVersion: "2.1.0" }).success).toBe(false);
      expect(node.safeParse({ ...endpoint, verification: "guess" }).success).toBe(false);
    });

    // INT9-A (I-1, changed on purpose): devnet is a Silver network now (a devnet run was sent and its record then failed
    // `artifact verify`), and mainnet is accepted for offline integrity only (no command writes one; nothing contacts
    // mainnet). Still refused: a bare "testnet", malformed ids, and simulated (HardKAS has no Silver simulator).
    it(`${name} (B3 · INT9-A): a record names the network it ran on: simnet, devnet or testnet-<n>; mainnet only to be read offline`, () => {
      const networkId = (schema as any).shape.networkId;
      for (const ok of ["simnet", "devnet", "testnet-10", "testnet-11", "mainnet"]) expect(networkId.safeParse(ok).success, ok).toBe(true);
      for (const bad of ["testnet", "testnet-10x", "", "simulated", "kaspa-mainnet", "simnet-1"]) expect(networkId.safeParse(bad).success, bad).toBe(false);
    });
  }
});
