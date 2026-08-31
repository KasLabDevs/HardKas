import type { HardkasExecutionTarget } from "../index.js";

export type ExecutionCompatibility =
  | "identical"
  | "compatible"
  | "incompatible"
  | "undefined";

export type ExecutionOperation = 
  | "fund" 
  | "plan" 
  | "sign" 
  | "simulate" 
  | "send" 
  | "replay" 
  | "dev-reveal" 
  | "dev-export"
  | "workflow"
  | "artifact.verify"
  | "account.resolve";

export function classifyExecutionCompatibility(
  artifact: HardkasExecutionTarget,
  runtime: HardkasExecutionTarget,
  capability?: ExecutionOperation
): ExecutionCompatibility {
  if (artifact.domain !== runtime.domain) {
    return "incompatible";
  }

  if (artifact.network !== runtime.network) {
    return "incompatible";
  }

  if (artifact.mode === runtime.mode) {
    return "identical";
  }

  if (artifact.mode === "simulator" || runtime.mode === "simulator") {
    return "incompatible";
  }

  if (
    (artifact.mode === "localnet" && runtime.mode === "rpc") ||
    (artifact.mode === "rpc" && runtime.mode === "localnet")
  ) {
    if (!capability) {
      return "undefined";
    }
    
    // Explicit capability matrix for localnet <-> rpc
    switch (capability) {
      case "send":
      case "account.resolve":
        return "compatible";
      case "workflow":
      case "plan":
      case "sign":
      case "dev-export":
      case "dev-reveal":
      case "fund":
      case "simulate":
      case "artifact.verify":
      case "replay":
        return "undefined";
    }
  }

  return "undefined";
}
