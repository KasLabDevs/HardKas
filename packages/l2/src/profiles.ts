import { ARTIFACT_SCHEMAS, HARDKAS_VERSION } from "@hardkas/artifacts";

export type L2NetworkType = "evm-based-rollup";

export type L2BridgePhase = "pre-zk" | "mpc" | "zk" | "unknown";

export type L2RiskProfile = "high" | "medium" | "low" | "unknown";

export interface L2SecurityAssumptions {
  readonly bridgePhase: L2BridgePhase;
  readonly trustlessExit: boolean;
  readonly custodyModel: string;
  readonly riskProfile: L2RiskProfile;
  readonly notes: readonly string[];
}

export type L2ProfileSource = "built-in" | "user-config";

export interface L2UserNetworkConfig {
  readonly kind?: "igra" | string;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly explorerUrl?: string;
  readonly bridgePhase?: L2BridgePhase;
  readonly trustlessExit?: boolean;
  readonly nativeCurrency?: {
    readonly name?: string;
    readonly symbol?: string;
    readonly decimals?: number;
  };
  readonly contracts?: Record<string, string>;
  readonly metadata?: Record<string, unknown>;
}

export interface L2NetworkProfile {
  readonly schema: "hardkas.l2Profile.v1";
  readonly hardkasVersion: string;
  readonly source: L2ProfileSource;
  readonly name: string;
  readonly displayName: string;
  readonly type: L2NetworkType;
  readonly settlementLayer: "kaspa";
  readonly executionLayer: "evm";
  readonly gasToken: string;
  readonly nativeTokenDecimals?: number;
  readonly chainId?: number;
  readonly rpcUrl?: string;
  readonly explorerUrl?: string;
  readonly security: L2SecurityAssumptions;
}

export const BUILTIN_L2_PROFILES: readonly L2NetworkProfile[] = [
  {
    schema: "hardkas.l2Profile.v1",
    hardkasVersion: HARDKAS_VERSION,
    source: "built-in",
    name: "igra",
    displayName: "Igra",
    type: "evm-based-rollup",
    settlementLayer: "kaspa",
    executionLayer: "evm",
    gasToken: "iKAS",
    nativeTokenDecimals: 18,
    security: {
      bridgePhase: "pre-zk",
      trustlessExit: false,
      custodyModel: "Phase-dependent bridge custody; verify live Igra bridge phase before use.",
      riskProfile: "high",
      notes: [
        "Kaspa L1 does not execute EVM.",
        "Igra execution occurs on L2.",
        "Kaspa L1 provides sequencing, data availability, state commitment anchoring and finality.",
        "Bridge security is phase-dependent: pre-ZK -> MPC -> ZK.",
        "Trustless exit exists only in the ZK phase."
      ]
    }
  }
];
