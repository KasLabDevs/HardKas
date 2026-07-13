import { HardkasSchemas } from "@hardkas/artifacts";
import type { Hardkas } from "./index.js";

export interface IgraStatusResult {
  ok: boolean;
  schema: typeof HardkasSchemas.IgraStatusV1;
  status: "AVAILABLE" | "MISSING_DEPENDENCY" | "UNSUPPORTED_CAPABILITY";
  rpcUrl?: string | undefined;
  version?: string | undefined;
  error?: string | undefined;
}

export class HardkasIgra {
  constructor(private sdk: Hardkas) {}

  /**
   * Probes the given RPC URL for Igra capabilities.
   * Igra is treated as a separate L2 endpoint.
   */
  async probe(igraRpcUrl?: string): Promise<IgraStatusResult> {
    if (!igraRpcUrl) {
      return {
        ok: false,
        schema: HardkasSchemas.IgraStatusV1,
        status: "MISSING_DEPENDENCY",
        error: "No IGRA_RPC_URL provided. Igra is an explicit L2 endpoint and must be configured."
      };
    }

    // Removed capabilitiesApi probe, default to missing for now
    if (true) {
      return {
        ok: false,
        schema: HardkasSchemas.IgraStatusV1,
        status: "MISSING_DEPENDENCY",
        error: "Igra capabilities removed."
      };
    }
  }
}
