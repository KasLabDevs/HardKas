import { createHash } from "node:crypto";

export interface NormalizedSilverCompilerOutput {
  scriptHex?: string;
  scriptHash?: string;
  abi?: any;
}

export interface SilverCompilerOutput {
  rawCompilerOutput: string;
  normalized: NormalizedSilverCompilerOutput;
}

export class SilverCompilerOutputAdapter {
  /**
   * Normalizes raw compiler stdout/stderr into a structured format.
   * Tolerates missing fields gracefully since SilverScript is experimental.
   */
  public static normalize(rawOutput: string): SilverCompilerOutput {
    const normalized: NormalizedSilverCompilerOutput = {};

    // For now, try to extract basic information if available in standard format.
    // The official compiler might output "Compiled script: <hex>" or "Script Hash: <hash>"

    // Very rudimentary extraction based on what typical Kaspa script compilers might output
    const hexMatch = rawOutput.match(/Compiled script:\s*([a-fA-F0-9]+)/i);
    if (hexMatch && hexMatch[1]) {
      normalized.scriptHex = hexMatch[1];
    }

    const hashMatch = rawOutput.match(/Script Hash:\s*([a-fA-F0-9]+)/i);
    if (hashMatch && hashMatch[1]) {
      normalized.scriptHash = hashMatch[1];
    }

    // Try to parse JSON if the compiler output is JSON-formatted
    try {
      const parsed = JSON.parse(rawOutput);

      // `silverc` outputs `CompiledContract` where `script` is an array of numbers
      if (Array.isArray(parsed.script)) {
        normalized.scriptHex = Buffer.from(parsed.script).toString("hex");
      } else if (typeof parsed.scriptHex === "string") {
        normalized.scriptHex = parsed.scriptHex;
      }

      if (typeof parsed.scriptHash === "string") {
        normalized.scriptHash = parsed.scriptHash;
      } else if (normalized.scriptHex) {
        // Calculate hash if not provided
        normalized.scriptHash = createHash("sha256")
          .update(Buffer.from(normalized.scriptHex, "hex"))
          .digest("hex");
      }

      if (parsed.abi !== undefined) {
        normalized.abi = parsed.abi;
      }
    } catch {
      // Ignore parse error, fallback to regex matches or leave undefined
    }

    return {
      rawCompilerOutput: rawOutput,
      normalized
    };
  }
}
