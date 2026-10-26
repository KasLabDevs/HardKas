import { HardkasSchemas, createV1TxPlanArtifact, decodeKaspaAddress } from "@hardkas/artifacts";
import { HardkasError, declaredNetworkIdOf, loadManagedKaspaWasmSync, systemRuntimeContext } from "@hardkas/core";
import {
  buildV1Transaction,
  checkV1Plan,
  createWorkspaceV1Facts,
  resolveAccountPrivateKey,
  resolveHardkasAccount,
  resolveV1PlanFacts,
  v1ArgToSil,
  v1ContractFactsAtState,
  v1NodeUtxoOf,
  validateV1Transition,
  type V1ContractFacts,
  type V1EngineFacts,
  type V1EngineNode,
  type V1KeyResolver
} from "@hardkas/accounts";
import {
  observePendingSpends,
  proposeComputeBudget,
  selectV1FeeInputs,
  v1StorageMass,
  type V1ArgValue,
  type V1CompiledContract,
  type V1ContractRef,
  type V1FeeCoin,
  type V1PlanBody
} from "@hardkas/tx-builder";
import type { Hardkas } from "./index.js";
import type { SendTxOptions } from "./tx.js";

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
  /** Whether the canonical node proved its identity (the pinned Toccata reference node); false when none was observed */
  nodeSupportsCovenants: boolean;
  /** Whether kaspa-wasm can sign TX V1 (required for covenant transactions) */
  wasmSupportsV1Signing: boolean;
  /** Whether covenant transactions can be built and submitted here (`capabilities.get().capabilities.covenants`) */
  fullyOperational: boolean;
  /**
   * Human-readable status. `NODE_UNVERIFIED`: the toolchains are ready but no node proved its identity (none observed,
   * or not the canonical one). `NODE_MISSING_SUPPORT` is not produced by this build: it never observes a node that
   * lacks Toccata.
   */
  status: "READY" | "NODE_MISSING_SUPPORT" | "NODE_UNVERIFIED" | "WASM_V1_BLOCKED" | "BLOCKED_BY_DEPENDENCY";
  /** Reason if not fully operational */
  reason?: string;
}

/** Phase 3 · a covenant genesis: the contract (its compile record), the outputs it starts, the account that funds them. */
export interface CovenantGenesisOptions {
  /** The compile record (contentHash, artifactSha256, optional path in the workspace), the contract and its constructor args. */
  readonly contract: V1CompiledContract;
  /** The covenant outputs, in order; each holds the record's own state unless `state` is given. */
  readonly outputs: ReadonlyArray<{ readonly amountSompi: bigint; readonly state?: Readonly<Record<string, V1ArgValue>> | undefined }>;
  /** The funder: an account name or its P2PK address. Its coins pay the outputs and the fee; it gets the change. */
  readonly funder: string;
  /** At least the node's floor; the floor when omitted. */
  readonly feeSompi?: bigint | undefined;
  /** The plan's fee limit (default: the fee it pays). */
  readonly maxFeeSompi?: bigint | undefined;
}

/** Phase 3 · a covenant transition (1:1, 1:N, N:M with leader and delegates, termination with no continuation). */
export interface CovenantTransitionOptions {
  readonly covenantId: string;
  /** The covenant's inputs, in order (binding cov: the leader first). Each names its contract entry, args and state. */
  readonly inputs: ReadonlyArray<{ readonly outpoint: { readonly transactionId: string; readonly index: number }; readonly contract: V1ContractRef; readonly computeBudget?: number | undefined }>;
  /** The continuations, in output order (output k ↔ new state k), each the template holding its state. None: termination. */
  readonly continuations: ReadonlyArray<{ readonly amountSompi: bigint; readonly state: Readonly<Record<string, V1ArgValue>> }>;
  /** Declared payments (e.g. the value of a covenant that ends). */
  readonly payments?: ReadonlyArray<{ readonly address: string; readonly amountSompi: bigint }> | undefined;
  /** Who pays the fee: a funder account (its P2PK coins; the covenant keeps its value). Omitted: the covenant's value. */
  readonly funder?: string | undefined;
  readonly feeSompi?: bigint | undefined;
  readonly maxFeeSompi?: bigint | undefined;
}

export interface CovenantSignOptions {
  /** Where the contract facts come from (default: this workspace's compile records and the pinned silverc). */
  readonly facts?: V1EngineFacts | undefined;
  /** The keystore password of encrypted accounts this transaction signs with (development accounts need none). */
  readonly keystorePassword?: string | undefined;
  /** Library use: a key resolver of your own (default: this workspace's accounts). */
  readonly keys?: V1KeyResolver | undefined;
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
 * **The v1 engine (phase 3):** `planGenesis`, `planTransition`, `planContractDeploy` and `planContractSpend` plan v1
 * transactions (sealed and stored in the workspace); `check` runs the engine's validation (F1.4) without any private
 * key; `sign` signs with the engine; `send` is `sdk.tx.send` (F1.6). `hardkas silver engine` drives the same methods.
 *
 * **Current limitations:**
 * - `planDeploy()` and `planSpend()` (the script/witness forms), `inspect()` and `getState()` refuse with a typed error
 *   (SURFACE-TRUTH-1A). They never fall back to an ordinary payment.
 * - The engine's validation checks templates, bindings, lineage, entries, budgets and fees, not what a covenant's policy
 *   computes: the node executes the scripts, and a transition the policy rejects is the node's final rejection.
 *
 * @see https://github.com/kaspanet/rusty-kaspa/blob/master/docs/toccata-guide.md
 */
export class HardkasCovenants {
  constructor(private sdk: Hardkas) {}

  /**
   * Check whether covenant transactions can be built and submitted in this environment.
   *
   * SURFACE-TRUTH-1B (D-ST1): read from `sdk.capabilities` (one authority, the checks `hardkas silver doctor` reports):
   * 1. the managed silverc resolves;
   * 2. the managed kaspa-wasm is verified and signs TX V1;
   * 3. the canonical node proves its identity (the pinned Toccata reference node). A node that was not observed is
   *    never reported as covenant-capable.
   *
   * The v1 engine methods of this class (`planGenesis`, `planTransition`, …) need these same three.
   */
  async checkCapabilities(): Promise<CovenantCapabilityResult> {
    const caps = await this.sdk.capabilities.get();
    const readiness = await this.sdk.capabilities.silverReadiness();
    const wasmSupportsV1Signing = caps.runtimeMatrix?.wasm.signingV1 === true;
    const fullyOperational = caps.capabilities.covenants;
    const status: CovenantCapabilityResult["status"] = fullyOperational
      ? "READY"
      : !readiness.toolchains.silverc.ok
        ? "BLOCKED_BY_DEPENDENCY"
        : !readiness.toolchains["kaspa-wasm"].ok || !wasmSupportsV1Signing
          ? "WASM_V1_BLOCKED"
          : "NODE_UNVERIFIED";
    return {
      nodeSupportsCovenants: caps.runtimeMatrix?.node.covenants === true,
      wasmSupportsV1Signing,
      fullyOperational,
      status,
      ...(fullyOperational ? {} : { reason: caps.reasons?.covenants ?? "covenants are not ready here" })
    };
  }

  /**
   * Whether covenant transactions can be built and submitted here: the same answer as
   * `capabilities.get().capabilities.covenants` and `checkCapabilities().fullyOperational`.
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
   * @deprecated Legacy compatibility only, for code that used `hardkas.experimental.toccata.buildCovenant()`. The SDK
   * plans no covenant deployment (`planDeploy()` refuses with COVENANT_PLAN_UNSUPPORTED); create covenants with
   * `hardkas silver covenant genesis`.
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

  // -------------------------------------------------------------------------------------------------------------------
  // Phase 3 · the v1 engine from the SDK: plan (sealed and stored), sign (F1.4 before any key, F1.5), send (F1.6). The CLI
  // and the SDK call the same engine and the same send, so one operation gives the same artifacts by either way.
  // -------------------------------------------------------------------------------------------------------------------

  /** A v1 plan body sealed as a TxPlan artifact (its shape checked) and stored in the workspace. */
  async plan(input: {
    readonly body: V1PlanBody;
    readonly from: { readonly address: string; readonly input?: string | undefined };
    readonly to?: { readonly address: string; readonly input?: string | undefined } | undefined;
    readonly amountSompi?: bigint | undefined;
    readonly purpose?: string | undefined;
  }): Promise<any> {
    const first = input.body.outputs[0]!;
    const plan = createV1TxPlanArtifact({
      networkId: this.networkId() as any,
      mode: this.sdk.execution.mode as any,
      from: { input: input.from.input ?? input.from.address, address: input.from.address },
      to: { input: input.to?.input ?? input.to?.address ?? first.address, address: input.to?.address ?? first.address },
      amountSompi: input.amountSompi ?? BigInt(first.amountSompi),
      body: input.body,
      ctx: systemRuntimeContext,
      ...(input.purpose ? { purpose: input.purpose } : {})
    });
    await this.sdk.artifacts.write(plan as any);
    return plan;
  }

  /**
   * A covenant genesis plan: the funder's coins (F1.7: mature, no covenant id, not pending; largest first) pay the
   * covenant outputs and the fee, the change goes back to it. The fee is the node's floor (F1.2, measured on this very
   * transaction) unless a larger one is given.
   */
  async planGenesis(options: CovenantGenesisOptions, sign: CovenantSignOptions = {}): Promise<any> {
    const funder = this.funderAddress(options.funder);
    const facts = sign.facts ?? this.workspaceFacts();
    const base = await facts.contract(options.contract as any);
    const outputs = options.outputs.map((o) => ({ address: this.addressOf(o.state ? v1ContractFactsAtState(base, this.sil(o.state)) : base), amountSompi: o.amountSompi }));
    const total = outputs.reduce((s, o) => s + o.amountSompi, 0n);
    const states = options.outputs.every((o) => o.state !== undefined) ? { states: options.outputs.map((o) => o.state!) } : options.outputs.some((o) => o.state !== undefined) ? undefined : {};
    if (states === undefined) throw new HardkasError("V1_PLAN_INVALID", "a genesis gives every output a state, or none (each then holds the record's own)");
    const p2pkBudget = proposeComputeBudget({ kind: "p2pk" })!.budget;
    const build = (coins: readonly V1FeeCoin[], fee: bigint): V1PlanBody => {
      const inputs = coins.map((c) => this.p2pkInput(c, funder, options.funder, p2pkBudget));
      const change = coins.reduce((s, c) => s + c.amountSompi, 0n) - total - fee;
      const outs: any[] = outputs.map((o) => ({ address: o.address, amountSompi: String(o.amountSompi) }));
      if (change > 0n) outs.push({ address: funder, amountSompi: String(change), role: "change" });
      return this.bodyOf(inputs, outs, fee, options.maxFeeSompi, {
        genesisCovenantGroups: [{ authorizingInput: 0, outputs: outputs.map((_, i) => i), contract: options.contract, ...states }]
      });
    };
    const body = await this.withFloor(funder, total, options.feeSompi, build, facts);
    return this.plan({ body, from: { address: funder, input: options.funder }, purpose: `covenant genesis of ${options.contract.contract}` });
  }

  /**
   * A covenant transition plan: its inputs as the node lists them (amount, covenant id), the continuations the
   * contract's template holding their states (encoded, silverscript-abi), declared payments, and the fee from the funder's
   * coins (the covenant keeps its value) or from the covenant's value. Compute budgets: given, or certified (F1.8); else
   * V1_COMPUTE_BUDGET_REQUIRED.
   */
  async planTransition(options: CovenantTransitionOptions, sign: CovenantSignOptions = {}): Promise<any> {
    const facts = sign.facts ?? this.workspaceFacts();
    const covenantId = options.covenantId.toLowerCase();
    const inputs: any[] = [];
    let leaderFacts: V1ContractFacts | undefined;
    for (const [i, input] of options.inputs.entries()) {
      const base = await facts.contract(input.contract as any);
      const at = input.contract.state ? v1ContractFactsAtState(base, this.sil(input.contract.state)) : base;
      if (i === 0) leaderFacts = at;
      const address = this.addressOf(at);
      const listed = await this.listed(address);
      const key = `${input.outpoint.transactionId.toLowerCase()}:${input.outpoint.index}`;
      const utxo = listed.get(key);
      if (!utxo) throw new HardkasError("INPUT_NOT_UNSPENT", `input ${i} (${key}) is not listed unspent at ${address} (the contract holding the state the plan names)`);
      if (utxo.covenantId !== covenantId) throw new HardkasError("INPUT_DIFFERS_FROM_NODE", `input ${i} (${key}) carries covenant ${utxo.covenantId ?? "none"} at the node, not ${covenantId}`);
      const budget =
        input.computeBudget ?? proposeComputeBudget({ kind: "covenant", templateHash: at.templateHash, entry: input.contract.entry })?.budget;
      if (budget === undefined) {
        throw new HardkasError(
          "V1_COMPUTE_BUDGET_REQUIRED",
          `input ${i}: no certified compute budget for '${at.contractName}' entry '${input.contract.entry}'; give computeBudget (there is no estimator; the budget is never raised after a rejection)`
        );
      }
      inputs.push({
        outpoint: { transactionId: input.outpoint.transactionId.toLowerCase(), index: input.outpoint.index },
        amountSompi: String(utxo.amountSompi),
        address,
        scriptPublicKey: utxo.scriptPublicKey,
        ...(utxo.blockDaaScore !== undefined ? { blockDaaScore: String(utxo.blockDaaScore) } : {}),
        covenantId,
        kind: "covenant",
        computeBudget: budget,
        contract: input.contract
      });
    }
    const continuations = options.continuations.map((c) => ({
      address: this.addressOf(v1ContractFactsAtState(leaderFacts!, this.sil(c.state))),
      amountSompi: String(c.amountSompi),
      covenant: { authorizingInput: 0, covenantId }
    }));
    const payments = (options.payments ?? []).map((p) => ({ address: p.address, amountSompi: String(p.amountSompi), role: "payment" as const }));
    const nextState = [{ covenantId, input: 0, outputs: continuations.map((_, k) => k), states: options.continuations.map((c) => c.state) }];
    const covenantIn = inputs.reduce((s, i) => s + BigInt(i.amountSompi), 0n);
    const out = [...continuations, ...payments].reduce((s, o) => s + BigInt(o.amountSompi), 0n);
    const from = options.funder ? this.funderAddress(options.funder) : (inputs[0]!.address as string);
    if (!options.funder) {
      // the covenant's value pays: the fee is what the outputs leave
      const fee = covenantIn - out;
      const body = this.bodyOf(inputs, [...continuations, ...payments], fee, options.maxFeeSompi, { nextState });
      const floor = await this.floorOf(body, from, facts);
      if (fee < floor) throw new HardkasError("FEE_BELOW_V1_FLOOR", `the covenant's inputs leave ${fee} sompi for the fee; the node's floor for this transaction is ${floor}`, { metadata: { feeSompi: String(fee), floorSompi: String(floor) } });
      return this.plan({ body, from: { address: from }, purpose: "covenant transition" });
    }
    const p2pkBudget = proposeComputeBudget({ kind: "p2pk" })!.budget;
    const build = (coins: readonly V1FeeCoin[], fee: bigint): V1PlanBody => {
      const feeInputs = coins.map((c) => this.p2pkInput(c, from, options.funder!, p2pkBudget));
      const change = covenantIn + coins.reduce((s, c) => s + c.amountSompi, 0n) - out - fee;
      const outs: any[] = [...continuations, ...payments];
      if (change > 0n) outs.push({ address: from, amountSompi: String(change), role: "change" });
      return this.bodyOf([...inputs, ...feeInputs], outs, fee, options.maxFeeSompi, { nextState });
    };
    const body = await this.withFloor(from, out - covenantIn > 0n ? out - covenantIn : 0n, options.feeSompi, build, facts);
    return this.plan({ body, from: { address: from, input: options.funder }, purpose: "covenant transition (fee from the funder)" });
  }

  /**
   * A contract deployment (no covenant): the funder's coins pay the contract's P2SH output (the record's own state, or
   * `state`) and the fee; the change goes back to the funder.
   */
  async planContractDeploy(
    options: { readonly contract: V1CompiledContract; readonly amountSompi: bigint; readonly state?: Readonly<Record<string, V1ArgValue>> | undefined; readonly funder: string; readonly feeSompi?: bigint | undefined; readonly maxFeeSompi?: bigint | undefined },
    sign: CovenantSignOptions = {}
  ): Promise<any> {
    const funder = this.funderAddress(options.funder);
    const facts = sign.facts ?? this.workspaceFacts();
    const base = await facts.contract(options.contract as any);
    const address = this.addressOf(options.state ? v1ContractFactsAtState(base, this.sil(options.state)) : base);
    const p2pkBudget = proposeComputeBudget({ kind: "p2pk" })!.budget;
    const build = (coins: readonly V1FeeCoin[], fee: bigint): V1PlanBody => {
      const change = coins.reduce((s, c) => s + c.amountSompi, 0n) - options.amountSompi - fee;
      const outs: any[] = [{ address, amountSompi: String(options.amountSompi), role: "payment" }];
      if (change > 0n) outs.push({ address: funder, amountSompi: String(change), role: "change" });
      return this.bodyOf(coins.map((c) => this.p2pkInput(c, funder, options.funder, p2pkBudget)), outs, fee, options.maxFeeSompi, {});
    };
    const body = await this.withFloor(funder, options.amountSompi, options.feeSompi, build, facts);
    return this.plan({ body, from: { address: funder, input: options.funder }, purpose: `deploy of ${options.contract.contract}` });
  }

  /**
   * A contract spend (P2SH, no covenant): the input as the node lists it, the entry and its arguments (signer slots
   * filled at signing), the declared payments; the fee is what the payments leave (at least the node's floor).
   */
  async planContractSpend(
    options: {
      readonly outpoint: { readonly transactionId: string; readonly index: number };
      readonly contract: V1ContractRef;
      readonly payments: ReadonlyArray<{ readonly address: string; readonly amountSompi: bigint }>;
      readonly computeBudget?: number | undefined;
      readonly maxFeeSompi?: bigint | undefined;
    },
    sign: CovenantSignOptions = {}
  ): Promise<any> {
    const facts = sign.facts ?? this.workspaceFacts();
    const base = await facts.contract(options.contract as any);
    const at = options.contract.state ? v1ContractFactsAtState(base, this.sil(options.contract.state)) : base;
    const address = this.addressOf(at);
    const key = `${options.outpoint.transactionId.toLowerCase()}:${options.outpoint.index}`;
    const utxo = (await this.listed(address)).get(key);
    if (!utxo) throw new HardkasError("INPUT_NOT_UNSPENT", `${key} is not listed unspent at ${address}`);
    if (utxo.covenantId !== undefined) throw new HardkasError("COVENANT_INPUT_UNDECLARED", `${key} belongs to covenant ${utxo.covenantId}: it moves through a covenant transition`);
    const budget = options.computeBudget ?? proposeComputeBudget({ kind: "p2sh", templateHash: at.templateHash, entry: options.contract.entry })?.budget;
    if (budget === undefined) throw new HardkasError("V1_COMPUTE_BUDGET_REQUIRED", `no certified compute budget for '${at.contractName}' entry '${options.contract.entry}'; give computeBudget`);
    const inputs = [{ outpoint: { transactionId: options.outpoint.transactionId.toLowerCase(), index: options.outpoint.index }, amountSompi: String(utxo.amountSompi), address, scriptPublicKey: utxo.scriptPublicKey, kind: "p2sh", computeBudget: budget, contract: options.contract }];
    const outputs = options.payments.map((p) => ({ address: p.address, amountSompi: String(p.amountSompi), role: "payment" as const }));
    const fee = utxo.amountSompi - options.payments.reduce((s, p) => s + p.amountSompi, 0n);
    const body = this.bodyOf(inputs, outputs, fee, options.maxFeeSompi, {});
    const floor = await this.floorOf(body, address, facts);
    if (fee < floor) throw new HardkasError("FEE_BELOW_V1_FLOOR", `the payments leave ${fee} sompi for the fee; the node's floor for this transaction is ${floor}`, { metadata: { feeSompi: String(fee), floorSompi: String(floor) } });
    return this.plan({ body, from: { address }, purpose: `spend of ${at.contractName}.${options.contract.entry}` });
  }

  /**
   * F1.4 without any private key: what `sign` checks first (the plan's identity, its inputs as the node lists them, the
   * compiler's facts, the covenant rules, the fee floor). Nothing is signed or written; `txId` is the id the signed
   * transaction will have. Local validation only: the node still executes the scripts.
   */
  async check(plan: any, options: Pick<CovenantSignOptions, "facts" | "keys"> = {}): Promise<{ txId: string; warnings: readonly string[]; feeSompi: bigint; mass: any }> {
    const keys = options.keys ?? this.accountKeys();
    const r = await checkV1Plan({ plan, node: this.node(), facts: options.facts ?? this.workspaceFacts(), keys: { publicKeyOf: keys.publicKeyOf } });
    return { txId: r.txId, warnings: r.validation.warnings, feeSompi: r.validation.feeSompi, mass: r.validation.mass };
  }

  /**
   * F1.5 · signs a v1 plan with the engine: F1.4 against the node first (no key read for a plan it refuses), then each
   * key once. The signed artifact is stored next to its plan.
   */
  async sign(plan: any, options: CovenantSignOptions = {}): Promise<{ signed: any; txId: string; warnings: readonly string[]; feeSompi: bigint; mass: any }> {
    const r = await buildV1Transaction({ plan, node: this.node(), facts: options.facts ?? this.workspaceFacts(), keys: options.keys ?? this.accountKeys(options.keystorePassword) });
    await this.sdk.artifacts.write(r.signed as any);
    return { signed: r.signed, txId: r.txId, warnings: r.validation.warnings, feeSompi: r.validation.feeSompi, mass: r.validation.mass };
  }

  /** F1.6 · sends a signed v1 artifact: the one send of every HardKAS transaction (sdk.tx.send). */
  async send(signed: any, options: SendTxOptions & { facts?: V1EngineFacts | undefined } = {}): Promise<any> {
    const { facts, ...rest } = options;
    return this.sdk.tx.send(signed, { ...rest, ...(facts ? { v1Facts: facts } : {}) });
  }

  // ------------------------------------------------------------------------------------------------------------ helpers
  private networkId(): string {
    return declaredNetworkIdOf(this.sdk.config.config, this.sdk.network) ?? String(this.sdk.network);
  }

  private workspaceFacts(): V1EngineFacts {
    return createWorkspaceV1Facts({ workspaceRoot: this.sdk.workspace.root });
  }

  private node(): V1EngineNode {
    return { networkId: this.networkId(), utxosByAddresses: async (addresses) => {
      const m = new Map<string, any>();
      for (const a of addresses) for (const [k, v] of await this.listed(a)) m.set(k, v);
      return m;
    } };
  }

  private async listed(address: string): Promise<Map<string, any>> {
    const m = new Map<string, any>();
    for (const u of ((await (this.sdk.rpc as any).getUtxosByAddress(address)) ?? []) as any[]) {
      const n = v1NodeUtxoOf(u);
      if (n) m.set(n.key, n.utxo);
    }
    return m;
  }

  private sil(state: Readonly<Record<string, V1ArgValue>>) {
    return Object.fromEntries(Object.entries(state).map(([f, v]) => [f, v1ArgToSil(v, `state.${f}`)]));
  }

  private addressOf(f: V1ContractFacts): string {
    const k: any = loadManagedKaspaWasmSync();
    return String(k.addressFromScriptPublicKey(new k.ScriptPublicKey(f.lock.version, f.lock.script), this.networkId()));
  }

  /** This workspace's account by name, or the P2PK address given. */
  private resolveAccount(nameOrAddress: string): any {
    return resolveHardkasAccount({ nameOrAddress, config: { ...this.sdk.config.config, cwd: this.sdk.workspace.root } as any, executionTarget: this.sdk.execution as any });
  }

  /** An account name (this workspace's) or a P2PK address. */
  private funderAddress(funder: string): string {
    if (/^[a-z]+:[a-z0-9]+$/.test(funder)) return funder;
    const address = this.resolveAccount(funder)?.address;
    if (typeof address !== "string") throw new HardkasError("ACCOUNT_NOT_FOUND", `no account '${funder}' in this workspace`);
    return address;
  }

  private p2pkInput(c: V1FeeCoin, address: string, signer: string, budget: number) {
    return {
      outpoint: { transactionId: c.outpoint.transactionId, index: c.outpoint.index },
      amountSompi: String(c.amountSompi),
      address,
      scriptPublicKey: c.scriptPublicKey,
      ...(c.blockDaaScore !== undefined ? { blockDaaScore: String(c.blockDaaScore) } : {}),
      ...(c.isCoinbase !== undefined ? { isCoinbase: c.isCoinbase } : {}),
      kind: "p2pk" as const,
      computeBudget: budget,
      signer
    };
  }

  /** A body with its storage mass (rusty-kaspa 2.1.0) and fee; the covenant outpoints it spends. */
  private bodyOf(inputs: any[], outputs: any[], fee: bigint, maxFee: bigint | undefined, extra: Record<string, unknown>): V1PlanBody {
    const inGroup = new Set<number>(((extra.genesisCovenantGroups as any[]) ?? []).flatMap((g) => g.outputs));
    const storage = v1StorageMass(
      inputs.map((i) => ({ amountSompi: BigInt(i.amountSompi), scriptBytes: String(i.scriptPublicKey).length / 2 - 2, covenantId: i.covenantId !== undefined })),
      outputs.map((o, oi) => ({ amountSompi: BigInt(o.amountSompi), scriptBytes: p2pkOrP2shScriptBytes(o.address), covenantId: Boolean(o.covenant) || inGroup.has(oi) }))
    );
    if (storage === undefined) throw new HardkasError("V1_PLAN_INVALID", "the node cannot compute the storage mass of these amounts");
    const covenantOutpoints = inputs.filter((i) => i.kind === "covenant").map((i) => `${i.outpoint.transactionId}:${i.outpoint.index}`);
    return {
      txVersion: 1,
      inputs,
      outputs,
      ...extra,
      ...(covenantOutpoints.length > 0 ? { covenantOutpoints } : {}),
      estimatedFeeSompi: String(fee),
      estimatedMass: "0",
      storageMass: String(storage),
      maxFeeSompi: String(maxFee ?? fee)
    } as V1PlanBody;
  }

  /** The node's fee floor for this exact transaction (F1.4 without keys: mass of the real unlocks, rusty-kaspa rules). */
  private async floorOf(body: V1PlanBody, from: string, facts: V1EngineFacts): Promise<bigint> {
    const provisional = createV1TxPlanArtifact({
      networkId: this.networkId() as any,
      mode: this.sdk.execution.mode as any,
      from: { input: from, address: from },
      to: { input: body.outputs[0]!.address, address: body.outputs[0]!.address },
      amountSompi: BigInt(body.outputs[0]!.amountSompi),
      body: { ...body, maxFeeSompi: body.estimatedFeeSompi },
      ctx: systemRuntimeContext
    });
    const planFacts = await resolveV1PlanFacts(provisional, facts);
    const addresses = [...new Set((provisional as any).inputs.map((i: any) => String(i.address)))] as string[];
    const utxos = await this.node().utxosByAddresses(addresses);
    try {
      return validateV1Transition({ plan: provisional, node: { networkId: this.networkId(), utxos }, facts: planFacts.contract, successor: planFacts.successor }).mass.minimumFeeSompi;
    } catch (e: any) {
      if (e?.code === "FEE_BELOW_V1_FLOOR") return BigInt(e.detail.floorSompi);
      throw e;
    }
  }

  /** Funder coins (F1.7) and fee (the floor, or more) until both are stable: more inputs raise the floor. */
  private async withFloor(funder: string, needed: bigint, wantedFee: bigint | undefined, build: (coins: readonly V1FeeCoin[], fee: bigint) => V1PlanBody, facts: V1EngineFacts): Promise<V1PlanBody> {
    const rpc: any = this.sdk.rpc;
    const listed = ((await rpc.getUtxosByAddress(funder)) ?? []) as any[];
    const coins: V1FeeCoin[] = listed.map((u) => {
      const n = v1NodeUtxoOf(u)!;
      return { outpoint: { transactionId: n.key.split(":")[0]!, index: Number(n.key.split(":")[1]) }, amountSompi: n.utxo.amountSompi, scriptPublicKey: n.utxo.scriptPublicKey, blockDaaScore: n.utxo.blockDaaScore, isCoinbase: n.utxo.isCoinbase, ...(n.utxo.covenantId ? { covenantId: n.utxo.covenantId } : {}) };
    });
    const pending = (await observePendingSpends(rpc, funder)).outpoints;
    const daa = BigInt((await rpc.getBlockDagInfo()).virtualDaaScore ?? 0);
    let fee = wantedFee ?? 0n;
    for (let round = 0; round < 4; round++) {
      const { selected } = selectV1FeeInputs({ networkId: this.networkId(), virtualDaaScore: daa, coins, pendingOutpoints: pending, targetSompi: needed + fee });
      const floor = await this.floorOf(build(selected, fee), funder, facts);
      const next = wantedFee !== undefined && wantedFee > floor ? wantedFee : floor;
      if (next === fee) return build(selected, fee);
      fee = next;
    }
    throw new HardkasError("V1_FEE_UNSTABLE", "the fee and the coins that pay it did not settle in four rounds");
  }

  /** The keys of this workspace's accounts: public keys from their P2PK addresses (no keystore opened), private keys only when signing. */
  private accountKeys(keystorePassword?: string): V1KeyResolver {
    return {
      publicKeyOf: (account) => {
        let address: string | undefined;
        try {
          address = /^[a-z]+:[a-z0-9]+$/.test(account) ? account : this.resolveAccount(account)?.address;
        } catch {
          address = undefined;
        }
        const d = typeof address === "string" ? decodeKaspaAddress(address) : undefined;
        return d && d.version === 0 && d.payload.length === 32 ? Buffer.from(d.payload).toString("hex") : undefined;
      },
      privateKeyOf: async (account) => resolveAccountPrivateKey(this.resolveAccount(account), { networkId: this.networkId(), keystorePassword })
    };
  }
}

/** The bytes of the script a P2PK (Schnorr 34, ECDSA 35) or P2SH (35) address pays to. */
function p2pkOrP2shScriptBytes(address: string): number {
  const d = decodeKaspaAddress(address);
  if (d?.version === 0 && d.payload.length === 32) return 34;
  if (d?.version === 8 && d.payload.length === 32) return 35;
  if (d?.version === 1 && d.payload.length === 33) return 35;
  throw new HardkasError("V1_PLAN_INVALID", `${address} is not a P2PK or P2SH address`);
}
