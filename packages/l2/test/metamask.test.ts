import { describe, it, expect } from "vitest";
import { generateAddEthereumChainPayload, generateMetaMaskSnippet } from "../src/metamask";
import { BUILTIN_L2_PROFILES } from "../src/profiles";

describe("MetaMask Payload Generation", () => {
  const profile = BUILTIN_L2_PROFILES.find(p => p.name === "igra")!;

  it("should generate a valid wallet_addEthereumChain payload", () => {
    const payload = generateAddEthereumChainPayload(profile);
    
    expect(payload.chainId).toBe("0x4bd8"); // 19416 in hex
    expect(payload.chainName).toBe("Igra");
    expect(payload.rpcUrls).toContain("http://127.0.0.1:8545");
    expect(payload.nativeCurrency.symbol).toBe("iKAS");
  });

  it("should generate a valid JS snippet", () => {
    const snippet = generateMetaMaskSnippet(profile);
    
    expect(snippet).toContain('method: "wallet_addEthereumChain"');
    expect(snippet).toContain('"chainId": "0x4bd8"');
    expect(snippet).toContain('window.ethereum.request');
  });

  it("should throw if chainId is missing", () => {
    const invalidProfile = { ...profile, chainId: undefined };
    expect(() => generateAddEthereumChainPayload(invalidProfile as any)).toThrow(/missing chainId/);
  });
});
