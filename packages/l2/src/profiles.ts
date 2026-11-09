import { HARDKAS_VERSION } from "@hardkas/artifacts";

export type L2NetworkType = "evm-based-rollup";

export type L2BridgePhase = "pre-zk" | "mpc" | "zk" | "unknown";

export type L2RiskProfile = "high" | "medium" | "low" | "unknown";

/**
 * Deployment environment of an L2 network. Security decisions (mainnet guard, write policy)
 * are taken from this field and from the chain ID, never from the profile name.
 */
export type L2NetworkEnvironment = "local" | "testnet" | "mainnet" | "deprecated" | "unknown";

/** Network family; used to look up bridge assumptions independently of the profile name. */
export type L2NetworkFamily = "igra" | "evm-local" | "custom";

/**
 * How the endpoint values of a profile were established.
 * - documented: copied from the operator's public documentation (documentary check only;
 *   HardKAS has not verified the endpoint operationally).
 * - local: loopback development endpoint.
 * - user-supplied: comes from the user's config or CLI.
 * - none: the profile carries no endpoint (e.g. sunset networks).
 */
export type L2EndpointVerificationStatus = "documented" | "local" | "user-supplied" | "none";

export interface L2EndpointVerification {
  readonly status: L2EndpointVerificationStatus;
  readonly source?: string | undefined;
  readonly checkedAt?: string | undefined;
  readonly note?: string | undefined;
}

/**
 * - allowed: signing/broadcast permitted (still subject to chain binding and fee policy).
 * - requires-explicit-mainnet-authorization: a mainnet profile. MAINNET TOTAL LOCKDOWN: never signed for, broadcast to or
 *   connected to; `allowMainnet: true` / `--allow-mainnet` no longer authorize it (they have no effect).
 * - disabled: never sign or broadcast for this profile.
 */
export type L2WritePolicy = "allowed" | "requires-explicit-mainnet-authorization" | "disabled";

/**
 * Fee ceilings, as decimal strings in wei / gas units (JSON-safe).
 * A transaction whose gas limit, per-gas price or worst-case total fee exceeds these is refused.
 */
export interface L2FeePolicy {
  readonly maxGasLimit: string;
  readonly maxFeePerGasWei: string;
  readonly maxTotalFeeWei: string;
}

export interface L2SecurityAssumptions {
  readonly bridgePhase: L2BridgePhase;
  readonly trustlessExit: boolean;
  readonly custodyModel: string;
  readonly riskProfile: L2RiskProfile;
  readonly notes: readonly string[];
}

export type L2ProfileSource = "built-in" | "user-config";

export interface L2UserNetworkConfig {
  readonly kind?: "igra" | string | undefined;
  readonly chainId: number;
  readonly rpcUrl: string;
  readonly explorerUrl?: string | undefined;
  readonly environment?: L2NetworkEnvironment | undefined;
  readonly feePolicy?: L2FeePolicy | undefined;
  readonly bridgePhase?: L2BridgePhase | undefined;
  readonly trustlessExit?: boolean | undefined;
  readonly nativeCurrency?:
    | {
        readonly name?: string | undefined;
        readonly symbol?: string | undefined;
        readonly decimals?: number | undefined;
      }
    | undefined;
  readonly contracts?: Record<string, string> | undefined;
  readonly metadata?: Record<string, unknown> | undefined;
}

export interface L2NetworkProfile {
  readonly schema: "hardkas.l2Profile.v1";
  readonly hardkasVersion: string;
  readonly source: L2ProfileSource;
  readonly name: string;
  readonly displayName: string;
  readonly type: L2NetworkType;
  readonly family: L2NetworkFamily;
  readonly environment: L2NetworkEnvironment;
  readonly settlementLayer: "kaspa";
  readonly executionLayer: "evm";
  readonly gasToken: string;
  readonly nativeTokenDecimals?: number | undefined;
  readonly chainId?: number | undefined;
  readonly rpcUrl?: string | undefined;
  readonly explorerUrl?: string | undefined;
  readonly endpoint: L2EndpointVerification;
  readonly writePolicy: L2WritePolicy;
  readonly feePolicy?: L2FeePolicy | undefined;
  readonly preferredTxType?: "eip1559" | "legacy" | undefined;
  readonly rpcTimeouts?:
    | {
        /** Per JSON-RPC request timeout. */
        readonly requestTimeoutMs?: number | undefined;
        /** How long to wait for a receipt after broadcast. */
        readonly receiptTimeoutMs?: number | undefined;
        /** Receipt polling interval. */
        readonly pollIntervalMs?: number | undefined;
      }
    | undefined;
  readonly security: L2SecurityAssumptions;
}

/** Public documentation used for the documentary check of the Igra profiles (30-oct-2026). */
export const IGRA_NETWORK_INFO_SOURCE =
  "https://igra-labs.gitbook.io/igralabs-docs/quickstart/network-info";

const IGRA_DOCUMENTED: L2EndpointVerification = {
  status: "documented",
  source: IGRA_NETWORK_INFO_SOURCE,
  checkedAt: "2026-10-30",
  note: "Documentary check only: values copied from Igra's public docs. HardKAS has not verified this endpoint operationally."
};

const IGRA_COMMON_NOTES = [
  "Kaspa L1 does not execute EVM; Igra execution occurs on L2.",
  "Per Igra's design, Kaspa L1 provides sequencing and data availability. HardKAS does not verify L1 anchoring or settlement: receipts are L2 execution as reported by the RPC.",
  "Bridge security is phase-dependent (pre-ZK -> MPC -> ZK). Pre-ZK and MPC do not provide trustless exit.",
  "HardKAS performs no bridge operations."
];

export const BUILTIN_L2_PROFILES: readonly L2NetworkProfile[] = [
  {
    schema: "hardkas.l2Profile.v1",
    hardkasVersion: HARDKAS_VERSION,
    source: "built-in",
    name: "local",
    displayName: "Local EVM (Anvil)",
    type: "evm-based-rollup",
    family: "evm-local",
    environment: "local",
    settlementLayer: "kaspa",
    executionLayer: "evm",
    gasToken: "ETH",
    nativeTokenDecimals: 18,
    chainId: 31337,
    rpcUrl: "http://127.0.0.1:8545",
    endpoint: { status: "local" },
    writePolicy: "allowed",
    feePolicy: {
      maxGasLimit: "30000000",
      maxFeePerGasWei: "1000000000000", // 1000 gwei
      maxTotalFeeWei: "10000000000000000000" // 10 test ETH
    },
    preferredTxType: "eip1559",
    rpcTimeouts: { requestTimeoutMs: 10000, receiptTimeoutMs: 10000, pollIntervalMs: 50 },
    security: {
      bridgePhase: "unknown",
      trustlessExit: false,
      custodyModel: "Local development node (Anvil). No bridge, no custody.",
      riskProfile: "low",
      notes: ["Local isolated EVM testbed for HardKAS L2 development.", "Ephemeral state."]
    }
  },
  {
    schema: "hardkas.l2Profile.v1",
    hardkasVersion: HARDKAS_VERSION,
    source: "built-in",
    name: "igra-galleon",
    displayName: "Igra Galleon Testnet",
    type: "evm-based-rollup",
    family: "igra",
    environment: "testnet",
    settlementLayer: "kaspa",
    executionLayer: "evm",
    gasToken: "iKAS",
    nativeTokenDecimals: 18,
    chainId: 38836,
    rpcUrl: "https://galleon-testnet.igralabs.com:8545",
    explorerUrl: "https://explorer.galleon-testnet.igralabs.com",
    endpoint: IGRA_DOCUMENTED,
    writePolicy: "allowed",
    // No built-in fee policy: fee ceilings must be supplied explicitly before signing.
    preferredTxType: "legacy",
    rpcTimeouts: { requestTimeoutMs: 15000, receiptTimeoutMs: 30000, pollIntervalMs: 1500 },
    security: {
      bridgePhase: "pre-zk",
      trustlessExit: false,
      custodyModel: "Phase-dependent bridge custody operated outside HardKAS; verify the live phase with Igra.",
      riskProfile: "high",
      notes: ["Igra Galleon testnet (chain ID 38836).", ...IGRA_COMMON_NOTES]
    }
  },
  {
    schema: "hardkas.l2Profile.v1",
    hardkasVersion: HARDKAS_VERSION,
    source: "built-in",
    name: "igra-mainnet",
    displayName: "Igra Mainnet",
    type: "evm-based-rollup",
    family: "igra",
    environment: "mainnet",
    settlementLayer: "kaspa",
    executionLayer: "evm",
    gasToken: "iKAS",
    nativeTokenDecimals: 18,
    chainId: 38833,
    rpcUrl: "https://rpc.igralabs.com:8545",
    explorerUrl: "https://explorer.igralabs.com",
    endpoint: IGRA_DOCUMENTED,
    writePolicy: "requires-explicit-mainnet-authorization",
    // No built-in fee policy: fee ceilings must be supplied explicitly before signing.
    preferredTxType: "legacy",
    rpcTimeouts: { requestTimeoutMs: 15000, receiptTimeoutMs: 30000, pollIntervalMs: 1500 },
    security: {
      bridgePhase: "pre-zk",
      trustlessExit: false,
      custodyModel: "Phase-dependent bridge custody operated outside HardKAS; verify the live phase with Igra.",
      riskProfile: "high",
      notes: [
        "Igra MAINNET (chain ID 38833): real funds.",
        "Mainnet is locked down in HardKAS: no signing, no broadcast and no connection (reads included); allowMainnet / --allow-mainnet have no effect.",
        ...IGRA_COMMON_NOTES
      ]
    }
  },
  {
    schema: "hardkas.l2Profile.v1",
    hardkasVersion: HARDKAS_VERSION,
    source: "built-in",
    name: "igra-caravel",
    displayName: "Igra Caravel Testnet (sunset, unverified)",
    type: "evm-based-rollup",
    family: "igra",
    environment: "deprecated",
    settlementLayer: "kaspa",
    executionLayer: "evm",
    gasToken: "iKAS",
    nativeTokenDecimals: 18,
    chainId: 19416,
    endpoint: {
      status: "none",
      note: "Not listed in Igra's public network docs (30-oct-2026). Chain ID kept only for legacy fixtures; NOT VERIFIED."
    },
    writePolicy: "disabled",
    security: {
      bridgePhase: "pre-zk",
      trustlessExit: false,
      custodyModel: "Deprecated testnet.",
      riskProfile: "high",
      notes: ["Sunset network; no endpoint; signing and broadcasting are disabled."]
    }
  }
];

/**
 * Names that do not identify a single network. Resolving one of these is an error:
 * a security decision must never depend on an ambiguous name.
 */
export const AMBIGUOUS_L2_PROFILE_NAMES: Readonly<Record<string, readonly string[]>> = {
  igra: ["igra-mainnet", "igra-galleon"]
};

/** The profile used when no profile name is given. Always a local network. */
export const DEFAULT_L2_PROFILE_NAME = "local";
