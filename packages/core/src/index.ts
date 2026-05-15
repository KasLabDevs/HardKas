import { z } from "zod";
import { Brand } from "./domain-types.js";

export const SOMPI_PER_KAS = 100_000_000n;

export const kaspaNetworkIdSchema = z.enum([
  "mainnet",
  "testnet-10",
  "testnet-11",
  "testnet-12",
  "simnet",
  "simnet-1",
  "devnet"
]);

export type NetworkId = Brand<z.infer<typeof kaspaNetworkIdSchema>, "NetworkId">;

export const executionModeSchema = z.enum([
  "simulated",
  "real",
  "readonly"
]);

export type ExecutionMode = z.infer<typeof executionModeSchema>;

export const artifactTypeSchema = z.enum([
  "txPlan",
  "signedTx",
  "txReceipt",
  "txTrace",
  "snapshot"
]);

export type ArtifactType = z.infer<typeof artifactTypeSchema>;

export const NetworkIdSchema = kaspaNetworkIdSchema;
export const ExecutionModeSchema = executionModeSchema;
export const ArtifactTypeSchema = artifactTypeSchema;

export const hardkasConfigSchema = z.object({
  project: z.object({
    name: z.string().min(1),
    root: z.string().min(1)
  }),
  network: z.object({
    id: kaspaNetworkIdSchema,
    rpcUrl: z.string().url().optional()
  }),
  localnet: z
    .object({
      mode: z.enum(["simulated", "local-node"]).default("simulated"),
      dataDir: z.string().optional()
    })
    .default({ mode: "simulated" })
});

export type HardkasConfig = z.infer<typeof hardkasConfigSchema>;

export class HardkasError extends Error {
  readonly code: string;
  readonly cause?: unknown;

  constructor(code: string, message: string, options?: { cause?: unknown }) {
    super(message);
    this.name = "HardkasError";
    this.code = code;
    this.cause = options?.cause;
  }
}

export type InvariantDomain = 
  | "semantic"
  | "replay"
  | "provenance"
  | "structural"
  | "operational";

export type InvariantSeverity = "warning" | "error" | "fatal";

export class InvariantViolationError extends HardkasError {
  readonly domain: InvariantDomain;
  readonly severity: InvariantSeverity;

  constructor(
    domain: InvariantDomain, 
    message: string, 
    options?: { severity?: InvariantSeverity, cause?: unknown }
  ) {
    super(`INVARIANT_VIOLATION_${domain.toUpperCase()}`, message, { cause: options?.cause });
    this.name = "InvariantViolationError";
    this.domain = domain;
    this.severity = options?.severity || "fatal";
  }
}

export function parseHardkasConfig(input: unknown): HardkasConfig {
  const result = hardkasConfigSchema.safeParse(input);

  if (!result.success) {
    throw new HardkasError(
      "CONFIG_INVALID",
      result.error.issues.map((issue) => issue.message).join("; "),
      { cause: result.error }
    );
  }

  return result.data;
}

export function parseKasToSompi(input: string): bigint {
  const trimmed = input.trim();

  if (!/^\d+(\.\d{1,8})?$/.test(trimmed)) {
    throw new HardkasError("AMOUNT_INVALID", `Invalid KAS amount: ${input}`);
  }

  const [whole, fractional = ""] = trimmed.split(".");
  if (whole === undefined) {
    throw new HardkasError("AMOUNT_INVALID", `Invalid KAS amount: ${input}`);
  }

  return BigInt(whole) * SOMPI_PER_KAS + BigInt(fractional.padEnd(8, "0"));
}

export function formatSompi(amountSompi: bigint): string {
  const sign = amountSompi < 0n ? "-" : "";
  const absolute = amountSompi < 0n ? -amountSompi : amountSompi;

  const whole = absolute / SOMPI_PER_KAS;
  const fractional = absolute % SOMPI_PER_KAS;

  return `${sign}${whole}.${fractional.toString().padStart(8, "0")} KAS`;
}

export * from "./events.js";
export * from "./domain-types.js";
export * from "./branded.js";
export { maskSecrets, redactSecret } from "./security.js";
export * from "./fs.js";
export * from "./corruption.js";
export * from "./lock.js";
