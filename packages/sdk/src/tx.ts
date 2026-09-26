import { systemRuntimeContext, deterministicCompare, getCoinbaseMaturity, HardkasError } from "@hardkas/core";
import { pollCondition } from "./waiters.js";
import { Hardkas } from "./index.js";
import {
  buildPaymentPlan,
  Utxo as BuilderUtxo,
  verifySignedTxSemantics
} from "@hardkas/tx-builder";
import {
  ARTIFACT_SCHEMAS,
  CURRENT_HASH_VERSION,
  calculateContentHash,
  SignedTxArtifact,
  TxReceiptArtifact,
  TxSubmissionArtifact,
  TxPlanArtifact,
  getDefaultReceiptPath,
  writeArtifact,
  createLineageTransition,
  createTxPlanArtifact,
  readTxReceiptArtifact,
  HARDKAS_VERSION,
  ARTIFACT_VERSION,
  getBroadcastableSignedTransaction,
  syntheticTxIdFor,
  checkSyntheticAuthorization,
  authorizablePlanIdentity,
  SYNTHETIC_AUTHORIZATION_FORMAT,
  deriveSubmissionFee,
  deriveTxStatus,
  deriveObserverId,
  TX_STATUS_POLICY_HARDKAS_DEFAULT_V1,
  type DerivedTxStatus,
  type TxStatusPolicy,
  type TxObservation
} from "@hardkas/artifacts";
import { observeTxOnce, rpcObserverFor } from "./tx-observer.js";
import { coreEvents } from "@hardkas/core";
import {
  HardkasAccount,
  signTxPlanArtifact,
  validateAddressNetwork
} from "@hardkas/accounts";
import { parseKasToSompi, type NetworkId } from "@hardkas/core";
import { TxPlanService, type UtxoProvider } from "@hardkas/tx-builder";
import { HardkasSchemas } from "@hardkas/artifacts";

function normalizeSimulatedPlanInput(target: any, fallbackId: string): TxPlanArtifact {
  if (target.schema === ARTIFACT_SCHEMAS.TX_PLAN && Array.isArray(target.inputs)) {
    return target as TxPlanArtifact;
  }

  if (target.from && target.to && target.amountSompi) {
    if (target.mode !== "simulator") {
      throw new Error(
        "Cannot simulate real signed artifact without parent plan. Missing plan inputs data."
      );
    }

    return {
      schema: ARTIFACT_SCHEMAS.TX_PLAN,
      planId: target.planId || target.sourcePlanId || fallbackId,
      networkId: target.networkId || "simnet",
      mode: "simulator",
      from: target.from,
      to: target.to,
      amountSompi: target.amountSompi,
      estimatedFeeSompi: "0",
      estimatedMass: "0",
      inputs: [],
      outputs: [{ address: target.to.address, amountSompi: target.amountSompi || "0" }],
      plan: {
        inputs: [],
        outputs: [
          { address: target.to.address, amountSompi: BigInt(target.amountSompi || 0) }
        ],
        feeSompi: 0n,
        mass: 0n,
        changeSompi: 0n
      }
    } as any;
  }

  throw new Error(
    "Cannot simulate signed artifact without parent plan or embedded plan data."
  );
}

/**
 * HardKAS Transaction Module
 * @alpha
 */
export interface SignTxOptions {
  account?: HardkasAccount | string;
  authorizers?: Record<number, any>; // Record<number, TxInputAuthorizer>
  append?: boolean;
  threshold?: number;
  requiredSigners?: string[];
  /**
   * Wave 1.2 · IC-5′.6: when appending to a partially signed artifact whose parent
   * plan is not persisted, the plan object may be supplied; it is accepted only if
   * its recomputed identity is the artifact's `lineage.parentArtifactId`.
   */
  plan?: TxPlanArtifact;
}

/**
 * @deprecated Use SignTxOptions instead
 */
export interface LegacySignTxOptions {
  append?: boolean;
  threshold?: number;
  requiredSigners?: string[];
  authorizers?: any;
}

function isSignTxOptions(value: unknown): value is SignTxOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    ("authorizers" in value ||
      "account" in value ||
      "requiredSigners" in value)
  );
}

export class HardkasTx {
  constructor(private sdk: Hardkas) {}

  /**
   * Wave 2(a) · Q4 / IC-2′: ONE look at the configured node about `txId`, sealed and
   * (by default) persisted as `hardkas.txObservation.v1`. The observer's cursor is,
   * in order: `since`, the latest stored observation's sink, the submission's
   * `submitPoint.sinkHash`, the node's pruning point. Nothing here decides a state.
   */
  async observe(
    txId: string,
    options: { since?: string; maxBatches?: number; persist?: boolean; rpcUrl?: string; policy?: TxStatusPolicy } = {}
  ): Promise<{ observation: TxObservation; observationPath?: string; derived: DerivedTxStatus }> {
    if (/^synthetic-[0-9a-f]{64}$/.test(txId)) {
      throw new HardkasError(
        "OBSERVATION_SYNTHETIC_TXID",
        `${txId} is a synthetic (simulator) txId: there is no network to observe; its state derives from the simulator receipt`
      );
    }
    const { ProjectArtifactStore } = await import("@hardkas/artifacts");
    const store = new ProjectArtifactStore(this.sdk.workspace.root);
    const submission = await this.findSubmissionForTxId(txId);
    const previous = store.listObservationsByTxId(txId).observations as any[];
    previous.sort((a, b) => (BigInt(a.point.sinkBlueScore) < BigInt(b.point.sinkBlueScore) ? -1 : 1));
    const latest = previous[previous.length - 1];
    // The block currently established as accepting (none after a REORGED derivation).
    const soFar = deriveTxStatus({ txId, ...(submission ? { submission } : {}), observations: previous });
    const currentAccepting =
      soFar.status === "ACCEPTED" || soFar.status === "CONFIRMED" || soFar.status === "FINALIZED" ? soFar.acceptingBlockHash : undefined;
    // Cursor: an explicit `since`, else where the last scan stopped, else the last
    // observation point, else the submit point; the observer falls back to the pruning point.
    const since =
      options.since ??
      (latest?.finding?.type === "not_found" && typeof latest.finding.scannedTo === "string" ? (latest.finding.scannedTo as string) : undefined) ??
      (latest?.point?.sinkHash as string | undefined) ??
      ((submission as any)?.submitPoint?.sinkHash as string | undefined);
    const networkId = ((submission as any)?.networkId ?? this.sdk.network) as TxObservation["networkId"];
    const mode = ((submission as any)?.mode ?? "rpc") as TxObservation["mode"];

    const observation = await observeTxOnce(
      rpcObserverFor(this.sdk.rpc),
      {
        txId,
        observerId: this.observerId(),
        ...(submission?.contentHash ? { submissionArtifactId: submission.contentHash as string } : {}),
        ...(since ? { since } : {}),
        ...(currentAccepting ? { previousAcceptingBlockHash: currentAccepting } : {}),
        ...(options.maxBatches !== undefined ? { maxBatches: options.maxBatches } : {}),
        networkId,
        mode,
        ...((submission as any)?.execution ? { execution: (submission as any).execution } : {}),
        ...(options.rpcUrl ? { rpcUrl: options.rpcUrl } : {}),
        ...((submission as any)?.workflowId ? { workflowId: (submission as any).workflowId } : {}),
        ...((submission as any)?.assumptionLevel ? { assumptionLevel: (submission as any).assumptionLevel } : {})
      },
      systemRuntimeContext
    );
    let observationPath: string | undefined;
    if (options.persist ?? true) {
      observationPath = (await this.sdk.artifacts.write(observation as any)).absolutePath;
    }
    const derived = deriveTxStatus({
      txId,
      ...(submission ? { submission } : {}),
      observations: [...previous, observation],
      ...(options.policy ? { policy: options.policy } : {})
    });
    return { observation, ...(observationPath ? { observationPath } : {}), derived };
  }

  /**
   * The opaque, stable identity of THIS SDK instance's RPC observer: a digest of the
   * configured target and its raw locator (never exposed). Same configuration ⇒ same
   * observer ⇒ one history; a different node configuration is a different observer.
   */
  observerId(): string {
    const target = this.sdk.config.config.defaultNetwork || "simnet";
    const locator = (this.sdk.config.config.networks as any)?.[target]?.rpcUrl;
    return deriveObserverId({ kind: "rpc", target, ...(typeof locator === "string" ? { locator } : {}) });
  }

  /** The verified submission (or simulator receipt) recorded for `txId`, if exactly one exists. */
  private async findSubmissionForTxId(txId: string): Promise<any | undefined> {
    try {
      return await this.sdk.artifacts.read({ tx: txId });
    } catch (e: any) {
      if (e?.code === "RECEIPT_AMBIGUOUS_CONFLICT" || e?.code === "CANDIDATE_INVALID") throw e;
      return undefined;
    }
  }

  /**
   * Waits until the derived state is `ACCEPTED` (or deeper): observed acceptance by a
   * chain block. Each poll persists ONE observation; the state is derived, never stored.
   */
  async waitForAccepted(options: {
    txId: string;
    timeoutMs?: number | undefined;
    pollIntervalMs?: number | undefined;
    signal?: AbortSignal | undefined;
  }) {
    return pollCondition(
      async () => {
        const { derived } = await this.observe(options.txId);
        if (derived.status === "ACCEPTED" || derived.status === "CONFIRMED" || derived.status === "FINALIZED") {
          return {
            ok: true,
            value: {
              status: "accepted",
              txId: options.txId,
              acceptingBlockHash: derived.acceptingBlockHash,
              confirmations: Number(derived.confirmations?.blue ?? 0),
              derived
            },
            lastObservedState: { status: derived.status }
          };
        }
        return { ok: false, lastObservedState: { status: derived.status, txId: options.txId } };
      },
      "TX_ACCEPTANCE_TIMEOUT",
      "Timeout waiting for transaction acceptance",
      options
    );
  }

  /**
   * Waits until the observed blue-score depth of the accepting block reaches
   * `minConfirmations` (Q4 point 3: `sinkBlueScore − acceptingBlueScore`, the node's
   * own unit). `minConfirmations` is the caller's policy, not a Kaspa parameter.
   */
  async waitForConfirmations(options: {
    txId: string;
    minConfirmations: number;
    timeoutMs?: number | undefined;
    pollIntervalMs?: number | undefined;
    signal?: AbortSignal | undefined;
  }) {
    const policy: TxStatusPolicy = {
      ...TX_STATUS_POLICY_HARDKAS_DEFAULT_V1,
      policyId: "hardkas.txStatusPolicy.caller",
      origin: "user",
      minConfirmations: options.minConfirmations
    };
    return pollCondition(
      async () => {
        const { derived, observation } = await this.observe(options.txId, { policy });
        const confirmations = derived.confirmations ? Number(derived.confirmations.blue) : undefined;
        if (
          derived.status === "FINALIZED" ||
          ((derived.status === "CONFIRMED" || derived.status === "ACCEPTED") &&
            confirmations !== undefined &&
            BigInt(derived.confirmations!.blue) >= BigInt(policy.minConfirmations))
        ) {
          return {
            ok: true,
            value: {
              status: "confirmed",
              confirmations,
              confirmationUnit: "blue-score",
              acceptingBlockHash: derived.acceptingBlockHash,
              observedAtDaaScore: observation.point.virtualDaaScore,
              derived
            },
            lastObservedState: { status: derived.status, confirmations, required: options.minConfirmations }
          };
        }
        return {
          ok: false,
          lastObservedState: { status: derived.status, ...(confirmations !== undefined ? { confirmations } : {}), required: options.minConfirmations }
        };
      },
      "TX_CONFIRMATION_TIMEOUT",
      "Timeout waiting for transaction confirmations",
      options
    );
  }

  /**
   * Plans a transaction.
   */
  async plan(options: {
    from: string | HardkasAccount;
    to: string | HardkasAccount;
    amount: string | number | bigint;
    feeRate?: bigint;
    workflowId?: string;
    policy?: string;
    networkProfile?: string;
    assumption?: string;
    /** AUD-28: explicit change destination; default = the sender's address. Validated, then forwarded to the planner. */
    changeAddress?: string;
  }): Promise<TxPlanArtifact> {
    const fromAccount =
      typeof options.from === "string"
        ? await this.sdk.accounts.resolve(options.from)
        : options.from;
    const toAccount =
      typeof options.to === "string"
        ? await this.sdk.accounts.resolve(options.to)
        : options.to;

    if (!fromAccount.address)
      throw new Error(`From account ${fromAccount.name} has no address.`);
    if (!toAccount.address)
      throw new Error(`To account ${toAccount.name} has no address.`);

    const activeNetwork = options.networkProfile || this.sdk.config.config.defaultNetwork || "simnet";

    if (typeof options.amount === "string" && options.amount.toLowerCase() === "all") {
      const res = await this.sdk.query.getSpendableUtxos({ address: fromAccount.address, excludePending: true });
      return this.createConsolidationPlan({
         account: fromAccount,
         selectedUtxos: res.data,
         destination: toAccount.address,
         network: activeNetwork,
         ...(options.feeRate !== undefined ? { feeRate: options.feeRate } : {})
      });
    }

    const amountSompi =
      typeof options.amount === "string"
        ? parseKasToSompi(options.amount)
        : typeof options.amount === "number"
          ? parseKasToSompi(options.amount.toString())
          : options.amount;

    if (amountSompi === 0n) {
      throw new Error(
        "Kaspa value-transfer outputs require amount > 0.\nFor metadata/notary/DID marker transactions use --amount 1.\nFuture: hardkas tx anchor."
      );
    }

    
    const allowMainnet =
      (this.sdk.config.config.networks?.mainnet as any)?.allowMainnet === true;

    // Address Preflight Validation
    validateAddressNetwork(fromAccount.address, activeNetwork, allowMainnet);
    validateAddressNetwork(toAccount.address, activeNetwork, allowMainnet);
    if (options.changeAddress) {
      validateAddressNetwork(options.changeAddress, activeNetwork, allowMainnet);
    }
    // AUD-28: validated above; forwarded to whichever planner runs (never dropped).
    const changeRequest = options.changeAddress ? { changeAddress: options.changeAddress } : {};

    // Wave 2(c) · AUD-19: the mempool observation the real-network snapshot was
    // filtered against, recorded in the plan (observer-local evidence).
    let pendingSpendEvidence: import("@hardkas/tx-builder").PendingSpendEvidence | undefined;

    // Create UtxoProvider
    const utxoProvider: UtxoProvider = {
      getUtxos: async (address: string) => {
        if (
          activeNetwork === "simulated" ||
          this.sdk.config.config.networks?.[activeNetwork]?.kind === "simulated"
        ) {
          const { loadOrCreateLocalnetState, getSpendableUtxos } =
            await import("@hardkas/localnet");
          const localState = await loadOrCreateLocalnetState({
            cwd: this.sdk.workspace.root
          });
          const unspent = getSpendableUtxos(localState, address);
          console.log("DEBUG SDK TX PLAN: address=", address, "unspent=", unspent);
          return unspent.map((u) => {
            const parts = u.id.split(":");
            const index = Number(parts[parts.length - 1]);
            const transactionId = parts.slice(0, -1).join(":");
            return {
              outpoint: { transactionId, index },
              address: u.address,
              amountSompi: BigInt(u.amountSompi),
              scriptPublicKey: "mock-script"
            };
          });
        } else {
          let observedAtDaaScore: bigint | undefined;
          try {
            const info = await this.sdk.rpc.getBlockDagInfo();
            observedAtDaaScore = info.virtualDaaScore !== undefined ? BigInt(info.virtualDaaScore) : undefined;
          } catch {
            observedAtDaaScore = undefined;
          }
          const res = await this.sdk.query.getSpendableUtxos({
            address,
            excludePending: true,
            ...(observedAtDaaScore !== undefined ? { observedAtDaaScore } : {})
          });
          pendingSpendEvidence = res.pendingSpendEvidence;
          const rpcUtxos = res.data;
          return rpcUtxos.map((u: any) => {
            const utxo: any = {
              outpoint: {
                transactionId: u.outpoint.transactionId,
                index: u.outpoint.index
              },
              address: u.address,
              amountSompi: BigInt(u.amountSompi),
              scriptPublicKey: u.scriptPublicKey || "",
              isCoinbase: u.isCoinbase
            };
            if (u.blockDaaScore !== undefined) {
              utxo.blockDaaScore = BigInt(u.blockDaaScore);
            }
            return utxo;
          });
        }
      },
      getVirtualDaaScore: async () => {
        if (
          activeNetwork === "simulated" ||
          this.sdk.config.config.networks?.[activeNetwork]?.kind === "simulated"
        ) {
          return 1000000n; // Arbitrary high score for simulator
        } else {
          try {
            const info = await this.sdk.rpc.getBlockDagInfo();
            return info.virtualDaaScore !== undefined ? BigInt(info.virtualDaaScore) : 0n;
          } catch {
            return undefined as any;
          }
        }
      }
    };

    const networkConfig = this.sdk.config.config.networks?.[activeNetwork];
    const coinbaseMaturity = getCoinbaseMaturity(activeNetwork, networkConfig?.kind === "kaspa-node" || networkConfig?.kind === "kaspa-rpc" || networkConfig?.kind === "simulated" ? networkConfig.consensusParams : undefined);
    
    // Priority is a fee RATE; the fee itself is computed by the planner with the
    // SDK over the real transaction (amounts included, so storage mass counts).
    // A fixed fee estimated from the shape alone cannot know that.
    let feeRate = options.feeRate;
    if (feeRate === undefined) {
      ({ feeRate } = await this.sdk.fees.estimate({
        priority: "normal",
        inputs: 1,
        outputs: 2,
        network: activeNetwork as NetworkId
      }));
    }

    // M10-B-completion (A′): domain-explicit dispatch.
    //
    // Real Kaspa execution paths (mainnet, testnet-N, devnet, localnet or
    // simnet backed by a real node) go to `planTransactionUpstream`, which
    // delegates coin selection, mass and fee to kaspa-wasm 2.0.1 `Generator`.
    // The simulated developer harness (kaspa:sim_* accounts, mock scripts)
    // goes to `planTransactionSynthetic`, an explicitly NON-AUTHORITATIVE
    // synthetic planner. There is NO automatic fallback from the upstream
    // path to the synthetic path: an upstream failure surfaces to the caller
    // rather than being silently downgraded to synthetic. This preserves the
    // real-network authority claim while keeping the `mode: simulated` DX.
    const isSimulatedForPlan =
      activeNetwork === "simulated" ||
      this.sdk.config.config.networks?.[activeNetwork]?.kind === "simulated";
    const planService = new TxPlanService(utxoProvider, { coinbaseMaturity });
    let result;
    if (isSimulatedForPlan) {
      result = await planService.planTransactionSynthetic({
        fromAddress: fromAccount.address,
        toAddress: toAccount.address,
        amountSompi,
        feeRate,
        networkId: activeNetwork,
        ...changeRequest
      });
    } else {
      result = await planService.planTransactionUpstream({
        fromAddress: fromAccount.address,
        toAddress: toAccount.address,
        amountSompi,
        feeRate,
        networkId: activeNetwork,
        ...changeRequest
      });
    }

    const builderPlan = result.plan;

    const isSimulated =
      activeNetwork === "simulated" ||
      this.sdk.config.config.networks?.[activeNetwork]?.kind === "simulated";
    let resolvedAssumptionLevel = options.assumption;
    if (!resolvedAssumptionLevel) {
      if (isSimulated) {
        resolvedAssumptionLevel = "local-simulated";
      } else if (activeNetwork === "simnet") {
        resolvedAssumptionLevel = "local-rpc";
      } else {
        resolvedAssumptionLevel = activeNetwork;
      }
    }

    const basePlan = createTxPlanArtifact({
      networkId: activeNetwork as NetworkId,
      mode: isSimulated ? "simulator" : (networkConfig?.kind === "kaspa-node" ? "localnet" : "rpc"),
      from: {
        input: fromAccount.name || fromAccount.address,
        address: fromAccount.address,
        accountName: fromAccount.name
      },
      to: {
        input: toAccount.name || toAccount.address,
        address: toAccount.address
      },
      amountSompi,
      plan: builderPlan,
      ctx: {
        ...systemRuntimeContext,
        ...(options.workflowId ? { workflowId: options.workflowId } : {}),
        assumptionLevel: resolvedAssumptionLevel,
        utxoSelection: result.utxoSelection,
        // M10-B-completion (A′): record which planner produced this artifact,
        // so downstream verify/lineage tools can distinguish real-network
        // authority (KASPA_WASM_GENERATOR) from the simulated harness
        // (SYNTHETIC_SIMULATOR). Real networks must always show
        // KASPA_WASM_GENERATOR — the dispatch above enforces that.
        ...(result.plannerAuthority ? { plannerAuthority: result.plannerAuthority } : {}),
        ...(result.plannerAuthorityDetail ? { plannerAuthorityDetail: result.plannerAuthorityDetail } : {}),
        ...(pendingSpendEvidence ? { pendingSpendEvidence } : {})
      }
    }) as unknown as TxPlanArtifact;

    // Wave 1.2 · IC-5′.6: persisted references are authenticated artifactIds. The
    // input is resolved through the namespaced reader (a contained path or a 64-hex
    // artifactId; a label is NAMESPACE_REQUIRED) and verified; there is no raw
    // fallback: an unresolvable reference fails the plan.
    const resolveReference = async (input: string, kind: string): Promise<string> => {
      try {
        const artifact = await this.sdk.artifacts.read(input);
        return artifact.contentHash as string;
      } catch (e: any) {
        if (e?.code === "ARTIFACT_NOT_FOUND") {
          throw new HardkasError("REFERENCE_MISSING", `Referenced ${kind} ${input} not found in workspace`);
        }
        throw e;
      }
    };

    if (options.policy || (options as any).policies) {
      const inputPolicies: string[] =
        (options as any).policies || (options.policy ? [options.policy] : []);
      const resolvedRefs: string[] = [];
      for (const p of inputPolicies) {
        resolvedRefs.push(await resolveReference(p, "policy"));
      }
      if (resolvedRefs.length > 0) {
        (basePlan as any).policyRefs = resolvedRefs;
        (basePlan as any).policyRef = resolvedRefs[0]; // Legacy field, same artifactId
      }
    }

    if (options.networkProfile) {
      (basePlan as any).networkProfileRef = await resolveReference(options.networkProfile, "network profile");
    }

    if (options.assumption) {
      (basePlan as any).assumptionRef = await resolveReference(options.assumption, "assumption");
    }

    // Seal the identity now that references are injected: one pass, root form (D-Q1.d).
    const { finalizeTxPlanIdentity } = await import("@hardkas/artifacts");
    finalizeTxPlanIdentity(basePlan as any);
    // Not memoised: the plan is not on disk yet (IC-5′.8, the cache mirrors the store).

    // Verify policy evaluation at planning time if policies are provided
    if ((basePlan as any).policyRefs && (basePlan as any).policyRefs.length > 0) {
      await this.sdk.artifacts.verify(basePlan, {
        throwOnInvalid: true,
        strict: true,
        enforceMetadata: false
      });
    }

    return basePlan;
  }

  /**
   * Creates a transaction plan explicitly for consolidation.
   * This overrides normal selection logic and uses precisely the provided UTXOs.
   */
  async createConsolidationPlan(options: {
    account: HardkasAccount | string;
    selectedUtxos: any[];
    destination: string;
    network?: string;
    feeRate?: bigint;
    totalUtxosSeen?: number;
  }): Promise<TxPlanArtifact> {
    let resolvedAccount: HardkasAccount;
    if (typeof options.account === "string") {
      resolvedAccount = await this.sdk.accounts.resolve(options.account);
    } else {
      resolvedAccount = options.account;
    }

    if (!resolvedAccount?.address) {
      throw new Error(
        `Account '${resolvedAccount?.name || options.account}' has no address.`
      );
    }

    const activeNetwork =
      options.network || this.sdk.config.config.defaultNetwork || "simnet";
    const isSimulated =
      activeNetwork === "simulated" ||
      this.sdk.config.config.networks?.[activeNetwork]?.kind === "simulated";

    const dummyProvider: UtxoProvider = {
      getUtxos: async () => []
    };
    const networkConfig = this.sdk.config.config.networks?.[activeNetwork];
    const coinbaseMaturity = getCoinbaseMaturity(activeNetwork, networkConfig?.kind === "kaspa-node" || networkConfig?.kind === "kaspa-rpc" || networkConfig?.kind === "simulated" ? networkConfig.consensusParams : undefined);
    
    const planService = new TxPlanService(dummyProvider, { coinbaseMaturity });
    const result = await planService.planConsolidation({
      fromAddress: resolvedAccount?.address as string,
      selectedUtxos: options.selectedUtxos,
      toAddress: options.destination,
      ...(options.feeRate !== undefined ? { feeRate: options.feeRate } : {})
    });

    const builderPlan = result.plan;
    const firstOutput = builderPlan.outputs[0];
    if (!firstOutput) {
      throw new Error("Consolidation failed: transaction builder produced no outputs.");
    }
    const outputAmount = firstOutput.amountSompi;

    let resolvedAssumptionLevel = isSimulated ? "local-simulated" : "local-rpc";

    const basePlan = createTxPlanArtifact({
      networkId: activeNetwork as any,
      mode: isSimulated ? "simulator" : (networkConfig?.kind === "kaspa-node" ? "localnet" : "rpc"),
      from: {
        input: resolvedAccount?.name || (resolvedAccount?.address as string),
        address: resolvedAccount?.address as string,
        accountName: resolvedAccount?.name
      },
      to: {
        input: options.destination,
        address: options.destination
      },
      amountSompi: outputAmount,
      plan: builderPlan,
      ctx: {
        ...systemRuntimeContext,
        assumptionLevel: resolvedAssumptionLevel,
        utxoSelection: {
          strategy: result.utxoSelection.selectionStrategy,
          totalUtxosSeen: options.totalUtxosSeen ?? options.selectedUtxos.length,
          selectedUtxos: result.utxoSelection.selectedUtxos,
          purpose: result.utxoSelection.purpose
        }
      } as any
    }) as unknown as TxPlanArtifact;

    // createTxPlanArtifact already sealed the identity in root form (D-Q1.d); nothing
    // was added since, so no second pass is needed or allowed (IC-1′.4). Not memoised:
    // the plan is not on disk yet (IC-5′.8).
    return basePlan;
  }




  /**
   * Signs a transaction plan.
   */
  async sign(
    plan: TxPlanArtifact | SignedTxArtifact,
    options?: SignTxOptions
  ): Promise<SignedTxArtifact>;

  /**
   * @deprecated Pass options as the second argument instead.
   */
  async sign(
    plan: TxPlanArtifact | SignedTxArtifact,
    account: HardkasAccount | string | any,
    options?: LegacySignTxOptions
  ): Promise<SignedTxArtifact>;

  async sign(
    plan: TxPlanArtifact | SignedTxArtifact,
    accountOrOptions?: HardkasAccount | string | any | SignTxOptions,
    legacyOptions?: LegacySignTxOptions
  ): Promise<SignedTxArtifact> {
    if (!plan || typeof plan !== "object") {
      const e = new Error("TX_ARTIFACT_SCHEMA_INVALID: Input plan must be a valid artifact object.");
      (e as any).code = "TX_ARTIFACT_SCHEMA_INVALID";
      throw e;
    }

    // On-the-fly normalization for legacy artifacts
    if (!plan.schema) {
      if ((plan as any).metadata?.schema) {
        (plan as any).schema = (plan as any).metadata.schema;
      } else if ((plan as any).inputs && (plan as any).outputs) {
        (plan as any).schema = HardkasSchemas.TxPlan;
      }
    }

    if (!plan.schema) {
      const e = new Error("TX_ARTIFACT_SCHEMA_INVALID: Artifact is missing the required 'schema' or 'metadata.schema' property.");
      (e as any).code = "TX_ARTIFACT_SCHEMA_INVALID";
      throw e;
    }

    if (
      (plan as any).schema === HardkasSchemas.TxPlanV1 ||
      (plan as any).schema === HardkasSchemas.SignedTxV1 ||
      (plan as any).txVersion === 1
    ) {
      // WASM v0.13 does not support V1 artifacts natively in our SDK adapters yet
      const wasmProvider = this.sdk.config.config.wasm?.provider || "npm";
      if (wasmProvider !== "local") {
        const e = new Error("The configured WASM runtime does not support TX V1 signing. Upgrade to WASM v2.x.");
        (e as any).code = "BLOCKED_BY_DEPENDENCY";
        throw e;
      }
    }

    let resolvedAccount: HardkasAccount | undefined = undefined;
    let actualOptions: SignTxOptions = {};

    if (isSignTxOptions(accountOrOptions)) {
      actualOptions = accountOrOptions;
    } else {
      actualOptions = { ...legacyOptions } as SignTxOptions;
      if (accountOrOptions) {
        if (typeof accountOrOptions === "object" && typeof accountOrOptions.authorize === "function") {
          // Direct authorizer support
          const actualAuthorizers: Record<number, any> = {};
          for (let i = 0; i < (plan as any).inputs?.length || 0; i++) {
            actualAuthorizers[i] = accountOrOptions;
          }
          actualOptions.authorizers = actualAuthorizers;
        } else if (typeof accountOrOptions === "string") {
          actualOptions.account = await this.sdk.accounts.resolve(accountOrOptions, (plan as any).execution);
        } else {
          actualOptions.account = accountOrOptions;
        }
      }
    }

    if (
      (plan as any).schema === HardkasSchemas.SignedTx ||
      (plan as any).schema === HardkasSchemas.SignedTxV1
    ) {
      if (actualOptions.append === undefined && (plan as any).status === "partially_signed") {
        // Auto-detect append
        actualOptions = { ...actualOptions, append: true };
      }
    }

    if (
      !actualOptions.append &&
      ((plan as any).schema === HardkasSchemas.SignedTx ||
      (plan as any).signedTxId ||
      (plan as any).transactionId ||
      (plan as any).schema === HardkasSchemas.SignedTxV1)
    ) {
      const e = new Error(
        "ALREADY_SIGNED_ARTIFACT: Already signed artifact passed to tx.sign. Multi-sig append is not yet supported."
      );
      (e as any).code = "ALREADY_SIGNED_ARTIFACT";
      throw e;
    }

    if (
      (plan as any).schema !== HardkasSchemas.TxPlan &&
      (plan as any).schema !== HardkasSchemas.SignedTx &&
      (plan as any).schema !== HardkasSchemas.TxPlanV1 &&
      (plan as any).schema !== HardkasSchemas.SignedTxV1
    ) {
      const e = new Error(`TX_ARTIFACT_SCHEMA_INVALID: Unsupported artifact schema for signing: ${(plan as any).schema}`);
      (e as any).code = "TX_ARTIFACT_SCHEMA_INVALID";
      throw e;
    }

    // Option parsing moved above

    const planExecutionTarget = (plan as any).execution;
    if (actualOptions.account) {
      if (typeof actualOptions.account === "string") {
        resolvedAccount = await this.sdk.accounts.resolve(actualOptions.account, planExecutionTarget);
      } else {
        resolvedAccount = actualOptions.account;
      }
    } else if (!actualOptions.authorizers) {
      const fromName =
        (plan as any).from?.accountName ||
        (plan as any).from?.input ||
        (plan as any).from?.address;
      if (!fromName)
        throw new Error(
          "Plan does not specify an account name and no account was provided for signing."
        );
      resolvedAccount = await this.sdk.accounts.resolve(fromName, planExecutionTarget);
    }

    let actualAuthorizers = actualOptions.authorizers;

    const planId = (plan as any).planId || (plan as any).sourcePlanId || "unknown";
    await this.sdk.plugins.onBeforeTxSign({ planId, account: resolvedAccount?.name || "unknown" });

    if (typeof plan === "object" && plan !== null && (plan as any).contentHash) {
      await this.sdk.artifacts.verify(plan, {
        throwOnInvalid: true,
        strict: true,
        enforceMetadata: false,
        ...(actualOptions.plan ? { parent: actualOptions.plan } : {})
      });
    }

    if (this.sdk.signer && plan.schema === HardkasSchemas.TxPlan) {
      const signedArtifact = await this.sdk.signer.signTransaction(
        plan as TxPlanArtifact
      );

      const { absolutePath } = await this.sdk.artifacts.write(signedArtifact);
      const { coreEvents } = await import("@hardkas/core");
      const signedRecord = signedArtifact as unknown as Record<string, string>;
      // IC-5′.11: events carry the canonical identity (content hash), never a label.
      const artifactId = signedRecord.contentHash || signedArtifact.signedId;

      coreEvents.normalizeAndEmit({
        kind: "artifact.created",
        schema: signedArtifact.schema,
        artifactId: artifactId,
        network: signedArtifact.networkId,
        mode: signedArtifact.mode,
        path: absolutePath
      } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);

      coreEvents.normalizeAndEmit({
        kind: "tx.signed",
        txId: signedArtifact.txId || artifactId,
        network: signedArtifact.networkId,
        mode: signedArtifact.mode,
        amountSompi: signedArtifact.amountSompi
      } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);

      return signedArtifact;
    }

    let signedArtifact: any;

    if (plan.schema === HardkasSchemas.SignedTx) {
      // 1. Validate append intention
      if (plan.status === "signed") {
        throw new Error(
          "Cannot append signature to an already completed signed transaction."
        );
      }
      if (!actualOptions.append) {
        throw new Error(
          "Input file is a partially signed transaction. Use the --append flag to add your signature."
        );
      }

      const partialTx = plan as any;
      if (!partialTx.multisig) {
        throw new Error(
          "Input file is a signed transaction but does not contain multisig configuration."
        );
      }

      // Wave 1.4 · IC-6′.1/.5: the plan reference is the partial's AUTHENTICATED
      // `authorization.planArtifactId`, carried unchanged through every append. A
      // partial without one is legacy and unbound: it cannot be completed.
      const bound = partialTx.authorization;
      if (bound?.kind !== "synthetic" || typeof bound.planArtifactId !== "string" || !/^[0-9a-f]{64}$/.test(bound.planArtifactId)) {
        throw new HardkasError(
          "LEGACY_UNBOUND_SIGNED",
          "The partially signed artifact carries no authenticated plan reference: it is legacy and not bound to any plan. Re-authorize the plan with `hardkas tx sign` from the first signature."
        );
      }
      const boundPlanArtifactId: string = bound.planArtifactId;

      const signerAddress = resolvedAccount?.address;
      if (!signerAddress) {
        throw new Error(`Signer account '${resolvedAccount?.name}' has no address.`);
      }

      // Check authorization
      const required = partialTx.multisig.requiredSigners;
      if (required && required.length > 0 && !required.includes(signerAddress)) {
        throw new Error(
          `Signer '${signerAddress}' is not an authorized signer for this transaction.`
        );
      }

      // Check double signature
      const sigs = partialTx.multisig.signatures || [];
      if (sigs.some((s: any) => s.signer === signerAddress)) {
        throw new Error(
          `Account '${signerAddress}' has already signed this transaction.`
        );
      }

      // IC-6′.4: a synthetic entry is never presented as a signature.
      const signatureEntry = {
        signer: signerAddress,
        kind: "synthetic" as const
      };

      // Append and sort alphabetically by signer address to ensure deterministic hash
      const newSignatures = [...sigs, signatureEntry].sort((a, b) =>
        deterministicCompare(a.signer, b.signer)
      );

      // Append metadata (excl. from contentHash)
      const newMeta = [
        ...(partialTx.signatureMetadata || []),
        {
          signer: signerAddress,
          signedAt: new Date().toISOString()
        }
      ];

      const thresholdReached = newSignatures.length >= partialTx.multisig.threshold;
      const finalStatus = thresholdReached ? "signed" : "partially_signed";

      const draft: any = {
        ...partialTx,
        status: finalStatus,
        // IC-6′.3: the signer set lives in the authenticated body.
        authorization: {
          kind: "synthetic",
          planArtifactId: boundPlanArtifactId,
          signers: newSignatures.map((s) => s.signer)
        },
        multisig: {
          ...partialTx.multisig,
          signatures: newSignatures
        },
        signatureMetadata: newMeta,
        lineage: createLineageTransition(partialTx, HardkasSchemas.SignedTx)
      };

      if (thresholdReached) {
        // IC-6′.2: the plan's `from` must be among the authorizing identities.
        if (!newSignatures.some((s) => s.signer === partialTx.from?.address)) {
          throw new HardkasError(
            "SIGNER_MISMATCH",
            `The threshold is reached without the plan's from ${String(partialTx.from?.address)}: a plan is authorized only by the account that owns its from`
          );
        }
        draft.signedTransaction = {
          format: SYNTHETIC_AUTHORIZATION_FORMAT,
          payload: boundPlanArtifactId
        };
        draft.txId = syntheticTxIdFor(boundPlanArtifactId);
      } else {
        delete draft.signedTransaction;
        delete draft.txId;
      }

      const { CURRENT_HASH_VERSION } = await import("@hardkas/artifacts");
      const hash = calculateContentHash(draft, CURRENT_HASH_VERSION);
      draft.signedId = `signed-${hash.slice(0, 16)}`;
      draft.contentHash = hash;
      if (draft.lineage) draft.lineage.artifactId = hash;

      signedArtifact = draft;
    } else if (plan.schema === HardkasSchemas.TxPlan) {
      if (actualOptions.append) {
        throw new Error(
          "Do not use --append for the first signature of a transaction plan."
        );
      }

      const threshold = actualOptions.threshold || 1;

      if (threshold > 1) {
        // Multisig first signature
        const signerAddress = resolvedAccount?.address;
        if (!signerAddress) {
          throw new Error(`Signer account '${resolvedAccount?.name}' has no address.`);
        }

        const requiredSignersList = actualOptions.requiredSigners || [signerAddress];
        const requiredSigners = [];
        for (const r of requiredSignersList) {
          const acc = await this.sdk.accounts.resolve(r);
          requiredSigners.push(acc.address || r);
        }

        if (!requiredSigners.includes(signerAddress)) {
          throw new Error(
            `Signer '${signerAddress}' is not an authorized signer for this transaction.`
          );
        }
        // IC-6′.2: a plan can only be authorized by the account that owns its `from`,
        // so a signer set that can never include it is refused up front.
        if (!requiredSigners.includes(plan.from.address)) {
          throw new HardkasError(
            "SIGNER_MISMATCH",
            `The required signers ${JSON.stringify(requiredSigners)} do not include the plan's from ${plan.from.address}`
          );
        }
        // IC-6′.1 / IC-4′.4: bind to the plan's FULL identity (never a legacy plan).
        const planArtifactId = authorizablePlanIdentity(plan);

        // IC-6′.4: a synthetic entry is never presented as a signature.
        const signatureEntry = {
          signer: signerAddress,
          kind: "synthetic" as const
        };

        const signatures = [signatureEntry].sort((a, b) =>
          deterministicCompare(a.signer, b.signer)
        );
        const signatureMetadata = [
          {
            signer: signerAddress,
            signedAt: new Date().toISOString()
          }
        ];

        const thresholdReached = signatures.length >= threshold;
        const finalStatus = thresholdReached ? "signed" : "partially_signed";

        const { HARDKAS_VERSION, ARTIFACT_VERSION, CURRENT_HASH_VERSION } =
          await import("@hardkas/artifacts");
        const draft: any = {
          schema: HardkasSchemas.SignedTx,
          schemaVersion: HardkasSchemas.ArtifactV1,
          hardkasVersion: HARDKAS_VERSION,
          version: ARTIFACT_VERSION,
          hashVersion: CURRENT_HASH_VERSION,
          createdAt: new Date().toISOString(),
          status: finalStatus,
          sourcePlanId: plan.planId,
          networkId: plan.networkId,
          mode: plan.mode,
          execution: (plan as any).execution || { mode: plan.mode as any, domain: "kaspa-l1", network: plan.networkId },
          from: plan.from,
          to: plan.to,
          amountSompi: plan.amountSompi,
          unsignedPayloadHash: plan.contentHash,
          // IC-6′.1/.3: plan reference and signer set in the authenticated body.
          authorization: {
            kind: "synthetic",
            planArtifactId,
            signers: signatures.map((s) => s.signer)
          },
          multisig: {
            threshold,
            requiredSigners,
            signatures
          },
          signatureMetadata,
          lineage: createLineageTransition(plan, HardkasSchemas.SignedTx),
          ...(plan.workflowId ? { workflowId: plan.workflowId } : {})
        };

        if (thresholdReached) {
          draft.signedTransaction = {
            format: SYNTHETIC_AUTHORIZATION_FORMAT,
            payload: planArtifactId
          };
          draft.txId = syntheticTxIdFor(planArtifactId);
        }

        // One pass: lineage.artifactId is a self reference excluded by exact path.
        const hash = calculateContentHash(draft, CURRENT_HASH_VERSION);
        draft.signedId = `signed-${hash.slice(0, 16)}`;
        draft.contentHash = hash;
        if (draft.lineage) draft.lineage.artifactId = hash;

        signedArtifact = draft;
      } else {
        const { resolveExecutionTarget } = await import("@hardkas/config");
        const target = (plan as any).execution || resolveExecutionTarget({ config: this.sdk.config.config, network: plan.networkId as string }).target;

        // Standard single-signature plan signing (maintains 100% backward compatibility)
        signedArtifact = await signTxPlanArtifact({
          target,
          planArtifact: plan,
          account: resolvedAccount as HardkasAccount,
          ...(actualAuthorizers ? { authorizers: actualAuthorizers } : {}),
          config: this.sdk.config.config,
          allowMainnet: false
        });
      }
    } else {
      throw new Error(`Unsupported artifact schema for signing: ${(plan as any).schema}`);
    }

    // Persist and emit events
    const { absolutePath } = await this.sdk.artifacts.write(signedArtifact);

    const { coreEvents } = await import("@hardkas/core");
    const signedRecord = signedArtifact as unknown as Record<string, string>;
    // IC-5′.11: events carry the canonical identity (content hash), never a label.
    const artifactId = signedRecord.contentHash || signedArtifact.signedId;

    coreEvents.normalizeAndEmit({
      kind: "artifact.created",
      schema: signedArtifact.schema,
      artifactId: artifactId,
      network: signedArtifact.networkId,
      mode: signedArtifact.mode,
      path: absolutePath
    } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);

    coreEvents.normalizeAndEmit({
      kind: "tx.signed",
      txId: signedArtifact.txId || artifactId,
      network: signedArtifact.networkId,
      mode: signedArtifact.mode,
      amountSompi: signedArtifact.amountSompi
    } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);

    // Fire non-blocking after hook
    // Do not await, or await but let plugin manager catch failure
    await this.sdk.plugins.onTxSigned({ planId, account: resolvedAccount?.name || "unknown", signedArtifact });

    return signedArtifact;
  }

  /**
   * Simulates a transaction on the local state without broadcasting to a real Kaspa node.
   * Modifies the local deterministic state and outputs receipt/trace artifacts.
   */
  /**
   * Wave 1.2 · IC-5′.10 / N5: a previous submission of the SAME executed artifact
   * (signed or plan) is found by that artifact's identity — a receipt whose
   * authenticated `lineage.parentArtifactId` is the executed artifact's contentHash —
   * verified, in FULL authentication scope (its `status` is authenticated), never by
   * txId and never by a status a legacy hash version did not cover.
   */
  private async findExistingSubmission(
    executedArtifactId: string
  ): Promise<{ receipt: TxReceiptArtifact; receiptPath: string } | null> {
    if (typeof executedArtifactId !== "string" || !/^[0-9a-f]{64}$/.test(executedArtifactId)) return null;
    const { enumerateWorkspaceArtifactsSync, verifyArtifactIntegritySync, TX_NAMESPACE_SCHEMAS } =
      await import("@hardkas/artifacts");
    const matches: Array<{ receipt: any; receiptPath: string }> = [];
    for (const entry of enumerateWorkspaceArtifactsSync(this.sdk.workspace.root)) {
      const a: any = entry.artifact;
      if (!TX_NAMESPACE_SCHEMAS.has(typeof a?.schema === "string" ? a.schema : "")) continue;
      if (a?.lineage?.parentArtifactId !== executedArtifactId) continue;
      const r = verifyArtifactIntegritySync(structuredClone(a), { strict: false });
      if (!r.ok || r.authScope !== "FULL") continue; // never decide on an unauthenticated status
      if (a.schema === HardkasSchemas.TxSubmissionV1) {
        // R-iii: a submission's authenticated submit result, never a status.
        if (a.submitResult?.accepted !== true) continue;
      } else if (a.status !== "accepted" && a.status !== "confirmed") {
        continue;
      }
      matches.push({ receipt: a, receiptPath: entry.path });
    }
    if (matches.length === 0) return null;
    matches.sort((x, y) => (x.receiptPath < y.receiptPath ? -1 : x.receiptPath > y.receiptPath ? 1 : 0));
    return matches[0]!;
  }

  async simulate(
    target: string | Partial<TxPlanArtifact> | SignedTxArtifact,
    options: { persist?: boolean; plan?: TxPlanArtifact } = {}
  ): Promise<{ receipt: TxReceiptArtifact; receiptPath?: string; tracePath?: string }> {
    const explicitPlan = options.plan;
    const isSignedTarget =
      typeof target === "object" && target !== null && (target as any).schema === ARTIFACT_SCHEMAS.SIGNED_TX;
    if (isSignedTarget) {
      // Wave 1.4 · IC-6′.2/.5: only a coherent synthetic authorization is executable.
      // A legacy simulated-format artifact is unbound (re-authorize); an
      // incoherent authorization (plan reference ≠ lineage parent ≠ txId, wrong
      // format, wrong signer set) is refused before anything is resolved.
      const binding = checkSyntheticAuthorization(target);
      if (!binding.ok) throw new HardkasError(binding.code, binding.message);
    }
    if (explicitPlan && isSignedTarget) {
      // An explicit plan must BE the plan the authorization names (IC-6′.1 / IC-5′.6).
      const { checkArtifactIdentity } = await import("@hardkas/artifacts");
      const check = checkArtifactIdentity(explicitPlan);
      const boundId = (target as any).authorization?.planArtifactId ?? (target as any).lineage?.parentArtifactId;
      if (!check.ok || check.artifactId !== boundId) {
        throw new HardkasError(
          "PARENT_PLAN_MISMATCH",
          `The supplied plan ${check.ok ? check.artifactId : "(unverifiable)"} is not the plan the signed artifact authorizes ${String(boundId)}`
        );
      }
    }
    if (typeof target === "object" && target !== null && (target as any).contentHash) {
      try {
        // Strict: references and lineage. An explicit plan is honoured only if it IS
        // the target's authenticated parent (identity-checked in the verifier, IC-5′.6).
        await this.sdk.artifacts.verify(target, {
          throwOnInvalid: true,
          strict: true,
          enforceMetadata: false,
          ...(explicitPlan ? { parent: explicitPlan } : {})
        });
      } catch (e: unknown) {
        if (((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)).includes("PARENT_MISSING")) {
          throw new Error("parent_plan_unresolved: Missing context plan for simulation.");
        }
        throw e;
      }
    }
    const persist = options.persist ?? true;
    if (typeof target === "object" && target !== null && typeof (target as any).contentHash === "string") {
      // Idempotency by the executed artifact's identity (IC-5′.10), never by txId.
      const existing = await this.findExistingSubmission((target as any).contentHash);
      if (existing) {
        return { receipt: existing.receipt, receiptPath: existing.receiptPath };
      }
    }
    const {
      loadOrCreateLocalnetState,
      saveLocalnetState,
      getDefaultLocalnetStatePath,
      applySimulatedPlan,
      saveSimulatedReceipt,
      saveSimulatedTrace
    } = await import("@hardkas/localnet");
    const path = await import("node:path");

    const state = await loadOrCreateLocalnetState({ cwd: this.sdk.workspace.root });

    const startTime = Date.now();
    const events: any[] = [
      { type: "phase.started", phase: "send", timestamp: startTime }
    ];

    let planArtifact: any;
    let signedId = "unknown";
    let sourcePlanId = "unknown";
    let txId: string;
    let targetObj: any = target;

    if (typeof target === "string") {
      try {
        targetObj = await this.sdk.artifacts.read(target, {
          expectedSchema: ARTIFACT_SCHEMAS.TX_PLAN
        });
      } catch (e) {
        throw new Error(
          `Artifact '${target}' not found. If you already have an in-memory artifact, pass the object directly to tx.simulate(artifact).`
        );
      }
    }

    if (targetObj.schema === ARTIFACT_SCHEMAS.SIGNED_TX) {
      signedId = targetObj.signedId || targetObj.id || "unknown";
      sourcePlanId = targetObj.sourcePlanId || "unknown";
      // Wave 1.4 · IC-6′.2: the plan is resolved ONLY by the artifactId the
      // authorization names (authenticated), from the store by verified identity —
      // never by the sourcePlanId label, never by the signed's own txId.
      const structural = checkSyntheticAuthorization(targetObj);
      if (!structural.ok) throw new HardkasError(structural.code, structural.message);
      const boundPlanId = structural.planArtifactId;
      if (explicitPlan) {
        // Identity already checked against authorization.planArtifactId above.
        planArtifact = explicitPlan;
      } else {
        try {
          planArtifact = await this.sdk.artifacts.read({ artifact: boundPlanId }, {
            expectedSchema: ARTIFACT_SCHEMAS.TX_PLAN
          });
        } catch (e) {
          throw new Error(`parent_plan_unresolved: ${(e as Error)?.message ?? String(e)}`);
        }
      }
      // The binding decided against the resolved plan: FULL identity, signer is the
      // plan's from, same transfer. Refuse to execute if anything fails.
      const binding = checkSyntheticAuthorization(targetObj, planArtifact);
      if (!binding.ok) throw new HardkasError(binding.code, binding.message);
      txId = binding.txId;
    } else {
      planArtifact = targetObj;
      sourcePlanId = planArtifact.planId || planArtifact.id || "unknown";

      // If persist is true and it's a new in-memory plan (no ID), we write it
      if (persist && !planArtifact.planId) {
        const savedPlanResult = await this.sdk.artifacts.write(planArtifact);
        sourcePlanId = planArtifact.planId || "unknown";
      }
      // D-Q2.a / N4: the synthetic txId IS the executed plan's identity.
      const planIdentity =
        typeof planArtifact.contentHash === "string" && /^[0-9a-f]{64}$/.test(planArtifact.contentHash)
          ? planArtifact.contentHash
          : calculateContentHash(planArtifact, CURRENT_HASH_VERSION);
      txId = syntheticTxIdFor(planIdentity);
    }

    const normalizedPlan = normalizeSimulatedPlanInput(planArtifact, sourcePlanId);

    // DEF-1c (Wave 1 continuation): produce ONE canonical receipt identity.
    // The prior implementation built a second `receiptBase` wrapper here with
    // its own contentHash — that wrapper never landed on disk yet was returned
    // to callers and emitted in events, causing artifact.created(schema=B) to
    // report path(A), plugin `receiptArtifact` divergence from the persisted
    // receipt, and verify PARENT_MISSING (because A's parentArtifactId was a
    // state hash, not an artifact hash).
    //
    // Fix: thread schema-owned lifecycle metadata into `applySimulatedPlan` →
    // `createSimulatedTxReceipt` so the canonical receipt produced in one
    // construction contains both execution evidence AND lifecycle metadata,
    // hashed once, persisted once, returned once, emitted once.
    //
    // Determinism: `submittedAt`/`confirmedAt` derive from `systemRuntimeContext.clock`,
    // matching the ctx used by createSimulatedTxReceipt for `createdAt`, so the
    // canonical receipt remains deterministic under replay.
    // `tracePath` is pre-computed from `txId` via the deterministic
    // `getTracePath` helper — no dependency on the receipt's own persisted
    // filename, which is written after hashing.
    const nowIso = new Date(systemRuntimeContext.clock.now()).toISOString();
    const { getTracePath } = await import("@hardkas/localnet");
    const precomputedTracePath = getTracePath(txId, this.sdk.workspace.root);

    // Parent artifact for the receipt lineage: the artifact that was actually
    // executed/submitted. If the caller passed a signed artifact, that is the
    // predecessor (and its signedId is captured via sourceSignedId per
    // TxReceiptSchema). Otherwise the plan is the predecessor.
    const isSignedInput =
      targetObj &&
      typeof targetObj === "object" &&
      (targetObj as any).schema === ARTIFACT_SCHEMAS.SIGNED_TX;
    const parentArtifactOverride = isSignedInput
      ? {
          contentHash: (targetObj as any).contentHash,
          lineage: (targetObj as any).lineage
        }
      : undefined;

    const simResult = applySimulatedPlan(
      state,
      normalizedPlan as any,
      systemRuntimeContext,
      {
        txId,
        receiptExtra: {
          submittedAt: nowIso,
          confirmedAt: nowIso,
          rpcUrl: "simulated://local",
          tracePath: precomputedTracePath,
          ...(isSignedInput && signedId !== "unknown" ? { sourceSignedId: signedId } : {}),
          ...(parentArtifactOverride ? { parentArtifact: parentArtifactOverride } : {})
        }
      }
    );

    if (!simResult.ok) {
      throw new Error(`Strict validation failed: ${simResult.errors?.join(", ")}`);
    }

    coreEvents.normalizeAndEmit({
      kind: "workflow.submitted",
      txId: simResult.receipt.txId,
      endpoint: "simulated://local"
    } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);

    events.push({ type: "phase.completed", phase: "send", timestamp: Date.now() });

    // The canonical receipt: single identity for the simulator lifecycle.
    // The `receipt` alias exists purely to keep downstream code paths readable
    // — it is the SAME object reference `simResult.receipt` returned by
    // `applySimulatedPlan`; no wrapping, no rehashing, no fork.
    const receipt = simResult.receipt as any;

    let receiptPath: string | undefined;
    if (persist) {
      await saveLocalnetState(
        simResult.state,
        getDefaultLocalnetStatePath(this.sdk.workspace.root)
      );
      receiptPath = await saveSimulatedReceipt(
        receipt as Parameters<typeof saveSimulatedReceipt>[0],
        { cwd: this.sdk.workspace.root }
      );
    }

    // Trace path stays consistent with the pre-computed value used inside the
    // canonical receipt's `tracePath` field. Both point at the deterministic
    // per-txId location the trace will be written to below.
    const tracePath = precomputedTracePath;

    // Convert events to steps
    const traceSteps = events.map((ev) => ({
      phase: ev.phase || ((ev as Record<string, unknown>).message as string) || "unknown",
      status: ev.type.includes("completed")
        ? "completed"
        : ev.type.includes("failed")
          ? "failed"
          : "started",
      timestamp: new Date(ev.timestamp).toISOString(),
      details:
        ev.type === "note"
          ? { message: (ev as Record<string, unknown>).message as string }
          : undefined
    }));

    // DEF-1a: the trace hangs off the CANONICAL receipt. Now that `receipt`
    // and the persisted simulator receipt are the same object with the same
    // contentHash (DEF-1c fix, above), the trace's parent hash unambiguously
    // resolves in the artifact store after process restart.
    const traceBase: any = {
      schema: ARTIFACT_SCHEMAS.TX_TRACE,
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      createdAt: receipt.createdAt,
      txId: receipt.txId,
      mode: receipt.mode ?? "simulator",
      networkId: receipt.networkId,
      steps: traceSteps,
      // The raw events are part of the evidence and therefore of the hashed body
      // (under v5 nothing nested is dropped by name); receiptPath is an
      // operational locator and stays outside the hash by contract.
      events,
      ...(receipt.workflowId ? { workflowId: receipt.workflowId } : {}),
      ...(receipt.assumptionLevel ? { assumptionLevel: receipt.assumptionLevel } : {}),
      lineage: {
        artifactId: "",
        lineageId: receipt.lineage?.lineageId || receipt.contentHash || "0".repeat(64),
        parentArtifactId: receipt.contentHash || "0".repeat(64),
        rootArtifactId: receipt.lineage?.rootArtifactId || receipt.contentHash || "0".repeat(64),
        sequence: (receipt.lineage?.sequence || 1) + 1
      }
    };
    // One pass: lineage.artifactId is a self reference excluded by exact path.
    traceBase.contentHash = calculateContentHash(traceBase, CURRENT_HASH_VERSION);
    if (traceBase.lineage) traceBase.lineage.artifactId = traceBase.contentHash;

    if (persist) {
      await saveSimulatedTrace(
        {
          ...traceBase,
          receiptPath: receiptPath!
        },
        { cwd: this.sdk.workspace.root }
      );
    }

    // P1.1 Emit dashboard/query-store events for local/simulated transactions
    if (persist) {
      coreEvents.normalizeAndEmit({
        kind: "artifact.created",
        schema: receipt.schema,
        artifactId: receipt.txId,
        network: receipt.networkId,
        mode: receipt.mode,
        path: receiptPath!
      } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);
    }

    coreEvents.normalizeAndEmit({
      kind: "tx.submitted",
      txId: receipt.txId,
      network: receipt.networkId,
      mode: receipt.mode,
      amountSompi: receipt.amountSompi,
      feeSompi: receipt.feeSompi
    } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);
    const result: {
      receipt: TxReceiptArtifact;
      receiptPath?: string;
      tracePath?: string;
    } = { receipt };
    if (receiptPath) result.receiptPath = receiptPath;
    if (tracePath) result.tracePath = tracePath;

    return result;
  }

  /**
   * Sends a signed transaction to the real RPC network.
   */
  async send(
    signedArtifact: SignedTxArtifact,
    urlOrOptions?: string | { persist?: boolean; plan?: TxPlanArtifact }
  ): Promise<{
    /**
     * The artifact this send produced: a simulated `hardkas.txReceipt` in the
     * simulator, or the immutable `hardkas.txSubmission.v1` for a real broadcast
     * (R-iii part 1). Read `submission` for the typed real-send record.
     */
    receipt: TxReceiptArtifact | TxSubmissionArtifact;
    submission?: TxSubmissionArtifact;
    receiptPath?: string;
    artifactId?: string;
    mode?: string;
    simulated?: boolean;
    submitted?: boolean;
    txId?: string;
  }> {
    const activeNetwork = this.sdk.config.config.defaultNetwork || "simnet";
    const isExplicitRpc =
      typeof urlOrOptions === "string" &&
      (urlOrOptions.startsWith("ws://") ||
        urlOrOptions.startsWith("http://") ||
        urlOrOptions.startsWith("wss://") ||
        urlOrOptions.startsWith("https://"));
    const isSimulated =
      !isExplicitRpc &&
      (activeNetwork === "simulated" ||
        this.sdk.config.config.networks?.[activeNetwork]?.kind === "simulated");

    if (isSimulated) {
      // Wave 1.4 · IC-6′.5: in the simulator only a coherent synthetic authorization
      // is executable; a legacy simulated-format artifact is refused with the
      // code that says to re-authorize. Decided before anything else is consulted.
      const binding = checkSyntheticAuthorization(signedArtifact);
      if (!binding.ok) throw new HardkasError(binding.code, binding.message);
    }

    if (
      typeof signedArtifact === "object" &&
      signedArtifact !== null &&
      (signedArtifact as any).contentHash
    ) {
      try {
        await this.sdk.artifacts.verify(signedArtifact as any, {
          throwOnInvalid: true,
          strict: true,
          enforceMetadata: false
        });
      } catch (e: unknown) {
        if (((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)).includes("PARENT_MISSING")) {
          throw new Error("parent_plan_unresolved: Missing context plan for simulation.");
        }
        throw e;
      }
    }

    // Perform pre-broadcast semantic verification (VULN-05)
    const verification = verifySignedTxSemantics(signedArtifact);
    if (!verification.ok) {
      throw new Error(
        `Pre-broadcast semantic verification failed: ${verification.issues.map((i) => i.message).join(", ")}`
      );
    }

    const signedTxId = signedArtifact.txId || signedArtifact.signedId || signedArtifact.contentHash || "unknown";
    await this.sdk.plugins.onBeforeTxSend({ signedTxId, from: signedArtifact.from?.accountName || signedArtifact.from?.address || "unknown" });

    if (isSimulated) {
      const persistOpt = typeof urlOrOptions === "object" ? urlOrOptions.persist : true;
      const explicitPlan = typeof urlOrOptions === "object" ? urlOrOptions.plan : undefined;
      const simOpts = {
        ...(persistOpt !== undefined ? { persist: persistOpt } : {}),
        ...(explicitPlan ? { plan: explicitPlan } : {})
      };

      let simResult: any;
      try {
        simResult = await this.simulate(signedArtifact, simOpts);
      } catch (e: unknown) {
        if (((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)) && ((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)).includes("invalid simulated input")) {
          // P1. Robust Idempotence: The UTXOs are already spent. Wave 1.2 · IC-5′.10 / N5:
          // only a verified receipt whose authenticated parent IS this signed artifact
          // counts; a receipt merely carrying the expected txId never does.
          const existing = await this.findExistingSubmission(signedArtifact.contentHash as string);
          if (existing) {
            return {
              mode: "simulator",
              simulated: true,
              submitted: false,
              txId: (existing.receipt as any).txId,
              artifactId: (existing.receipt as any).contentHash,
              receipt: existing.receipt as any,
              receiptPath: existing.receiptPath
            };
          }
        }
        throw e; // Re-throw if it wasn't an idempotent double-spend
      }

      const result: any = {
        mode: "simulator",
        simulated: true,
        submitted: false,
        txId: simResult.receipt.txId,
        // IC-5′.11: artifactId is the canonical identity, never a label or the txId.
        artifactId: (simResult.receipt as any).contentHash,
        receipt: simResult.receipt
      };

      if (simResult.receiptPath !== undefined) {
        result.receiptPath = simResult.receiptPath;
      }

      return result;
    }

    const url = typeof urlOrOptions === "string" ? urlOrOptions : undefined;

    // R-iii part 1 (IC-2′.2): a submission records what HardKAS did against ONE
    // identified signed artifact. Without a verifiable identity there is nothing
    // to record the broadcast against, so nothing is broadcast.
    const { checkArtifactIdentity } = await import("@hardkas/artifacts");
    const signedIdentity = checkArtifactIdentity(signedArtifact);
    if (!signedIdentity.ok) {
      throw new HardkasError(
        "SUBMISSION_UNIDENTIFIED_SIGNED",
        `Refusing to broadcast: the signed artifact has no verifiable identity to record the submission against (${signedIdentity.issues.map((i) => i.code).join(", ")})`
      );
    }
    const signedArtifactId = signedIdentity.artifactId;

    const broadcastable = getBroadcastableSignedTransaction(signedArtifact);

    // Wave 2(a): the observer's cursor — where the virtual was when HardKAS submitted.
    // A fact about the submit (authenticated), never a post-send state. Best effort:
    // a node that cannot answer leaves it absent, and the observer falls back to the
    // pruning point.
    let submitPoint: { virtualDaaScore: string; sinkHash: string; sinkBlueScore: string } | undefined;
    try {
      const dag = await this.sdk.rpc.getBlockDagInfo();
      const sinkRaw: any = await this.sdk.rpc.getSinkBlueScore();
      const sinkBlueScore = BigInt(sinkRaw?.blueScore ?? sinkRaw);
      if (typeof dag.sink === "string" && dag.sink.length > 0) {
        submitPoint = { virtualDaaScore: BigInt(dag.virtualDaaScore ?? 0).toString(), sinkHash: dag.sink, sinkBlueScore: sinkBlueScore.toString() };
      }
    } catch {
      submitPoint = undefined;
    }

    // Wave 2(d) · AUD-18: the fee is derived from what the signed transaction consumes
    // (the plan's authenticated inputs, matched by outpoint) minus what it produces
    // (the signed outputs). Without that evidence the submission says so; it never
    // copies an estimate and never writes "0".
    // Before pricing anything, the signed transaction must BE the transaction the plan
    // authorized (inputs 1:1, outputs in order with amount and destination). A payload
    // that parses and diverges is refused here — nothing is broadcast and no
    // submission is written (2(d) security review: SIGNED_PLAN_MISMATCH).
    let feeEvidence: Extract<ReturnType<typeof deriveSubmissionFee>, { status: "derived" | "insufficient-evidence" }>;
    {
      let plan: any;
      const parentId = (signedArtifact as any).lineage?.parentArtifactId;
      if (typeof parentId === "string" && /^[0-9a-f]{64}$/.test(parentId)) {
        try {
          plan = await this.sdk.artifacts.read({ artifact: parentId }, { expectedSchema: ARTIFACT_SCHEMAS.TX_PLAN });
        } catch {
          plan = undefined;
        }
      }
      const derived = deriveSubmissionFee({ signedTransaction: signedArtifact.signedTransaction, plan });
      if (derived.status === "mismatch") {
        throw new HardkasError(
          "SIGNED_PLAN_MISMATCH",
          `Refusing to broadcast: the signed transaction is not the transaction plan ${String(plan?.contentHash)} authorized (${derived.reason})`
        );
      }
      feeEvidence = derived;
    }

    // Attempt broadcast
    const broadcastRecord = broadcastable.rawTransaction as unknown as Record<
      string,
      unknown
    >;
    const localTxId = (broadcastRecord.id as string) || "unknown";
    coreEvents.normalizeAndEmit({
      kind: "workflow.submitted",
      txId: localTxId,
      endpoint: url || "real"
    } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);

    // The submit call's result is recorded as returned, accepted or not.
    let submitResult: { accepted: boolean; transactionId?: string; error?: string };
    try {
      const answer: any = await this.sdk.rpc.submitTransaction(broadcastable.rawTransaction as any);
      submitResult = {
        accepted: answer?.accepted !== false,
        ...(typeof answer?.transactionId === "string" ? { transactionId: answer.transactionId } : {})
      };
    } catch (e: unknown) {
      submitResult = { accepted: false, error: e instanceof Error ? e.message : String(e) };
    }

    // DEF-1b: `mode` describes the EXECUTION SEMANTICS of the lifecycle, fixed
    // at plan/sign time. It is NOT a property of the transport (URL scheme).
    // Inherit `mode` from the signed parent (and its `execution.mode` if
    // declared); fall back to the URL-derived heuristic only when the parent
    // lacks an explicit mode (legacy pre-M10 signed artifacts).
    const inheritedMode: any =
      (signedArtifact as any).mode ||
      (signedArtifact as any).execution?.mode ||
      (isExplicitRpc ? "rpc" : "localnet");
    const nowIso = new Date().toISOString();
    // Authenticated: the signed reference, the txId, the submit result (IC-2′.2).
    // Unauthenticated: submittedAt and the raw locator `rpcUrl` (IC-1′.1b). The
    // normalised `endpoint` is ARCHITECTURE_BLOCKED (its normalisation is not
    // ratified), so no `endpoint` field is written and the endpoint provenance of
    // a submission is NOT authenticated yet. No post-send state lives here.
    const submissionBase: any = {
      schema: HardkasSchemas.TxSubmissionV1,
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      networkId: this.sdk.network,
      mode: inheritedMode,
      createdAt: nowIso,
      ...(signedArtifact.execution ? { execution: signedArtifact.execution } : {}),
      signedArtifactId,
      txId: submitResult.transactionId || localTxId,
      submitResult,
      ...(submitPoint ? { submitPoint } : {}),
      fee: feeEvidence,
      submittedAt: nowIso,
      ...(url ? { rpcUrl: url } : {}),
      ...(signedArtifact.workflowId ? { workflowId: signedArtifact.workflowId } : {}),
      ...(signedArtifact.assumptionLevel
        ? { assumptionLevel: signedArtifact.assumptionLevel }
        : {}),
      ...(signedArtifact.policyRefs ? { policyRefs: signedArtifact.policyRefs } : {}),
      ...(signedArtifact.networkProfileRef
        ? { networkProfileRef: signedArtifact.networkProfileRef }
        : {}),
      ...(signedArtifact.assumptionRef
        ? { assumptionRef: signedArtifact.assumptionRef }
        : {}),
      lineage: createLineageTransition(signedArtifact, HardkasSchemas.TxSubmissionV1)
    };
    // One pass: lineage.artifactId is a self reference excluded by exact path.
    submissionBase.contentHash = calculateContentHash(submissionBase, CURRENT_HASH_VERSION);
    submissionBase.lineage.artifactId = submissionBase.contentHash;
    const submission: TxSubmissionArtifact = Object.freeze(submissionBase);

    const { absolutePath } = await this.sdk.artifacts.write(submission);
    const receiptPath = absolutePath;

    // Reuse the signedTxId from the start of the method
    await this.sdk.plugins.onTxSent({ signedTxId, receiptArtifact: submission });

    return {
      receipt: submission,
      submission,
      ...(receiptPath ? { receiptPath } : {}),
      artifactId: submission.contentHash as string,
      mode: "real",
      submitted: submitResult.accepted,
      txId: submission.txId
    };
  }

  /**
   * Explicitly appends a signature to a partially signed transaction.
   */
  async appendSignature(
    plan: SignedTxArtifact,
    account?: HardkasAccount | string
  ): Promise<SignedTxArtifact> {
    return this.sign(plan, account, { append: true });
  }

  /**
   * Fetches the current status of a transaction by ID.
   */
  /**
   * Wave 2(a) · Q4: the DERIVED state of `txId` from the evidence in this workspace
   * (the submission or simulator receipt plus every verified observation), under
   * `policy` (HardKAS product default unless given). No RPC call is made here; use
   * `observe()` to add evidence.
   */
  async status(txId: string, policy?: TxStatusPolicy): Promise<DerivedTxStatus> {
    const { ProjectArtifactStore } = await import("@hardkas/artifacts");
    const store = new ProjectArtifactStore(this.sdk.workspace.root);
    const submission = await this.findSubmissionForTxId(txId);
    const { observations } = store.listObservationsByTxId(txId);
    return deriveTxStatus({
      txId,
      ...(submission ? { submission } : {}),
      observations,
      ...(policy ? { policy } : {})
    });
  }
}

