import { HARDKAS_VERSION } from "@hardkas/artifacts";
import { L2BridgePhase, L2RiskProfile } from "./profiles.js";

export interface L2BridgeAssumptions {
  readonly schema: "hardkas.l2BridgeAssumptions.v1";
  readonly hardkasVersion: string;
  readonly l2Network: string;
  readonly bridgePhase: L2BridgePhase;
  readonly trustlessExit: boolean;
  readonly custodyModel: string;
  readonly validatorModel?: string;
  readonly exitModel: string;
  readonly riskProfile: L2RiskProfile;
  readonly notes: readonly string[];
  readonly updatedAt: string;
}

const IGRA_BRIDGE_ASSUMPTIONS: L2BridgeAssumptions = {
  schema: "hardkas.l2BridgeAssumptions.v1",
  hardkasVersion: HARDKAS_VERSION,
  l2Network: "igra",
  bridgePhase: "pre-zk",
  trustlessExit: false,
  custodyModel: "Phase-dependent bridge custody; verify current bridge implementation before use.",
  validatorModel: "Phase-dependent",
  exitModel: "Trustless exit is available only in the ZK phase.",
  riskProfile: "high",
  notes: [
    "Bridge security is phase-dependent: pre-ZK -> MPC -> ZK.",
    "pre-ZK implies stronger trust assumptions.",
    "MPC implies threshold committee trust assumptions.",
    "ZK phase enables validity-proof based trustless exit.",
    "HardKAS does not perform bridge operations in v0.2-alpha."
  ],
  updatedAt: "2026-05-07T00:00:00Z" // Reference date for Phase 33
};

const BRIDGE_ASSUMPTIONS_REGISTRY: L2BridgeAssumptions[] = [
  IGRA_BRIDGE_ASSUMPTIONS
];

export function getL2BridgeAssumptions(network: string): L2BridgeAssumptions | null {
  return BRIDGE_ASSUMPTIONS_REGISTRY.find(a => a.l2Network === network) || null;
}

export function listL2BridgeAssumptions(): readonly L2BridgeAssumptions[] {
  return BRIDGE_ASSUMPTIONS_REGISTRY;
}

export function validateL2BridgeAssumptions(input: unknown): { ok: boolean; errors: string[] } {
  const errors: string[] = [];
  if (!input || typeof input !== "object") return { ok: false, errors: ["Input must be an object"] };
  const v = input as any;

  if (v.schema !== "hardkas.l2BridgeAssumptions.v1") errors.push("Invalid schema: expected 'hardkas.l2BridgeAssumptions.v1'");
  if (typeof v.hardkasVersion !== "string" || !v.hardkasVersion) errors.push("Missing hardkasVersion");
  if (typeof v.l2Network !== "string" || !v.l2Network) errors.push("Missing l2Network");
  
  const validPhases: L2BridgePhase[] = ["pre-zk", "mpc", "zk", "unknown"];
  if (!validPhases.includes(v.bridgePhase)) errors.push(`Invalid bridgePhase: ${v.bridgePhase}`);

  if (v.bridgePhase !== "zk" && v.trustlessExit === true) {
    errors.push("trustlessExit must be false if bridgePhase is not 'zk'");
  }

  if (!Array.isArray(v.notes) || v.notes.length === 0) errors.push("Notes must be a non-empty array");
  if (!v.updatedAt) errors.push("Missing updatedAt");

  return { ok: errors.length === 0, errors };
}

export function assertValidL2BridgeAssumptions(input: unknown): L2BridgeAssumptions {
  const { ok, errors } = validateL2BridgeAssumptions(input);
  if (!ok) {
    throw new Error(`Invalid L2 bridge assumptions:\n${errors.map(e => `- ${e}`).join("\n")}`);
  }
  return input as L2BridgeAssumptions;
}
