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
  "devnet",
  "simulated",
  "igra"
]);

export type NetworkId = Brand<z.infer<typeof kaspaNetworkIdSchema>, "NetworkId">;

export function getCoinbaseMaturity(networkId?: string, overrideParams?: { coinbaseMaturity?: bigint | number }): bigint {
  if (overrideParams?.coinbaseMaturity !== undefined) {
    return BigInt(overrideParams.coinbaseMaturity);
  }
  
  if (networkId === "mainnet") return 244n;
  if (networkId === "testnet-10" || networkId === "testnet-11" || networkId === "testnet-12") return 100n;
  if (networkId && networkId.startsWith("simnet")) return 1000n;
  if (networkId === "devnet" || networkId === "simulated") return 100n;
  
  const e = new Error(`COINBASE_MATURITY_UNRESOLVED: Cannot resolve canonical coinbase maturity for network: ${networkId || "unknown"}. Provide an explicit override.`);
  (e as any).code = "COINBASE_MATURITY_UNRESOLVED";
  throw e;
}

export const executionModeSchema = z.enum(["simulator", "localnet", "rpc"]);
export type ExecutionMode = z.infer<typeof executionModeSchema>;

export const executionDomainSchema = z.enum(["kaspa-l1", "evm-l2"]);
export type ExecutionDomain = z.infer<typeof executionDomainSchema>;

export const hardkasExecutionTargetSchema = z.object({
  mode: executionModeSchema,
  domain: executionDomainSchema,
  network: z.string(),
});
export type HardkasExecutionTarget = z.infer<typeof hardkasExecutionTargetSchema>;

export const artifactTypeSchema = z.enum([
  "txPlan",
  "signedTx",
  "txReceipt",
  "txPlan.v2",
  "signedTx.v2",
  "txReceipt.v2",
  "txTrace",
  "snapshot.v1",
  "workflow.v1",
  "policy.v1",
  "networkProfile.v1",
  "assumption.v1",
  "migrationReceipt.v1",
  "silver.compile",
  "silver.test",
  "silver.spendPlan",
  "silver.deployPlan",
  "silver.deploy",
  "silver.spendReceipt",
  "silver.deploySimulation",
  "silver.spendSimulation"
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
      mode: z.enum(["simulator", "local-node"]).default("simulator"),
      dataDir: z.string().optional()
    })
    .default({ mode: "simulator" })
});

export type HardkasConfig = z.infer<typeof hardkasConfigSchema>;

import { HardkasError } from "./errors.js";
export * from "./errors.js";

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

export * from "./money.js";

export * from "./events.js";
export * from "./domain-types.js";
export * from "./branded.js";
export { maskSecrets, redactSecret } from "./security.js";
export * from "./fs.js";
export * from "./corruption.js";
export { task, TaskBuilder, types } from "./tasks.js";
export type { TaskDefinition } from "./tasks.js";
export * from "./plugins.js";
export * from "./provenance.js";
export * from "./lock.js";
export * from "./replay.js";
export * from "./snapshot.js";
export * from "./deterministic.js";
export * from "./retention.js";
export * from "./telemetry.js";
export { TelemetryRotator } from "./retention.js";
export * from "./runtime-context.js";
export * from "./semantics/index.js";
export * from "./append-coordinator.js";
export * from "./migrations.js";
export * from "./silver.js";

export * from "./registry.js";
export * from "./confirmation-policy.js";
export * from "./pskt.js";
export * from "./pskt-adapter.js";
export * from "./pskt-errors.js";

export * from "./utxo-errors.js";
export * from "./utxo-utils.js";

