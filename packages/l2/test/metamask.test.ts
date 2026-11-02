import { describe, it, expect } from "vitest";
import {
  generateAddEthereumChainPayload,
  generateMetaMaskSnippet
} from "../src/metamask";
import { BUILTIN_L2_PROFILES } from "../src/profiles";

describe("MetaMask Payload Generation", () => {
  const mainnetProfile = BUILTIN_L2_PROFILES.find((p) => p.name === "igra-mainnet")!;
  const caravelProfile = BUILTIN_L2_PROFILES.find((p) => p.name === "igra-caravel")!;
  const galleonProfile = BUILTIN_L2_PROFILES.find((p) => p.name === "igra-galleon")!;

  it("should generate a valid wallet_addEthereumChain payload for Igra Mainnet", () => {
    const payload = generateAddEthereumChainPayload(mainnetProfile);

    expect(payload.chainId).toBe("0x97b1"); // 38833 in hex
    expect(payload.chainName).toBe("Igra Mainnet");
    expect(payload.rpcUrls).toEqual(["https://rpc.igralabs.com:8545"]);
    expect(payload.nativeCurrency.symbol).toBe("iKAS");
  });

  it("should generate a payload for Galleon and refuse Caravel (no endpoint)", () => {
    const galleonPayload = generateAddEthereumChainPayload(galleonProfile);
    expect(galleonPayload.chainId).toBe("0x97b4"); // 38836 in hex
    expect(galleonPayload.chainName).toBe("Igra Galleon Testnet");

    expect(() => generateAddEthereumChainPayload(caravelProfile)).toThrow(/missing rpcUrl/);
  });

  it("should generate a valid JS snippet", () => {
    const snippet = generateMetaMaskSnippet(galleonProfile);

    expect(snippet).toContain('method: "wallet_addEthereumChain"');
    expect(snippet).toContain('"chainId": "0x97b4"');
    expect(snippet).toContain("window.ethereum.request");
  });

  it("should throw if chainId is missing", () => {
    const invalidProfile = { ...mainnetProfile, chainId: undefined };
    expect(() => generateAddEthereumChainPayload(invalidProfile as any)).toThrow(
      /missing chainId/
    );
  });
});
