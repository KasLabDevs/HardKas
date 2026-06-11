import { systemRuntimeContext, deterministicCompare } from "@hardkas/core";
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
  TxPlanArtifact,
  getDefaultReceiptPath,
  writeArtifact,
  createLineageTransition,
  createTxPlanArtifact,
  readTxReceiptArtifact,
  HARDKAS_VERSION,
  ARTIFACT_VERSION,
  getBroadcastableSignedTransaction
} from "@hardkas/artifacts";
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
    if (target.mode !== "simulated") {
      throw new Error(
        "Cannot simulate real signed artifact without parent plan. Missing plan inputs data."
      );
    }

    return {
      schema: ARTIFACT_SCHEMAS.TX_PLAN,
      planId: target.planId || target.sourcePlanId || fallbackId,
      networkId: target.networkId || "simnet",
      mode: "simulated",
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
export class HardkasTx {
  constructor(private sdk: Hardkas) {}

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

    const activeNetwork = this.sdk.config.config.defaultNetwork || "simnet";
    const allowMainnet =
      (this.sdk.config.config.networks?.mainnet as any)?.allowMainnet === true;

    // Address Preflight Validation
    validateAddressNetwork(fromAccount.address, activeNetwork, allowMainnet);
    validateAddressNetwork(toAccount.address, activeNetwork, allowMainnet);
    if ((options as any).changeAddress) {
      validateAddressNetwork((options as any).changeAddress, activeNetwork, allowMainnet);
    }

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
          const rpcUtxos = await this.sdk.rpc.getUtxosByAddress(address);
          return rpcUtxos.map((u) => ({
            outpoint: {
              transactionId: u.outpoint.transactionId,
              index: u.outpoint.index
            },
            address: u.address,
            amountSompi: BigInt(u.amountSompi),
            scriptPublicKey: u.scriptPublicKey || "",
            blockDaaScore:
              u.blockDaaScore !== undefined ? BigInt(u.blockDaaScore) : undefined,
            isCoinbase: u.isCoinbase
          }));
        }
      },
      getVirtualDaaScore: async () => {
        try {
          const dagInfo = await this.sdk.rpc.getBlockDagInfo();
          return dagInfo.virtualDaaScore;
        } catch {
          return undefined as any;
        }
      }
    };

    const planService = new TxPlanService(utxoProvider);
    const result = await planService.planTransaction({
      fromAddress: fromAccount.address,
      toAddress: toAccount.address,
      amountSompi,
      ...(options.feeRate !== undefined ? { feeRate: options.feeRate } : {})
    });

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
      mode: isSimulated ? "simulated" : "real",
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
        utxoSelection: result.utxoSelection
      }
    }) as unknown as TxPlanArtifact;

    // Resolve alias to immutable contentHash
    if (options.policy || (options as any).policies) {
      const inputPolicies =
        (options as any).policies || (options.policy ? [options.policy] : []);
      const resolvedRefs: string[] = [];
      for (const p of inputPolicies) {
        try {
          const pol = await this.sdk.artifacts.read(p);
          resolvedRefs.push(pol.contentHash || pol.artifactId || p);
        } catch (e) {
          resolvedRefs.push(p); // Fallback to raw if not found
        }
      }
      if (resolvedRefs.length > 0) {
        (basePlan as any).policyRefs = resolvedRefs;
        (basePlan as any).policyRef = resolvedRefs[0]; // Legacy fallback
      }
    }

    if (options.networkProfile) {
      try {
        const net = await this.sdk.artifacts.read(options.networkProfile);
        (basePlan as any).networkProfileRef =
          net.contentHash || net.artifactId || options.networkProfile;
      } catch (e) {
        (basePlan as any).networkProfileRef = options.networkProfile;
      }
    }

    if (options.assumption) {
      try {
        const asm = await this.sdk.artifacts.read(options.assumption);
        (basePlan as any).assumptionRef =
          asm.contentHash || asm.artifactId || options.assumption;
      } catch (e) {
        (basePlan as any).assumptionRef = options.assumption;
      }
    }

    // Re-calculate hash now that references are injected
    const { CURRENT_HASH_VERSION, calculateContentHash } =
      await import("@hardkas/artifacts");
    const newHash = calculateContentHash(basePlan, CURRENT_HASH_VERSION);
    (basePlan as any).contentHash = newHash;
    if ((basePlan as any).lineage) {
      (basePlan as any).lineage.lineageId = newHash;
      (basePlan as any).lineage.parentArtifactId = ""; // Root plans have no parent
      (basePlan as any).lineage.rootArtifactId = newHash;
      const finalHash = calculateContentHash(basePlan, CURRENT_HASH_VERSION);
      (basePlan as any).contentHash = finalHash;
      (basePlan as any).lineage.artifactId = finalHash;
      (basePlan as any).planId = `plan-${finalHash.slice(0, 16)}`;
    }

    this.sdk.artifacts.cacheArtifact(basePlan);

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

    if (!resolvedAccount.address) {
      throw new Error(
        `Account '${resolvedAccount.name || options.account}' has no address.`
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
    const planService = new TxPlanService(dummyProvider);
    const result = await planService.planConsolidation({
      fromAddress: resolvedAccount.address as string,
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
      mode: isSimulated ? "simulated" : "real",
      from: {
        input: resolvedAccount.name || (resolvedAccount.address as string),
        address: resolvedAccount.address as string,
        accountName: resolvedAccount.name
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

    const { CURRENT_HASH_VERSION, calculateContentHash } =
      await import("@hardkas/artifacts");
    const newHash = calculateContentHash(basePlan, CURRENT_HASH_VERSION);
    (basePlan as any).contentHash = newHash;
    if ((basePlan as any).lineage) {
      (basePlan as any).lineage.lineageId = newHash;
      (basePlan as any).lineage.parentArtifactId = "";
      (basePlan as any).lineage.rootArtifactId = newHash;
      const finalHash = calculateContentHash(basePlan, CURRENT_HASH_VERSION);
      (basePlan as any).contentHash = finalHash;
      (basePlan as any).lineage.artifactId = finalHash;
      (basePlan as any).planId = `plan-${finalHash.slice(0, 16)}`;
    }

    this.sdk.artifacts.cacheArtifact(basePlan);

    return basePlan;
  }

  /**
   * Signs a transaction plan.
   */
  async sign(
    plan: TxPlanArtifact | SignedTxArtifact,
    account?: HardkasAccount | string,
    options?: {
      append?: boolean;
      threshold?: number;
      requiredSigners?: string[];
    }
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

    if (plan.schema !== HardkasSchemas.TxPlan && plan.schema !== HardkasSchemas.SignedTx) {
      const e = new Error(`TX_ARTIFACT_SCHEMA_INVALID: Unsupported artifact schema for signing: ${(plan as any).schema}`);
      (e as any).code = "TX_ARTIFACT_SCHEMA_INVALID";
      throw e;
    }

    if (typeof plan === "object" && plan !== null && (plan as any).contentHash) {
      await this.sdk.artifacts.verify(plan, {
        throwOnInvalid: true,
        strict: true,
        enforceMetadata: false
      });
    }

    if (this.sdk.signer && plan.schema === HardkasSchemas.TxPlan) {
      const signedArtifact = await this.sdk.signer.signTransaction(
        plan as TxPlanArtifact
      );

      const { absolutePath } = await this.sdk.artifacts.write(signedArtifact);
      const { coreEvents } = await import("@hardkas/core");
      const signedRecord = signedArtifact as unknown as Record<string, string>;
      const artifactId =
        signedRecord.artifactId || signedArtifact.signedId || signedRecord.contentHash;

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

    let resolvedAccount: HardkasAccount;
    if (typeof account === "string") {
      resolvedAccount = await this.sdk.accounts.resolve(account);
    } else if (account) {
      resolvedAccount = account;
    } else {
      const fromName =
        (plan as any).from?.accountName ||
        (plan as any).from?.input ||
        (plan as any).from?.address;
      if (!fromName)
        throw new Error(
          "Plan does not specify an account name and no account was provided for signing."
        );
      resolvedAccount = await this.sdk.accounts.resolve(fromName);
    }

    let signedArtifact: any;

    if (plan.schema === HardkasSchemas.SignedTx) {
      // 1. Validate append intention
      if (plan.status === "signed") {
        throw new Error(
          "Cannot append signature to an already completed signed transaction."
        );
      }
      if (options?.append === undefined && plan.status === "partially_signed") {
        // Auto-detect append
        options = { ...options, append: true };
      }
      if (!options?.append) {
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

      const signerAddress = resolvedAccount.address;
      if (!signerAddress) {
        throw new Error(`Signer account '${resolvedAccount.name}' has no address.`);
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

      // Generate signature
      const signatureEntry = {
        signer: signerAddress,
        signature: `simulated-signature-of-${signerAddress}`
      };

      // Append signature and sort alphabetically by signer address to ensure deterministic hash
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
        multisig: {
          ...partialTx.multisig,
          signatures: newSignatures
        },
        signatureMetadata: newMeta,
        lineage: createLineageTransition(partialTx, HardkasSchemas.SignedTx)
      };

      if (thresholdReached) {
        draft.signedTransaction = {
          format: "simulated",
          payload: `simulated-signed-tx:${partialTx.sourcePlanId}-with-${newSignatures.map((s) => s.signer).join(",")}`
        };
        draft.txId = `simulated-${partialTx.sourcePlanId}-tx`;
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
      if (options?.append) {
        throw new Error(
          "Do not use --append for the first signature of a transaction plan."
        );
      }

      const threshold = options?.threshold || 1;

      if (threshold > 1) {
        // Multisig first signature
        const signerAddress = resolvedAccount.address;
        if (!signerAddress) {
          throw new Error(`Signer account '${resolvedAccount.name}' has no address.`);
        }

        const requiredSignersList = options?.requiredSigners || [signerAddress];
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

        const signatureEntry = {
          signer: signerAddress,
          signature: `simulated-signature-of-${signerAddress}`
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
          from: plan.from,
          to: plan.to,
          amountSompi: plan.amountSompi,
          unsignedPayloadHash: plan.contentHash,
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
            format: "simulated",
            payload: `simulated-signed-tx:${plan.planId}-with-${signatures.map((s) => s.signer).join(",")}`
          };
          draft.txId = `simulated-${plan.planId}-tx`;
        }

        let hash = calculateContentHash(draft, CURRENT_HASH_VERSION);
        draft.signedId = `signed-${hash.slice(0, 16)}`;
        draft.contentHash = hash;
        if (draft.lineage) {
          draft.lineage.artifactId = hash;
          // Re-hash because lineage is now included in v4
          hash = calculateContentHash(draft, CURRENT_HASH_VERSION);
          draft.contentHash = hash;
          draft.lineage.artifactId = hash;
        }

        signedArtifact = draft;
      } else {
        if (resolvedAccount.address !== plan.from.address) {
          throw new Error(
            `Signer account '${resolvedAccount.address}' is not authorized to sign for '${plan.from.address}'.`
          );
        }
        // Standard single-signature plan signing (maintains 100% backward compatibility)
        signedArtifact = await signTxPlanArtifact({
          planArtifact: plan,
          account: resolvedAccount,
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
    const artifactId =
      signedRecord.artifactId || signedArtifact.signedId || signedRecord.contentHash;

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

  /**
   * Simulates a transaction on the local state without broadcasting to a real Kaspa node.
   * Modifies the local deterministic state and outputs receipt/trace artifacts.
   */
  async simulate(
    target: string | Partial<TxPlanArtifact> | SignedTxArtifact,
    options: { persist?: boolean } = {}
  ): Promise<{ receipt: TxReceiptArtifact; receiptPath?: string; tracePath?: string }> {
    if (typeof target === "object" && target !== null && (target as any).contentHash) {
      try {
        await this.sdk.artifacts.verify(target, {
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
    const persist = options.persist ?? true;
    if (typeof target === "object" && target !== null) {
      const checkTxId =
        (target as any).txId ||
        ((target as any).schema === ARTIFACT_SCHEMAS.SIGNED_TX
          ? `simulated-${(target as any).sourcePlanId || "unknown"}-tx`
          : `simulated-${(target as any).planId || (target as any).id || "unknown"}-tx`);
      if (checkTxId) {
        try {
          const existingReceipt = await this.sdk.artifacts.read(checkTxId, {
            expectedSchema: ARTIFACT_SCHEMAS.TX_RECEIPT
          });
          if (existingReceipt && existingReceipt.schema === ARTIFACT_SCHEMAS.TX_RECEIPT) {
            const receiptPath = getDefaultReceiptPath(checkTxId, this.sdk.config.cwd);
            return { receipt: existingReceipt, receiptPath };
          }
        } catch (e) {
          // Proceed with simulation
        }
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
    let txId = `simulated-tx-${Date.now()}`;
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
      txId = targetObj.txId || `simulated-${sourcePlanId}-tx`;
      planArtifact = this.sdk.artifacts.getCached(sourcePlanId);
      if (!planArtifact) {
        try {
          planArtifact = await this.sdk.artifacts.read(sourcePlanId, {
            expectedSchema: ARTIFACT_SCHEMAS.TX_PLAN
          });
        } catch (e) {
          throw new Error("parent_plan_unresolved");
        }
      }
    } else {
      planArtifact = targetObj;
      sourcePlanId = planArtifact.planId || planArtifact.id || "unknown";
      txId = `simulated-${sourcePlanId}-tx`;

      // If persist is true and it's a new in-memory plan (no ID), we write it
      if (persist && !planArtifact.planId) {
        const savedPlanResult = await this.sdk.artifacts.write(planArtifact);
        sourcePlanId = planArtifact.planId || "unknown";
      }
    }

    const normalizedPlan = normalizeSimulatedPlanInput(planArtifact, sourcePlanId);

    const simResult = applySimulatedPlan(
      state,
      normalizedPlan as any,
      systemRuntimeContext,
      { txId }
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

    let receiptPath: string | undefined;
    if (persist) {
      await saveLocalnetState(
        simResult.state,
        getDefaultLocalnetStatePath(this.sdk.workspace.root)
      );
      receiptPath = await saveSimulatedReceipt(
        simResult.receipt as Parameters<typeof saveSimulatedReceipt>[0],
        { cwd: this.sdk.workspace.root }
      );
    }

    // Pre-determine trace path for immutability and hermetic sealing (VULN-03)
    const tracePath = receiptPath
      ? receiptPath.replace(".json", ".trace.json")
      : undefined;
    const activeNetwork = this.sdk.config.config.defaultNetwork || "simnet";
    const isSimulated =
      activeNetwork === "simulated" ||
      this.sdk.config.config.networks?.[activeNetwork]?.kind === "simulated";

    // Create unified receipt
    const receiptBase: any = {
      schema: ARTIFACT_SCHEMAS.TX_RECEIPT,
      schemaVersion: HardkasSchemas.TxReceiptV1,
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      networkId: activeNetwork,
      mode: isSimulated ? "simulated" : "real",
      createdAt: new Date().toISOString(),
      status: "confirmed",
      txId: simResult.receipt.txId,
      sourceSignedId: signedId,
      from: { address: planArtifact.from?.address || "unknown" },
      to: { address: planArtifact.to?.address || "unknown" },
      amountSompi: planArtifact.amountSompi || "0",
      feeSompi: simResult.receipt.feeSompi?.toString() || "0",
      changeSompi: simResult.receipt.changeSompi?.toString() || "0",
      spentUtxoIds: simResult.receipt.spentUtxoIds,
      createdUtxoIds: simResult.receipt.createdUtxoIds,
      daaScore: simResult.receipt.daaScore?.toString() || "0",
      preStateHash: simResult.receipt.preStateHash,
      postStateHash: simResult.receipt.postStateHash,
      submittedAt: simResult.receipt.createdAt,
      confirmedAt: simResult.receipt.createdAt,
      rpcUrl: "simulated://local",
      tracePath,
      ...(planArtifact.workflowId ? { workflowId: planArtifact.workflowId } : {}),
      ...(planArtifact.assumptionLevel
        ? { assumptionLevel: planArtifact.assumptionLevel }
        : {}),
      ...(planArtifact.policyRefs ? { policyRefs: planArtifact.policyRefs } : {}),
      ...(planArtifact.networkProfileRef
        ? { networkProfileRef: planArtifact.networkProfileRef }
        : {}),
      ...(planArtifact.assumptionRef
        ? { assumptionRef: planArtifact.assumptionRef }
        : {}),
      lineage: {
        artifactId: "", // To be computed
        lineageId:
          targetObj.lineage?.lineageId || targetObj.contentHash || "0".repeat(64),
        parentArtifactId: targetObj.contentHash || "0".repeat(64),
        rootArtifactId: targetObj.lineage?.rootArtifactId || "0".repeat(64),
        sequence: (targetObj.lineage?.sequence || 1) + 1
      }
    };
    receiptBase.contentHash = calculateContentHash(receiptBase, CURRENT_HASH_VERSION);
    if (receiptBase.lineage) {
      receiptBase.lineage.artifactId = receiptBase.contentHash;
      receiptBase.contentHash = calculateContentHash(receiptBase, CURRENT_HASH_VERSION);
      receiptBase.lineage.artifactId = receiptBase.contentHash;
    }
    const receipt: TxReceiptArtifact = Object.freeze(receiptBase);

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

    const traceBase: any = {
      schema: ARTIFACT_SCHEMAS.TX_TRACE,
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      createdAt: receipt.createdAt,
      txId: receipt.txId,
      mode: isSimulated ? "simulated" : "real",
      networkId: activeNetwork,
      steps: traceSteps
    };
    traceBase.contentHash = calculateContentHash(traceBase, CURRENT_HASH_VERSION);

    if (persist) {
      await saveSimulatedTrace(
        {
          ...traceBase,
          events,
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
      kind: "tx.confirmed",
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
    urlOrOptions?: string | { persist?: boolean }
  ): Promise<{
    receipt: TxReceiptArtifact;
    receiptPath?: string;
    artifactId?: string;
    mode?: string;
    simulated?: boolean;
    submitted?: boolean;
    txId?: string;
  }> {
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
      const persistOpt = typeof urlOrOptions === "object" ? urlOrOptions.persist : true;
      const simOpts = persistOpt !== undefined ? { persist: persistOpt } : {};

      let simResult: any;
      try {
        simResult = await this.simulate(signedArtifact, simOpts);
      } catch (e: unknown) {
        if (((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)) && ((e instanceof Error) ? ((e instanceof Error) ? ((e instanceof Error) ? e.message : String(e)) : String(e)) : String(e)).includes("invalid simulated input")) {
          // P1. Robust Idempotence: The UTXOs are already spent.
          // Check if they were spent by a previous simulation of this exact same transaction.
          try {
            const { loadSimulatedReceipt, getReceiptPath } =
              await import("@hardkas/localnet");
            const txIdToLoad =
              signedArtifact.txId || `simulated-${signedArtifact.sourcePlanId}-tx`;
            const existingReceipt = await loadSimulatedReceipt(txIdToLoad, {
              cwd: this.sdk.workspace.root
            });

            if (existingReceipt) {
              if (
                existingReceipt.schema === ARTIFACT_SCHEMAS.TX_RECEIPT &&
                (existingReceipt.status === "confirmed" ||
                  (existingReceipt.status as any) === "accepted")
              ) {
                return {
                  mode: "simulated",
                  simulated: true,
                  submitted: false,
                  txId: existingReceipt.txId,
                  artifactId: existingReceipt.txId, // simulated receipts use txId as artifactId
                  receipt: existingReceipt as any,
                  receiptPath: getReceiptPath(
                    existingReceipt.txId,
                    this.sdk.workspace.root
                  )
                };
              }
            }
          } catch (err) {
            // Silently ignore if receipt not found, re-throw the original error
          }
        }
        throw e; // Re-throw if it wasn't an idempotent double-spend
      }

      const result: any = {
        mode: "simulated",
        simulated: true,
        submitted: false,
        txId: simResult.receipt.txId,
        artifactId:
          (simResult.receipt as any).artifactId ??
          (simResult as any).artifactId ??
          (simResult.receipt as any).contentHash,
        receipt: simResult.receipt
      };

      if (simResult.receiptPath !== undefined) {
        result.receiptPath = simResult.receiptPath;
      }

      return result;
    }

    const url = typeof urlOrOptions === "string" ? urlOrOptions : undefined;

    const broadcastable = getBroadcastableSignedTransaction(signedArtifact);

    // Attempt broadcast
    const broadcastRecord = broadcastable.rawTransaction as unknown as Record<
      string,
      unknown
    >;
    const txId = (broadcastRecord.id as string) || "unknown";
    coreEvents.normalizeAndEmit({
      kind: "workflow.submitted",
      txId,
      endpoint: url || "real"
    } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);

    const result = await this.sdk.rpc.submitTransaction(broadcastable.rawTransaction);

    const realReceiptBase: any = {
      schema: ARTIFACT_SCHEMAS.TX_RECEIPT,
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      networkId: this.sdk.network,
      mode: "real",
      createdAt: new Date().toISOString(),
      status: result.accepted ? "submitted" : "failed",
      txId: result.transactionId || "failed",
      sourceSignedId: signedArtifact.signedId,
      from: { address: signedArtifact.from.address },
      to: { address: signedArtifact.to.address },
      amountSompi: signedArtifact.amountSompi,
      feeSompi: signedArtifact.metadata?.estimatedFeeSompi || "0",
      submittedAt: new Date().toISOString(),
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
      tracePath: undefined,
      lineage: createLineageTransition(signedArtifact, HardkasSchemas.TxReceipt)
    };
    realReceiptBase.contentHash = calculateContentHash(
      realReceiptBase,
      CURRENT_HASH_VERSION
    );
    if (realReceiptBase.lineage) {
      realReceiptBase.lineage.artifactId = realReceiptBase.contentHash;
      realReceiptBase.contentHash = calculateContentHash(
        realReceiptBase,
        CURRENT_HASH_VERSION
      );
      realReceiptBase.lineage.artifactId = realReceiptBase.contentHash;
    }
    const receipt: TxReceiptArtifact = realReceiptBase;

    const receiptPath = getDefaultReceiptPath(receipt.txId, this.sdk.config.cwd);
    await writeArtifact(receiptPath, receipt);

    return {
      receipt,
      receiptPath
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
  async status(txId: string): Promise<any> {
    const isLocal = txId.startsWith("simulated-");
    if (isLocal) {
      return { status: "simulated_confirmed" }; // Simplify for now
    }
    // Real network query
    const result = await this.sdk.rpc.getTransaction(txId);
    return result;
  }
}
