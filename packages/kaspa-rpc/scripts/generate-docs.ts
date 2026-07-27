import { CoverageEngine, PublicApiDeclaration } from "../src/manifest/coverage-report.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// This would typically introspect the SDK or be driven by a registry.
// For now we statically declare the first batch we just implemented.
const currentImplementations: Record<string, PublicApiDeclaration> = {
  getBlock: { hardkasMethod: "getBlock", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getBlocks: { hardkasMethod: "getBlocks", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getHeaders: { hardkasMethod: "getHeaders", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getBlockCount: { hardkasMethod: "getBlockCount", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getSelectedTipHash: { hardkasMethod: "getSelectedTipHash", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getVirtualChainFromBlock: { hardkasMethod: "getVirtualChainFromBlock", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getCoinSupply: { hardkasMethod: "getCoinSupply", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getSyncStatus: { hardkasMethod: "getSyncStatus", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  getCurrentNetwork: { hardkasMethod: "getCurrentNetwork", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: true, highLevelAbstractionAvailable: false, cancellationSupported: true },
  
  // Legacy Abstractions
  getUtxosByAddresses: { hardkasMethod: "getUtxosByAddress", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: false, highLevelAbstractionAvailable: true, cancellationSupported: false },
  getBalanceByAddress: { hardkasMethod: "getBalanceByAddress", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: false, highLevelAbstractionAvailable: true, cancellationSupported: false },
  notifyUtxosChanged: { hardkasMethod: "subscribeToUtxosChanged", requestTyped: true, responseTyped: true, errorMapped: true, simnetTested: true, rawWrapperAvailable: false, highLevelAbstractionAvailable: true, cancellationSupported: false }
};

const report = CoverageEngine.generateReport(currentImplementations);
const markdown = CoverageEngine.toMarkdown(report);

const outPath = path.resolve(__dirname, "../../../docs/rpc-coverage.md");
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, markdown, "utf8");

console.log(`Generated RPC Coverage Markdown at: ${outPath}`);
