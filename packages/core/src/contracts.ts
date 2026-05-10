import { z } from "zod";
import { HardkasError } from "./index.js";

/**
 * HardKAS Runtime Contracts
 * 
 * Moving from "soft" types to strict enforcement at all boundaries.
 */

export interface Contract<T> {
  readonly schema: z.ZodSchema<T>;
  verify(data: unknown): T;
  tryVerify(data: unknown): { success: true; data: T } | { success: false; error: string };
}

export function createContract<T>(name: string, schema: z.ZodSchema<T>): Contract<T> {
  return {
    schema,
    verify(data: unknown): T {
      const result = schema.safeParse(data);
      if (!result.success) {
        throw new HardkasError(
          "CONTRACT_VIOLATION",
          `Runtime contract violation [${name}]: ${result.error.issues.map(i => i.message).join(", ")}`,
          { cause: result.error }
        );
      }
      return result.data;
    },
    tryVerify(data: unknown) {
      const result = schema.safeParse(data);
      if (result.success) {
        return { success: true, data: result.data };
      }
      return { success: false, error: result.error.message };
    }
  };
}

/**
 * Global Registry of System Contracts
 */
export const SystemContracts = {
  // Config is already validated in index.ts, but we can wrap it here too.
  Config: (schema: z.ZodSchema<any>) => createContract("Config", schema),
  
  // Artifacts (will be used by @hardkas/artifacts)
  Artifact: (name: string, schema: z.ZodSchema<any>) => createContract(`Artifact:${name}`, schema),
  
  // RPC Responses
  RpcResponse: (method: string, schema: z.ZodSchema<any>) => createContract(`RPC:${method}`, schema)
};
