import { describe, it, expect } from "vitest";
import { resolveL2Profile, listL2Profiles } from "../src/registry.js";
import { L2UserNetworkConfig } from "../src/profiles.js";

describe("L2 Registry", () => {
  describe("listL2Profiles", () => {
    it("should return built-ins by default", () => {
      const profiles = listL2Profiles();
      expect(profiles.find(p => p.name === "igra")).toBeDefined();
      expect(profiles.every(p => p.source === "built-in")).toBe(true);
    });

    it("should include user profiles", () => {
      const userProfiles: Record<string, L2UserNetworkConfig> = {
        custom: {
          chainId: 123,
          rpcUrl: "http://localhost:8545"
        }
      };
      const profiles = listL2Profiles(userProfiles);
      const custom = profiles.find(p => p.name === "custom");
      expect(custom).toBeDefined();
      expect(custom?.source).toBe("user-config");
      expect(custom?.chainId).toBe(123);
    });

    it("should allow user profiles to override built-ins", () => {
      const userProfiles: Record<string, L2UserNetworkConfig> = {
        igra: {
          chainId: 999,
          rpcUrl: "http://overridden:8545"
        }
      };
      const profiles = listL2Profiles(userProfiles);
      const igra = profiles.find(p => p.name === "igra");
      expect(igra?.source).toBe("user-config");
      expect(igra?.chainId).toBe(999);
    });
  });

  describe("resolveL2Profile", () => {
    it("should resolve a built-in profile", () => {
      const profile = resolveL2Profile({ name: "igra" });
      expect(profile.name).toBe("igra");
      expect(profile.source).toBe("built-in");
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

    it("should apply CLI overrides", () => {
      const profile = resolveL2Profile({
        name: "igra",
        cliOverrides: {
          url: "http://cli-override:8545",
          chainId: 777
        }
      });
      expect(profile.rpcUrl).toBe("http://cli-override:8545");
      expect(profile.chainId).toBe(777);
    });

    it("should throw on unknown network and list available", () => {
      expect(() => resolveL2Profile({ name: "ghost" }))
        .toThrow(/L2 profile 'ghost' not found. Available profiles: igra \(built-in\)/);
    });

    it("should validate security invariants (pre-zk cannot have trustlessExit=true)", () => {
      const userProfiles: Record<string, L2UserNetworkConfig> = {
        badNet: {
          chainId: 1,
          rpcUrl: "http://localhost",
          bridgePhase: "pre-zk",
          trustlessExit: true
        }
      };
      expect(() => resolveL2Profile({ name: "badNet", userProfiles }))
        .toThrow(/trustlessExit=true is only allowed when bridgePhase='zk'/);
    });

    it("should allow trustlessExit=true only for zk phase", () => {
      const userProfiles: Record<string, L2UserNetworkConfig> = {
        goodZk: {
          chainId: 1,
          rpcUrl: "http://localhost",
          bridgePhase: "zk",
          trustlessExit: true
        }
      };
      const profile = resolveL2Profile({ name: "goodZk", userProfiles });
      expect(profile.security.trustlessExit).toBe(true);
    });

    it("should throw on url/rpcUrl conflict in CLI overrides", () => {
      expect(() => resolveL2Profile({
        cliOverrides: {
          url: "http://url1",
          rpcUrl: "http://url2"
        }
      })).toThrow(/Conflict: Both --rpc-url and --url provided/);
    });

    it("should normalize chainId from string in CLI overrides", () => {
      const profile = resolveL2Profile({
        cliOverrides: {
          chainId: "1337"
        }
      });
      expect(profile.chainId).toBe(1337);
    });
  });
});
