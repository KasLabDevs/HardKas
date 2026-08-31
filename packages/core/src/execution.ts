import { z } from "zod";

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
