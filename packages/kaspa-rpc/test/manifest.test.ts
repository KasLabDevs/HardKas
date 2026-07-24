import { describe, it, expect } from "vitest";
import { CoverageEngine, PublicApiDeclaration } from "../src/manifest/coverage-report.js";

describe("CoverageEngine", () => {
  it("should evaluate getBlock as covered when fully implemented", () => {
    const impls: Record<string, PublicApiDeclaration> = {
      getBlock: {
        hardkasMethod: "getBlock",
        requestTyped: true,
        responseTyped: true,
        errorMapped: true,
        simnetTested: true,
        rawWrapperAvailable: true,
        highLevelAbstractionAvailable: false,
        cancellationSupported: true
      }
    };

    const report = CoverageEngine.generateReport(impls);
    const getBlockEntry = report.find(r => r.operation === "getBlock");
    
    expect(getBlockEntry).toBeDefined();
    expect(getBlockEntry?.status).toBe("covered");
  });

  it("should evaluate getUtxosByAddresses as partial if rawWrapperAvailable is false", () => {
    const impls: Record<string, PublicApiDeclaration> = {
      getUtxosByAddresses: {
        hardkasMethod: "getUtxosByAddress",
        requestTyped: true,
        responseTyped: true,
        errorMapped: true,
        simnetTested: true,
        rawWrapperAvailable: false,
        highLevelAbstractionAvailable: true,
        cancellationSupported: false
      }
    };

    const report = CoverageEngine.generateReport(impls);
    const utxosEntry = report.find(r => r.operation === "getUtxosByAddresses");
    
    expect(utxosEntry).toBeDefined();
    expect(utxosEntry?.status).toBe("partial");
  });

  it("should output valid markdown", () => {
    const impls: Record<string, PublicApiDeclaration> = {
      getBlock: {
        hardkasMethod: "getBlock",
        requestTyped: true,
        responseTyped: true,
        errorMapped: true,
        simnetTested: true,
        rawWrapperAvailable: true,
        highLevelAbstractionAvailable: false,
        cancellationSupported: true
      }
    };
    const report = CoverageEngine.generateReport(impls);
    const md = CoverageEngine.toMarkdown(report);
    expect(md).toContain("# Kaspa RPC Surface Coverage");
    expect(md).toContain("`getBlock` | `getBlock` | COVERED | ✅");
  });
});
