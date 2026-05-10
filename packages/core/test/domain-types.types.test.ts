import { 
  asTxId, 
  asArtifactId, 
  asContentHash, 
  asKaspaAddress, 
  asNetworkId,
  TxId,
  ArtifactId,
  ContentHash,
  KaspaAddress,
  NetworkId
} from "../src/domain-types.js";

/**
 * Compile-time tests for Branded Types.
 * These tests verify that different brands are NOT assignable to each other.
 */

function acceptsTxId(id: TxId) { return id; }
function acceptsArtifactId(id: ArtifactId) { return id; }
function acceptsKaspaAddress(addr: KaspaAddress) { return addr; }

const tx = asTxId("tx123");
const artifact = asArtifactId("art123");
const hash = asContentHash("hash123");
const address = asKaspaAddress("kaspa:123");
const network = asNetworkId("mainnet");

// Valid assignments
acceptsTxId(tx);
acceptsArtifactId(artifact);
acceptsKaspaAddress(address);

// @ts-expect-error - ArtifactId must not be accepted as TxId
acceptsTxId(artifact);

// @ts-expect-error - ContentHash must not be accepted as ArtifactId
acceptsArtifactId(hash);

// @ts-expect-error - NetworkId must not be accepted as KaspaAddress
acceptsKaspaAddress(network);

// @ts-expect-error - Raw string must not be accepted as TxId
acceptsTxId("raw-string");

import { describe, it, expect } from "vitest";
describe("Domain Types (Compile-time)", () => {
  it("should compile correctly (verified via tsc)", () => {
    expect(true).toBe(true);
  });
});
