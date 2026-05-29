import { systemRuntimeContext } from "@hardkas/core";
import { Hardkas } from "./index.js";
import {
  buildPaymentPlan,
  Utxo as BuilderUtxo,
  verifySignedTxSemantics
} from "@hardkas/tx-builder";
import {
  TxPlanArtifact,
  SignedTxArtifact,
  TxReceiptArtifact,
  HARDKAS_VERSION,
  ARTIFACT_SCHEMAS,
  ARTIFACT_VERSION,
  CURRENT_HASH_VERSION,
  getBroadcastableSignedTransaction,
  writeArtifact,
  getDefaultReceiptPath,
  createTxPlanArtifact,
  readTxReceiptArtifact,
  calculateContentHash
} from "@hardkas/artifacts";
import { coreEvents } from "@hardkas/core";
import { HardkasAccount, signTxPlanArtifact } from "@hardkas/accounts";
import { parseKasToSompi, type NetworkId } from "@hardkas/core";

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
    amount: string | bigint;
    feeRate?: bigint;
    workflowId?: string;
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
          ? BigInt(options.amount)
          : options.amount;

    // Fetch UTXOs
    let builderUtxos: BuilderUtxo[] = [];
    if (this.sdk.network === "simulated") {
      // TODO: Extract a shared UtxoProvider / RuntimeBackend so HardkasTx
      // does not depend directly on localnet implementation details.
      const { loadOrCreateLocalnetState, getSpendableUtxos } =
        await import("@hardkas/localnet");
      const localState = await loadOrCreateLocalnetState({
        cwd: this.sdk.workspace.root
      });
      const unspent = getSpendableUtxos(localState, fromAccount.address);
      builderUtxos = unspent.map((u) => {
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
      const rpcUtxos = await this.sdk.rpc.getUtxosByAddress(fromAccount.address);
      builderUtxos = rpcUtxos.map((u) => ({
        outpoint: {
          transactionId: u.outpoint.transactionId,
          index: u.outpoint.index
        },
        address: u.address,
        amountSompi: u.amountSompi,
        scriptPublicKey: u.scriptPublicKey || ""
      }));
    }

    const builderPlan = buildPaymentPlan({
      fromAddress: fromAccount.address,
      availableUtxos: builderUtxos,
      outputs: [
        {
          address: toAccount.address,
          amountSompi
        }
      ],
      feeRateSompiPerMass: options.feeRate ?? 1n
    });

    return createTxPlanArtifact({
      networkId: this.sdk.network as NetworkId,
      mode: "simulated",
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
      ctx: options.workflowId
        ? { ...systemRuntimeContext, workflowId: options.workflowId }
        : systemRuntimeContext
    }) as unknown as TxPlanArtifact;
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

    if (plan.schema === "hardkas.signedTx") {
      // 1. Validate append intention
      if (plan.status === "signed") {
        throw new Error(
          "Cannot append signature to an already completed signed transaction."
        );
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
        a.signer.localeCompare(b.signer)
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
        lineage: {
          artifactId: "", // To be computed from contentHash
          lineageId:
            partialTx.lineage?.lineageId ||
            `lineage-${Math.random().toString(36).slice(2, 10)}`,
          parentArtifactId: partialTx.contentHash || partialTx.signedId,
          rootArtifactId: partialTx.lineage?.rootArtifactId || partialTx.sourcePlanId
        }
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
      if (draft.lineage) draft.lineage.artifactId = draft.signedId;

      signedArtifact = draft;
    } else if (plan.schema === "hardkas.txPlan") {
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

        const requiredSigners = options?.requiredSigners || [signerAddress];
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
          a.signer.localeCompare(b.signer)
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
          schema: "hardkas.signedTx",
          schemaVersion: "hardkas.artifact.v1",
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
          lineage: {
            artifactId: "", // To be computed
            lineageId:
              plan.lineage?.lineageId ||
              `lineage-${Math.random().toString(36).slice(2, 10)}`,
            parentArtifactId: plan.contentHash || plan.planId,
            rootArtifactId: plan.contentHash || plan.planId
          },
          ...(plan.workflowId ? { workflowId: plan.workflowId } : {})
        };

        if (thresholdReached) {
          draft.signedTransaction = {
            format: "simulated",
            payload: `simulated-signed-tx:${plan.planId}-with-${signatures.map((s) => s.signer).join(",")}`
          };
          draft.txId = `simulated-${plan.planId}-tx`;
        }

        const hash = calculateContentHash(draft, CURRENT_HASH_VERSION);
        draft.signedId = `signed-${hash.slice(0, 16)}`;
        draft.contentHash = hash;
        if (draft.lineage) draft.lineage.artifactId = draft.signedId;

        signedArtifact = draft;
      } else {
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
    signedArtifact: SignedTxArtifact
  ): Promise<{ receipt: TxReceiptArtifact; receiptPath: string; tracePath: string }> {
    const {
      loadOrCreateLocalnetState,
      saveLocalnetState,
      applySimulatedPayment,
      saveSimulatedReceipt,
      saveSimulatedTrace
    } = await import("@hardkas/localnet");
    const path = await import("node:path");

    const state = await loadOrCreateLocalnetState({ cwd: this.sdk.workspace.root });

    const startTime = Date.now();
    const events: any[] = [
      { type: "phase.started", phase: "send", timestamp: startTime }
    ];

    const simResult = applySimulatedPayment(
      state,
      {
        from: signedArtifact.from.input || signedArtifact.from.address,
        to: signedArtifact.to.input || signedArtifact.to.address,
        amountSompi: BigInt(signedArtifact.amountSompi)
      },
      systemRuntimeContext
    );

    coreEvents.normalizeAndEmit({
      kind: "workflow.submitted",
      txId: simResult.receipt.txId,
      endpoint: "simulated://local"
    } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);

    events.push({ type: "phase.completed", phase: "send", timestamp: Date.now() });

    await saveLocalnetState(simResult.state);
    const receiptPath = await saveSimulatedReceipt(
      simResult.receipt as Parameters<typeof saveSimulatedReceipt>[0]
    );

    // Pre-determine trace path for immutability and hermetic sealing (VULN-03)
    const tracePath = receiptPath.replace(".json", ".trace.json");

    // Create unified receipt
    const receiptBase: any = {
      schema: ARTIFACT_SCHEMAS.TX_RECEIPT,
      schemaVersion: "hardkas.receipt.v1",
      hardkasVersion: HARDKAS_VERSION,
      version: ARTIFACT_VERSION,
      hashVersion: CURRENT_HASH_VERSION,
      networkId: this.sdk.network,
      mode: "simulated",
      createdAt: new Date().toISOString(),
      status: "confirmed",
      txId: simResult.receipt.txId,
      sourceSignedId: signedArtifact.signedId,
      from: { address: signedArtifact.from.address },
      to: { address: signedArtifact.to.address },
      amountSompi: signedArtifact.amountSompi,
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
      tracePath
    };
    receiptBase.contentHash = calculateContentHash(receiptBase, CURRENT_HASH_VERSION);
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
      mode: "simulated",
      networkId: this.sdk.network,
      steps: traceSteps
    };
    traceBase.contentHash = calculateContentHash(traceBase, CURRENT_HASH_VERSION);

    await saveSimulatedTrace({
      ...traceBase,
      events,
      receiptPath
    });

    // P1.1 Emit dashboard/query-store events for local/simulated transactions
    coreEvents.normalizeAndEmit({
      kind: "artifact.created",
      schema: receipt.schema,
      artifactId: receipt.txId,
      network: receipt.networkId,
      mode: receipt.mode,
      path: receiptPath
    } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);

    coreEvents.normalizeAndEmit({
      kind: "tx.confirmed",
      txId: receipt.txId,
      network: receipt.networkId,
      mode: receipt.mode,
      amountSompi: receipt.amountSompi,
      feeSompi: receipt.feeSompi
    } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);

    return {
      receipt,
      receiptPath,
      tracePath
    };
  }

  /**
   * Sends a signed transaction to the real RPC network.
   */
  async send(
    signedArtifact: SignedTxArtifact,
    url?: string
  ): Promise<{ receipt: TxReceiptArtifact; receiptPath: string }> {
    // Perform pre-broadcast semantic verification (VULN-05)
    const verification = verifySignedTxSemantics(signedArtifact);
    if (!verification.ok) {
      throw new Error(
        `Pre-broadcast semantic verification failed: ${verification.issues.map((i) => i.message).join(", ")}`
      );
    }

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
      ...(signedArtifact.workflowId ? { workflowId: signedArtifact.workflowId } : {})
    };
    realReceiptBase.contentHash = calculateContentHash(
      realReceiptBase,
      CURRENT_HASH_VERSION
    );
    const receipt: TxReceiptArtifact = realReceiptBase;

    const receiptPath = getDefaultReceiptPath(receipt.txId, this.sdk.config.cwd);
    await writeArtifact(receiptPath, receipt);

    return {
      receipt,
      receiptPath
    };
  }
}
