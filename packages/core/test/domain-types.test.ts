import { describe, it, expect } from "vitest";
import { 
  asTxId, 
  asArtifactId, 
  asKaspaAddress, 
  asDaaScore,
  asNetworkId
} from "../src/domain-types.js";

describe("Domain Types (Runtime)", () => {
  it("helpers should preserve primitive values", () => {
    const rawTxId = "abc";
    const txId = asTxId(rawTxId);
    expect(txId).toBe(rawTxId);
    expect(typeof txId).toBe("string");

    const rawDaaScore = 12345;
    const daaScore = asDaaScore(rawDaaScore);
    expect(daaScore).toBe(rawDaaScore);
    expect(typeof daaScore).toBe("number");
  });

  it("JSON serialization should be unchanged", () => {
    const data = {
      txId: asTxId("tx123"),
      address: asKaspaAddress("kaspa:123"),
      daaScore: asDaaScore(100),
      networkId: asNetworkId("mainnet")
    };

    const json = JSON.stringify(data);
    const parsed = JSON.parse(json);

    expect(parsed.txId).toBe("tx123");
    expect(parsed.address).toBe("kaspa:123");
    expect(parsed.daaScore).toBe(100);
    expect(parsed.networkId).toBe("mainnet");
  });

  it("DaaScore should remain a number at runtime", () => {
    const score = asDaaScore(555);
    expect(score + 1).toBe(556);
    expect(typeof score).toBe("number");
  });
});
