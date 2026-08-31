import { describe, it, expect } from "vitest";
import { 
  resolveNewIntentTarget, 
  resolveArtifactTarget, 
  resolveLegacyArtifactTarget 
} from "../src/resolve.js";
import { HardkasConfig } from "../src/types.js";
import { LegacyArtifactRequiresExplicitResolutionError, ExecutionTargetUnresolvedError } from "@hardkas/core";

describe("Target Resolution API", () => {

  const emptyConfig: HardkasConfig = {
    network: { default: "mainnet" }
  };

  describe("resolveNewIntentTarget", () => {
    it("should use explicitTarget if provided", () => {
      const target = resolveNewIntentTarget({
        config: emptyConfig,
        explicitTarget: { domain: "kaspa-l1", mode: "rpc", network: "mainnet" }
      });
      expect(target).toEqual({ domain: "kaspa-l1", mode: "rpc", network: "mainnet" });
    });

    it("should fall back to execution default in config", () => {
      const configWithExecution: HardkasConfig = {
        ...emptyConfig,
        execution: {
          default: "dev",
          targets: {
            dev: { domain: "kaspa-l1", mode: "localnet", network: "testnet-10" }
          }
        }
      };
      const target = resolveNewIntentTarget({ config: configWithExecution });
      expect(target).toEqual({ domain: "kaspa-l1", mode: "localnet", network: "testnet-10" });
    });

    it("should fall back to legacy defaultNetwork in config", () => {
      const configWithLegacy: HardkasConfig = {
        ...emptyConfig,
        defaultNetwork: "simulated"
      };
      const target = resolveNewIntentTarget({ config: configWithLegacy });
      expect(target).toEqual({ domain: "kaspa-l1", mode: "simulator", network: "simulated" });
    });

    it("should throw ExecutionTargetUnresolvedError if unable to resolve", () => {
      expect(() => resolveNewIntentTarget({ config: emptyConfig })).toThrowError(ExecutionTargetUnresolvedError);
    });
  });

  describe("resolveArtifactTarget", () => {
    it("should extract target and return source: recorded", () => {
      const artifact = {
        execution: { domain: "kaspa-l1" as const, mode: "rpc" as const, network: "mainnet" }
      };
      const result = resolveArtifactTarget({ artifact });
      expect(result).toEqual({ target: artifact.execution, source: "recorded" });
    });

    it("should throw LegacyArtifactRequiresExplicitResolutionError if execution is missing", () => {
      const artifact = {};
      expect(() => resolveArtifactTarget({ artifact })).toThrowError(LegacyArtifactRequiresExplicitResolutionError);
    });
  });

  describe("resolveLegacyArtifactTarget", () => {
    it("should fall back to config default if execution is missing", () => {
      const artifact = {};
      const config: HardkasConfig = {
        ...emptyConfig,
        defaultNetwork: "testnet-10"
      };
      const result = resolveLegacyArtifactTarget({ artifact, config });
      expect(result.source).toBe("legacy-inferred");
      expect(result.target).toEqual({ domain: "kaspa-l1", mode: "rpc", network: "testnet-10" });
    });
    
    it("should return target if it is present with legacy-inferred (soft fallback)", () => {
      const artifact = {
        execution: { domain: "kaspa-l1" as const, mode: "rpc" as const, network: "mainnet" }
      };
      const result = resolveLegacyArtifactTarget({ artifact, config: emptyConfig });
      expect(result).toEqual({ target: artifact.execution, source: "legacy-inferred" });
    });
  });

});
