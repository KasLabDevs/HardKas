import { describe, it, expect } from "vitest";
import { resolveL2Profile, listL2Profiles } from "../src/registry.js";
import { L2UserNetworkConfig } from "../src/profiles.js";

describe("L2 Registry", () => {
  describe("listL2Profiles", () => {
    it("should return built-ins by default", () => {
      const profiles = listL2Profiles();
      expect(profiles.find((p) => p.name === "local")).toBeDefined();
      expect(profiles.every((p) => p.source === "built-in")).toBe(true);
    });

    it("should include user profiles", () => {
      const userProfiles: Record<string, L2UserNetworkConfig> = {
        custom: {
          chainId: 123,
          rpcUrl: "http://localhost:8545"
        }
      };
      const custom = listL2Profiles(userProfiles).find((p) => p.name === "custom");
      expect(custom).toBeDefined();
      expect(custom?.source).toBe("user-config");
      expect(custom?.chainId).toBe(123);
      expect(custom?.environment).toBe("unknown");
    });

    it("should allow user profiles to override built-ins", () => {
      const userProfiles: Record<string, L2UserNetworkConfig> = {
        "igra-galleon": {
          chainId: 999,
          rpcUrl: "http://overridden:8545"
        }
      };
      const p = listL2Profiles(userProfiles).find((x) => x.name === "igra-galleon");
      expect(p?.source).toBe("user-config");
      expect(p?.chainId).toBe(999);
    });

    it("a user profile that reuses a mainnet chain ID is mainnet whatever it is called", () => {
      const userProfiles: Record<string, L2UserNetworkConfig> = {
        "my-dev-net": { chainId: 38833, rpcUrl: "http://10.0.0.5:8545", environment: "testnet" }
      };
      const p = listL2Profiles(userProfiles).find((x) => x.name === "my-dev-net")!;
      expect(p.environment).toBe("mainnet");
      expect(p.writePolicy).toBe("requires-explicit-mainnet-authorization");
    });
  });

  describe("resolveL2Profile", () => {
    it("without a name resolves to the LOCAL profile, never mainnet", () => {
      const profile = resolveL2Profile({});
      expect(profile.name).toBe("local");
      expect(profile.environment).toBe("local");
      expect(profile.chainId).toBe(31337);
    });

    it("should resolve a built-in profile", () => {
      const profile = resolveL2Profile({ name: "igra-galleon" });
      expect(profile.name).toBe("igra-galleon");
      expect(profile.source).toBe("built-in");
    });

    it("the ambiguous name 'igra' is refused", () => {
      expect(() => resolveL2Profile({ name: "igra" })).toThrow(/ambiguous/);
    });

    it("should resolve a user profile", () => {
      const userProfiles: Record<string, L2UserNetworkConfig> = {
        myNet: {
          chainId: 444,
          rpcUrl: "http://mynet:8545"
        }
      };
      const profile = resolveL2Profile({ name: "myNet", userProfiles });
      expect(profile.name).toBe("myNet");
      expect(profile.chainId).toBe(444);
    });

    it("applies a URL override and marks the endpoint as user-supplied", () => {
      const profile = resolveL2Profile({
        name: "igra-galleon",
        cliOverrides: { url: "http://cli-override:8545", chainId: 38836 }
      });
      expect(profile.rpcUrl).toBe("http://cli-override:8545");
      expect(profile.chainId).toBe(38836);
      expect(profile.endpoint.status).toBe("user-supplied");
    });

    it("refuses a --chain-id that re-points a profile to another chain", () => {
      expect(() =>
        resolveL2Profile({ name: "igra-galleon", cliOverrides: { chainId: 38833 } })
      ).toThrow(expect.objectContaining({ code: "L2_CHAIN_ID_MISMATCH" }));
    });

    it("refuses a malformed --chain-id", () => {
      for (const bad of ["38836abc", "", "-1", "0", "1.5"]) {
        expect(() =>
          resolveL2Profile({ name: "local", cliOverrides: { chainId: bad } })
        ).toThrow(expect.objectContaining({ code: "L2_CHAIN_ID_INVALID" }));
      }
    });

    it("refuses a remote endpoint for the local profile", () => {
      expect(() =>
        resolveL2Profile({ name: "local", cliOverrides: { url: "https://rpc.igralabs.com:8545" } })
      ).toThrow(expect.objectContaining({ code: "L2_ENDPOINT_MISMATCH" }));
    });

    it("should throw on unknown network and list available", () => {
      expect(() => resolveL2Profile({ name: "ghost" })).toThrow(
        /L2 profile 'ghost' not found. Available profiles: local \(built-in\)/
      );
    });

    it("should validate security invariants (pre-zk cannot have trustlessExit=true)", () => {
      const userProfiles: Record<string, L2UserNetworkConfig> = {
        badNet: {
          chainId: 1234,
          rpcUrl: "http://localhost",
          bridgePhase: "pre-zk",
          trustlessExit: true
        }
      };
      expect(() => resolveL2Profile({ name: "badNet", userProfiles })).toThrow(
        /trustlessExit=true is only allowed when bridgePhase='zk'/
      );
    });

    it("should allow trustlessExit=true only for zk phase", () => {
      const userProfiles: Record<string, L2UserNetworkConfig> = {
        goodZk: {
          chainId: 1234,
          rpcUrl: "http://localhost",
          bridgePhase: "zk",
          trustlessExit: true
        }
      };
      const profile = resolveL2Profile({ name: "goodZk", userProfiles });
      expect(profile.security.trustlessExit).toBe(true);
    });

    it("should throw on url/rpcUrl conflict in CLI overrides", () => {
      expect(() =>
        resolveL2Profile({
          cliOverrides: {
            url: "http://url1",
            rpcUrl: "http://url2"
          }
        })
      ).toThrow(/Conflict: Both --rpc-url and --url provided/);
    });

    it("accepts a chainId string equal to the profile's", () => {
      expect(resolveL2Profile({ cliOverrides: { chainId: "31337" } }).chainId).toBe(31337);
      expect(resolveL2Profile({ cliOverrides: { chainId: "0x7a69" } }).chainId).toBe(31337);
    });
  });
});
