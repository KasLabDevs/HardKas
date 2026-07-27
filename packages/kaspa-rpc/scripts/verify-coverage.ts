import { CoverageEngine, PublicApiDeclaration, CoverageEntry } from "../src/manifest/coverage-report.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import current state (in a real scenario, this would be dynamically loaded from a registry)
// For this script we will use the same static definitions as generate-docs
const currentImplementations: Record<string, PublicApiDeclaration> = {
  getBlock: { hardkasMethod: "getBlock", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getBlocks: { hardkasMethod: "getBlocks", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getHeaders: { hardkasMethod: "getHeaders", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getBlockCount: { hardkasMethod: "getBlockCount", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getSelectedTipHash: { hardkasMethod: "getSelectedTipHash", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getVirtualChainFromBlock: { hardkasMethod: "getVirtualChainFromBlock", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getCoinSupply: { hardkasMethod: "getCoinSupply", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getSyncStatus: { hardkasMethod: "getSyncStatus", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getCurrentNetwork: { hardkasMethod: "getCurrentNetwork", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  
  // Mempool
  getMempoolEntry: { hardkasMethod: "getMempoolEntry", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getMempoolEntries: { hardkasMethod: "getMempoolEntries", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getMempoolEntriesByAddresses: { hardkasMethod: "getMempoolEntriesByAddresses", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  submitTransaction: { hardkasMethod: "submitTransaction", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  submitTransactionReplacement: { hardkasMethod: "submitTransactionReplacement", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  
  // Legacy Abstractions
  getUtxosByAddresses: { hardkasMethod: "getUtxosByAddress", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: false, highLevelAbstractionAvailable: true, cancellationSupported: false },
  getBalanceByAddress: { hardkasMethod: "getBalanceByAddress", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: false, highLevelAbstractionAvailable: true, cancellationSupported: false },
  notifyUtxosChanged: { hardkasMethod: "subscribeToUtxosChanged", requestTyped: true, responseTyped: true, errorMapped: true, rawWrapperAvailable: false, highLevelAbstractionAvailable: true, cancellationSupported: false }
};

export const COVERAGE_EXCEPTIONS: Record<string, { expected: string, reason: string }> = {
  // Example exception:
  // getBlock: {
  //   expected: "partial",
  //   reason: "Upstream response changed in pinned release",
  // }
};

const BASELINE_PATH = path.resolve(__dirname, "../src/manifest/coverage-baseline.json");

function main() {
  const report = CoverageEngine.generateReport(currentImplementations);

  let baseline: any[] = [];
  try {
    if (fs.existsSync(BASELINE_PATH)) {
      baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, "utf8"));
    } else {
      console.warn("No baseline found. Creating new baseline...");
      fs.writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2));
      process.exit(0);
    }
  } catch (e) {
    console.error("Error reading baseline:", e);
    process.exit(1);
  }

  let failed = false;

  for (const baseEntry of baseline) {
    const currentEntry = report.find(r => r.operation === baseEntry.operation);
    const exception = COVERAGE_EXCEPTIONS[baseEntry.operation];

    if (!currentEntry) {
      if (exception?.expected === "removed") {
        console.log(`[ALLOWED] Operation ${baseEntry.operation} removed: ${exception.reason}`);
      } else {
        console.error(`[ERROR] Operation ${baseEntry.operation} has disappeared from snapshot without an exception.`);
        failed = true;
      }
      continue;
    }

    if (currentEntry.coverageStatus !== baseEntry.coverageStatus || currentEntry.verificationLevel !== baseEntry.verificationLevel) {
      if (
        (baseEntry.coverageStatus === "gap" && currentEntry.coverageStatus === "partial") ||
        (baseEntry.coverageStatus === "partial" && currentEntry.coverageStatus === "covered") ||
        (baseEntry.coverageStatus === "gap" && currentEntry.coverageStatus === "covered") ||
        (baseEntry.verificationLevel === "unverified" && currentEntry.verificationLevel !== "unverified") ||
        (baseEntry.verificationLevel === "unit-tested" && currentEntry.verificationLevel === "certified-simnet")
      ) {
        console.log(`[IMPROVEMENT] Operation ${baseEntry.operation} improved. Coverage: ${baseEntry.coverageStatus}->${currentEntry.coverageStatus}, Verification: ${baseEntry.verificationLevel}->${currentEntry.verificationLevel}`);
      } else {
        if (exception?.expected === currentEntry.coverageStatus) {
          console.log(`[ALLOWED REGRESSION] Operation ${baseEntry.operation} changed: ${exception.reason}`);
        } else {
          console.error(`[REGRESSION] Operation ${baseEntry.operation} degraded. Require exception.`);
          failed = true;
        }
      }
    }
  }

  if (failed) {
    console.error("\nCoverage Verification Failed! Fix regressions or add explicit exceptions in COVERAGE_EXCEPTIONS.");
    process.exit(1);
  } else {
    console.log("\nCoverage Verification Passed!");
    // Update baseline to reflect improvements if any
    fs.writeFileSync(BASELINE_PATH, JSON.stringify(report, null, 2));
  }
}

main();
