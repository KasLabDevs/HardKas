import { HardkasSchemas } from "@hardkas/artifacts";
import { HardkasError } from "@hardkas/core";
import type { Hardkas } from "./index.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Information about a covenant on the Kaspa L1 network.
 * Covenants are protocol-native spending rules enforced at consensus (KIP-17/KIP-20).
 */
export interface CovenantInfo {
  covenantId: string;
  /** Number of UTXOs carrying this covenant ID */
  utxoCount?: number;
  /** Whether the covenant is active (has unspent outputs) */
  active: boolean;
}

/**
 * Options for planning a covenant deployment transaction.
 * Deployment creates UTXO outputs with covenant spending rules attached.
 */
export interface CovenantDeployOptions {
  /** The compiled covenant script (e.g., from SilverScript compiler) */
  script: string | Uint8Array;
  /** Initial funding amount in sompi */
  amount: bigint;
  /** From account alias or address */
  from: string;
  /** Optional KIP-21 lane identifier */
  lane?: string;
  /** Optional compute budget for the deployment transaction */
  computeBudget?: bigint;
}

/**
 * Options for planning a covenant spend transaction.
 * Spending requires satisfying the covenant's spending rules.
 */
export interface CovenantSpendOptions {
  /** The covenant ID (32-byte hex) to spend from */
  covenantId: string;
  /** Recipient address */
  to: string;
  /** Amount in sompi */
  amount: bigint;
  /** From account alias or address */
  from: string;
  /** Optional KIP-21 lane identifier */
  lane?: string;
  /** Optional compute budget */
  computeBudget?: bigint;
  /** Additional data required to satisfy the covenant spending rules */
  witnessData?: Uint8Array;
}

/**
 * State of a covenant derived from the UTXO set.
 */
export interface CovenantState {
  covenantId: string;
  /** Total value locked in the covenant (sompi) */
  totalValueLocked: bigint;
  /** Number of UTXOs belonging to this covenant */
  utxoCount: number;
  /** Whether the covenant has any unspent outputs */
  active: boolean;
}

/**
 * Result of a covenant capability check.
 */
export interface CovenantCapabilityResult {
  /** Whether the connected node supports covenants (Toccata-enabled) */
  nodeSupportsCovenants: boolean;
  /** Whether kaspa-wasm can sign TX V1 (required for covenant transactions) */
  wasmSupportsV1Signing: boolean;
  /** Whether the full covenant lifecycle is operational */
  fullyOperational: boolean;
  /** Human-readable status */
  status: "READY" | "NODE_MISSING_SUPPORT" | "WASM_V1_BLOCKED" | "BLOCKED_BY_DEPENDENCY";
  /** Reason if not fully operational */
  reason?: string;
}

// Re-export the artifact type for backward compatibility with code that
// imported CovenantArtifact from toccata.ts
export interface CovenantArtifact {
  schema: typeof HardkasSchemas.CovenantV1;
  scriptHash: string;
  userLane?: string;
  computeBudget?: number;
  covenant?: string;
  networkId: string;
  /** @deprecated Covenants are Kaspa L1 core since Toccata mainnet activation (June 30, 2026). */
  isExperimental?: boolean;
}

// ---------------------------------------------------------------------------
// Core Implementation
// ---------------------------------------------------------------------------

/**
 * HardKAS Covenants — Kaspa L1 Core
 *
 * Provides the covenant lifecycle interface for Kaspa L1 post-Toccata.
 * Covenants are protocol-native, recursive spending rules embedded in UTXOs,
 * enforced at the consensus layer (KIP-17, KIP-20).
 *
 * This is NOT experimental — covenants are live on Kaspa mainnet since
 * DAA score 474,165,565 (June 30, 2026).
 *
 * **Current limitations:**
 * - The SDK does not plan, inspect or query covenants yet: `planDeploy()`, `planSpend()`, `inspect()` and
 *   `getState()` refuse with a typed error (SURFACE-TRUTH-1A). They never fall back to an ordinary payment.
 * - Real 1:1 auth-bound covenant transactions are built by `hardkas silver covenant genesis|transition`
 *   (`@hardkas/accounts` `buildCovenantGenesis` / `buildCovenantTransition`).
 *
 * @see https://github.com/kaspanet/rusty-kaspa/blob/master/docs/toccata-guide.md
 */
export class HardkasCovenants {
  constructor(private sdk: Hardkas) {}

  /**
   * Check whether the runtime environment supports covenants.
   *
   * Checks:
   * 1. Connected node is Toccata-enabled (supports TX V1)
   * 2. kaspa-wasm can sign TX V1 transactions
   */
  async checkCapabilities(): Promise<CovenantCapabilityResult> {
    // Phase 1 (P81): Return honest "blocked" status.
    // Phase 2 (P82): Will probe kaspa-wasm for V1 signing.
    // Phase 3 (P84): Will return READY when full pipeline works.
    return {
      nodeSupportsCovenants: false,
      wasmSupportsV1Signing: false,
      fullyOperational: false,
      status: "BLOCKED_BY_DEPENDENCY",
      reason:
        "TX V1 signing support has not been verified yet. " +
        "Run the P82 kaspa-wasm capability probe to determine V1 readiness."
    };
  }

  /**
   * Check if the connected node supports covenants (convenience shorthand).
   */
  async isSupported(): Promise<boolean> {
    const caps = await this.checkCapabilities();
    return caps.fullyOperational;
  }

  /**
   * Inspect a covenant by its 32-byte covenant ID.
   *
   * @throws {HardkasError} COVENANT_INSPECT_UNSUPPORTED — the SDK has no covenant query over RPC yet.
   */
  async inspect(covenantId: string): Promise<CovenantInfo> {
    throw new HardkasError(
      "COVENANT_INSPECT_UNSUPPORTED",
      "Covenant inspection is not supported by the SDK: it needs UTXO queries filtered by covenant id, which the SDK does not have.",
      { metadata: { covenantId } }
    );
  }

  /**
   * Plan a covenant deployment.
   *
   * SURFACE-TRUTH-1A (ST-I3): refused until the SDK plans real v1 covenant transactions. The former body planned an
   * ordinary self-payment and dropped the script, which signed and sent like any payment.
   *
   * @throws {HardkasError} COVENANT_PLAN_UNSUPPORTED
   */
  async planDeploy(options: CovenantDeployOptions): Promise<any> {
    throw new HardkasError(
      "COVENANT_PLAN_UNSUPPORTED",
      "Covenant deployment planning is not supported by the SDK: it cannot carry a covenant script into a v1 plan, and it never substitutes an ordinary payment. Build real covenant transactions with `hardkas silver covenant genesis`.",
      { metadata: { from: options.from } }
    );
  }

  /**
   * Plan a covenant spend.
   *
   * SURFACE-TRUTH-1A (ST-I3): refused until the SDK plans real v1 covenant transactions. The former body planned an
   * ordinary payment to `to` and dropped the covenant id and the witness data.
   *
   * @throws {HardkasError} COVENANT_PLAN_UNSUPPORTED
   */
  async planSpend(options: CovenantSpendOptions): Promise<any> {
    throw new HardkasError(
      "COVENANT_PLAN_UNSUPPORTED",
      "Covenant spend planning is not supported by the SDK: it cannot carry the covenant id and witness data into a v1 plan, and it never substitutes an ordinary payment. Advance covenants with `hardkas silver covenant transition`.",
      { metadata: { covenantId: options.covenantId, from: options.from } }
    );
  }

  /**
   * Get the current state of a covenant from the UTXO set.
   *
   * @throws {HardkasError} COVENANT_STATE_UNSUPPORTED — the SDK has no covenant query over RPC yet.
   */
  async getState(covenantId: string): Promise<CovenantState> {
    throw new HardkasError(
      "COVENANT_STATE_UNSUPPORTED",
      "Covenant state queries are not supported by the SDK: they need UTXO queries filtered by covenant id, which the SDK does not have.",
      { metadata: { covenantId } }
    );
  }

  /**
   * Build a covenant artifact (legacy compatibility).
   *
   * @deprecated Use `planDeploy()` instead. This method exists for backward
   * compatibility with code that used `hardkas.experimental.toccata.buildCovenant()`.
   */
  async buildCovenant(options: {
    scriptHash: string;
    userLane?: string;
    computeBudget?: number;
    covenant?: string;
  }): Promise<CovenantArtifact> {
    const result: CovenantArtifact = {
      schema: HardkasSchemas.CovenantV1,
      scriptHash: options.scriptHash,
      networkId: this.sdk.network as string,
      isExperimental: false // Covenants are L1 core now
    };
    if (options.userLane !== undefined) result.userLane = options.userLane;
    if (options.computeBudget !== undefined) result.computeBudget = options.computeBudget;
    if (options.covenant !== undefined) result.covenant = options.covenant;

    return result;
  }
}
