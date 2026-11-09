import { describe, it, expect } from "vitest";
import * as artifacts from "../src/index.js";
import { ARTIFACT_VERSION, CURRENT_HASH_VERSION, HARDKAS_VERSION, calculateContentHash, verifyArtifactIntegritySync } from "../src/index.js";

// INT9-A (I-1) · Silver records on every network they can name, offline. devnet is accepted (it failed `artifact
// verify` after a real send); mainnet is accepted for offline integrity only (no command writes one); simulated is never
// a Silver network. A record must agree with the network it names: its node's reported network and its addresses'
// prefixes. Old records keep verifying, with nothing historical made up.

const PREFIX: Record<string, string> = { simnet: "kaspasim", devnet: "kaspadev", "testnet-10": "kaspatest", "testnet-11": "kaspatest", mainnet: "kaspa", simulated: "kaspasim" };
const TX = "4ec34900" + "ab".repeat(28);
const addr = (network: string) => `${PREFIX[network] ?? "kaspasim"}:qz0s9w6ftjhqq2pe4c5qlhwuzmyfpvxhfxkytmtk6ugpufnyvrwyxkqm9xyxn`;

function seal(draft: Record<string, unknown>): any {
  const d: Record<string, unknown> = { ...draft };
  delete d.contentHash;
  return { ...d, contentHash: calculateContentHash(d, CURRENT_HASH_VERSION) };
}

function deploy(network: string, over: Record<string, unknown> = {}, nodeOver: Record<string, unknown> = {}): any {
  return seal({
    schema: "hardkas.silverDeploy.v1",
    hardkasVersion: HARDKAS_VERSION,
    createdAt: "2026-11-09T00:00:00.000Z",
    networkId: network,
    capability: "silver.p2sh.deploy-spend.v1",
    compileRecord: { path: "c.json", contentHash: "a".repeat(64), artifactSha256: "b".repeat(64) },
    contract: "Vault",
    lockingScript: { version: 0, script: "aa20" + "11".repeat(32) + "87" },
    address: addr(network),
    txId: TX,
    outpoint: { transactionId: TX, index: 0 },
    valueSompi: "100000000",
    feeSompi: "2036",
    status: "confirmed",
    confirmedAtBlockDaaScore: "1234",
    node: { kind: "rusty-kaspad", verified: true, serverVersion: "2.1.0", verification: "endpoint", network, sync: "synced", endpoint: "ws://127.0.0.1:26320", ...nodeOver },
    version: ARTIFACT_VERSION,
    mode: "rpc",
    hashVersion: CURRENT_HASH_VERSION,
    ...over
  });
}

const codes = (r: any) => r.issues.map((i: any) => `${i.severity}:${i.code}`);

describe("INT9-A · Silver records name any network they can run on; mainnet offline only; never simulated", () => {
  for (const network of ["simnet", "devnet", "testnet-10", "testnet-11", "mainnet"]) {
    it(`a ${network} deploy record proven by its endpoint verifies offline`, () => {
      const r = verifyArtifactIntegritySync(deploy(network));
      expect(r.ok, JSON.stringify(r.issues)).toBe(true);
    });
  }

  it("a simulated (or a bare 'testnet') Silver record is refused: HardKAS has no Silver simulator", () => {
    for (const network of ["simulated", "testnet", "simnet-1", "kaspa-mainnet"]) {
      const r = verifyArtifactIntegritySync(deploy(network));
      expect({ network, ok: r.ok }).toEqual({ network, ok: false });
      expect(r.issues.some((i: any) => i.path === "networkId"), JSON.stringify(r.issues)).toBe(true);
    }
  });

  it("a mainnet compile record verifies offline too (the compile record a mainnet record names)", () => {
    const schema = (artifacts as any).SilverCompileV1Schema;
    expect(schema.shape.networkId.safeParse("mainnet").success).toBe(true);
    expect(schema.shape.networkId.safeParse("simulated").success).toBe(false);
  });
});

describe("INT9-A · a record agrees with the network it names (offline coherence)", () => {
  it("a devnet record whose node reported simnet is refused (never one network read as another)", () => {
    const r = verifyArtifactIntegritySync(deploy("devnet", {}, { network: "simnet" }));
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("error:NETWORK_IDENTITY_MISMATCH");
  });

  it("an address of another family disproves the record's network (a prefix never proves it)", () => {
    const r = verifyArtifactIntegritySync(deploy("devnet", { address: addr("simnet") }));
    expect(r.ok).toBe(false);
    expect(codes(r)).toContain("error:NETWORK_ADDRESS_PREFIX_MISMATCH");
    // testnet-10 and testnet-11 share one prefix: the prefix cannot tell them apart, so it is not an error
    expect(verifyArtifactIntegritySync(deploy("testnet-11", { address: addr("testnet-10") })).ok).toBe(true);
  });

  it("mode rpc with a node that claims a container check is incoherent", () => {
    const r = verifyArtifactIntegritySync(
      deploy("simnet", {}, { verification: "container", container: "c", imageDigest: "sha256:" + "f".repeat(64), expectedImageDigest: "sha256:" + "f".repeat(64), endpoint: undefined })
    );
    expect(codes(r)).toContain("error:NETWORK_IDENTITY_MISMATCH");
  });

  it("a record whose node was not synced is not a record a send can write", () => {
    const r = verifyArtifactIntegritySync(deploy("devnet", {}, { sync: "not-synced" }));
    expect(r.ok).toBe(false);
    expect(r.issues.some((i: any) => String(i.path).startsWith("node.sync")), JSON.stringify(r.issues)).toBe(true);
  });

  it("tampering after sealing is caught (the network included)", () => {
    const rec = deploy("devnet");
    const tampered = { ...rec, networkId: "simnet", address: addr("simnet"), node: { ...rec.node, network: "simnet" } };
    const r = verifyArtifactIntegritySync(tampered);
    expect(r.ok).toBe(false);
    expect(JSON.stringify(r.issues)).toMatch(/HASH|hash/);
  });
});

describe("INT9-A · old records keep verifying, nothing historical is made up", () => {
  it("a container record written before `verification`, `kind`, `sync` and `endpoint` existed", () => {
    const digest = "sha256:f85da74b9514584451f83a2cbea3aa93f700248302fe7e3e0ab17288f93c905b";
    const legacy = deploy("simnet", { mode: "localnet" }, { kind: undefined, verification: undefined, network: undefined, sync: undefined, endpoint: undefined, container: "hardkas-kaspad-toccata-v2", imageDigest: digest, expectedImageDigest: digest });
    const node = JSON.parse(JSON.stringify(legacy.node));
    const resealed = seal({ ...legacy, node });
    const r = verifyArtifactIntegritySync(resealed);
    expect(r.ok, JSON.stringify(r.issues)).toBe(true);
  });

  it("a B3 testnet record labelled mode 'localnet' (review M-3) stays valid, with a warning that it is read by node.verification", () => {
    const b3 = seal({ ...deploy("testnet-10"), mode: "localnet", node: { kind: "rusty-kaspad", verified: true, serverVersion: "2.1.0", verification: "endpoint", network: "testnet-10" } });
    const r = verifyArtifactIntegritySync(b3);
    expect(r.ok, JSON.stringify(r.issues)).toBe(true);
    expect(codes(r)).toContain("warning:LEGACY_MODE_LABEL");
  });
});
