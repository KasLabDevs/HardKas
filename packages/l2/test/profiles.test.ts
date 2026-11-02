import { describe, it, expect } from "vitest";
import {
  getL2Profile,
  validateL2Profile,
  listL2Profiles,
  BUILTIN_L2_PROFILES,
  IGRA_NETWORK_INFO_SOURCE
} from "../src/index.js";
import { HARDKAS_VERSION } from "@hardkas/artifacts";

const base = {
  schema: "hardkas.l2Profile.v1",
  hardkasVersion: HARDKAS_VERSION,
  name: "test",
  type: "evm-based-rollup",
  environment: "testnet",
  writePolicy: "allowed",
  settlementLayer: "kaspa",
  executionLayer: "evm",
  gasToken: "TEST"
};

describe("L2 Profiles Registry", () => {
  it("every built-in profile validates", () => {
    for (const p of BUILTIN_L2_PROFILES) {
      expect(validateL2Profile(p)).toEqual({ ok: true, errors: [] });
    }
  });

  it("Igra mainnet is identified explicitly and requires mainnet authorization", () => {
    const p = getL2Profile("igra-mainnet")!;
    expect(p.environment).toBe("mainnet");
    expect(p.chainId).toBe(38833);
    expect(p.writePolicy).toBe("requires-explicit-mainnet-authorization");
    expect(p.feePolicy).toBeUndefined(); // no silent fee default for value-bearing networks
  });

  it("Igra profiles carry the documentary-check source (values from Igra's public docs)", () => {
    for (const name of ["igra-mainnet", "igra-galleon"]) {
      const p = getL2Profile(name)!;
      expect(p.endpoint.status).toBe("documented");
      expect(p.endpoint.source).toBe(IGRA_NETWORK_INFO_SOURCE);
      expect(p.gasToken).toBe("iKAS");
    }
    expect(getL2Profile("igra-mainnet")!.rpcUrl).toBe("https://rpc.igralabs.com:8545");
    expect(getL2Profile("igra-galleon")!.rpcUrl).toBe("https://galleon-testnet.igralabs.com:8545");
  });

  it("Caravel is deprecated, has no endpoint and cannot be written to", () => {
    const p = getL2Profile("igra-caravel")!;
    expect(p.environment).toBe("deprecated");
    expect(p.rpcUrl).toBeUndefined();
    expect(p.writePolicy).toBe("disabled");
  });

  it("the ambiguous name 'igra' is refused", () => {
    expect(() => getL2Profile("igra")).toThrow(
      expect.objectContaining({ code: "L2_PROFILE_AMBIGUOUS" })
    );
  });

  it("should return null for unknown profile", () => {
    expect(getL2Profile("unknown-chain")).toBeNull();
  });

  it("listL2Profiles includes local, galleon, mainnet and caravel", () => {
    const names = listL2Profiles().map((p) => p.name);
    expect(names).toEqual(
      expect.arrayContaining(["local", "igra-galleon", "igra-mainnet", "igra-caravel"])
    );
    expect(names).not.toContain("igra");
  });

  it("should reject profile with wrong schema", () => {
    const result = validateL2Profile({
      ...base,
      schema: "wrong.schema",
      security: { bridgePhase: "pre-zk", trustlessExit: false, custodyModel: "t", riskProfile: "high", notes: ["t"] }
    });
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.includes("Invalid schema"))).toBe(true);
  });

  it("should reject trustlessExit=true when bridgePhase is not zk", () => {
    const result = validateL2Profile({
      ...base,
      security: { bridgePhase: "pre-zk", trustlessExit: true, custodyModel: "t", riskProfile: "high", notes: ["t"] }
    });
    expect(result.ok).toBe(false);
    expect(
      result.errors.some((e) => e.toLowerCase().includes("security invariant violation"))
    ).toBe(true);
  });

  it("should allow trustlessExit=true when bridgePhase is zk", () => {
    const result = validateL2Profile({
      ...base,
      security: { bridgePhase: "zk", trustlessExit: true, custodyModel: "t", riskProfile: "low", notes: ["t"] }
    });
    expect(result.ok).toBe(true);
  });

  it("rejects a mainnet chain ID labelled as testnet, and a mainnet profile with writePolicy allowed", () => {
    const sec = { bridgePhase: "pre-zk", trustlessExit: false, custodyModel: "t", riskProfile: "high", notes: ["t"] };
    expect(validateL2Profile({ ...base, chainId: 38833, security: sec }).ok).toBe(false);
    expect(
      validateL2Profile({ ...base, environment: "mainnet", chainId: 38833, writePolicy: "allowed", security: sec }).ok
    ).toBe(false);
  });
});
