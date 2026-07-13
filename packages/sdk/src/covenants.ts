import { HardkasSchemas } from "@hardkas/artifacts";
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
 * **Current limitations (0.12.0-alpha):**
 * - TX V1 signing requires kaspa-wasm V1 support (see P82)
 * - Plan/sign/send pipeline for covenants will be implemented in P84
 * - For now, capability checks and inspection are available
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
   * This is a read-only RPC operation that does not require TX V1 signing.
   *
   * @throws {Error} COVENANT_INSPECT_NOT_IMPLEMENTED — will be implemented
   *   when RPC integration for covenant queries is complete.
   */
  async inspect(covenantId: string): Promise<CovenantInfo> {
    throw new Error(
      "COVENANT_INSPECT_NOT_IMPLEMENTED: " +
      "Covenant inspection via RPC requires GetUtxosByAddresses with covenant ID filtering. " +
      "This will be implemented when the Toccata RPC surface is integrated (P84)."
    );
  }

  async planDeploy(options: CovenantDeployOptions): Promise<any> {
    const amountSompi = typeof options.amount === "bigint" ? options.amount : BigInt(options.amount);
    return this.sdk.tx.plan({
      from: options.from,
      to: options.from, // Initially deploy to self
      amount: amountSompi,
      
      ...(options.computeBudget !== undefined && { computeBudget: options.computeBudget }),
      ...(options.lane !== undefined && { lane: options.lane })
      // TODO (P84 follow-up): Inject compiled script as P2SH/P2SC output script once kaspa-wasm supports it.
    });
  }

  /**
   * Plan a covenant spend transaction.
   *
   * Creates a TX V1 plan that satisfies the covenant's spending rules.
   * The plan must be signed and broadcast separately.
   */
  async planSpend(options: CovenantSpendOptions): Promise<any> {
    const amountSompi = typeof options.amount === "bigint" ? options.amount : BigInt(options.amount);
    return this.sdk.tx.plan({
      from: options.from,
      to: options.to,
      amount: amountSompi,
      
      ...(options.computeBudget !== undefined && { computeBudget: options.computeBudget }),
      ...(options.lane !== undefined && { lane: options.lane })
      // TODO (P84 follow-up): Inject covenantId in inputs and witnessData once kaspa-wasm supports it.
    });
  }

  /**
   * Get the current state of a covenant from the UTXO set.
   *
   * @throws {Error} COVENANT_STATE_NOT_IMPLEMENTED — requires Toccata RPC integration.
   */
  async getState(covenantId: string): Promise<CovenantState> {
    throw new Error(
      "COVENANT_STATE_NOT_IMPLEMENTED: " +
      "Covenant state queries require UTXO set filtering by covenant ID. " +
      "This will be implemented when the Toccata RPC surface is integrated (P84)."
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
