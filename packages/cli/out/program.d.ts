import { Command } from "commander";
import { LoadedHardkasConfig } from "@hardkas/config";
/**
 * Builds the HardKAS Commander program tree.
 * Separated from execution to allow safe documentation generation and testing.
 */
export declare function buildHardkasProgram(options?: {
    forDocs?: boolean;
    loadedConfig?: LoadedHardkasConfig | undefined;
}): Command;
//# sourceMappingURL=program.d.ts.map