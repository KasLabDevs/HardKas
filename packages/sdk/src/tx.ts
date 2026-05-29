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
    from: string | HardkasAccount, 
    to: string | HardkasAccount, 
    amount: string | bigint,
    feeRate?: bigint
  }): Promise<TxPlanArtifact> {
    const fromAccount = typeof options.from === "string" ? await this.sdk.accounts.resolve(options.from) : options.from;
    const toAccount = typeof options.to === "string" ? await this.sdk.accounts.resolve(options.to) : options.to;
    
    if (!fromAccount.address) throw new Error(`From account ${fromAccount.name} has no address.`);
    if (!toAccount.address) throw new Error(`To account ${toAccount.name} has no address.`);

    const amountSompi = typeof options.amount === "string" 
      ? parseKasToSompi(options.amount) 
      : (typeof options.amount === "number" ? BigInt(options.amount) : options.amount);

    // Fetch UTXOs
    let builderUtxos: BuilderUtxo[] = [];
    if (this.sdk.network === "simulated") {
      // TODO: Extract a shared UtxoProvider / RuntimeBackend so HardkasTx 
      // does not depend directly on localnet implementation details.
      const { loadOrCreateLocalnetState, getSpendableUtxos } = await import("@hardkas/localnet");
      const localState = await loadOrCreateLocalnetState({ cwd: this.sdk.workspace.root });
      const unspent = getSpendableUtxos(localState, fromAccount.address);
      builderUtxos = unspent.map(u => {
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
      builderUtxos = rpcUtxos.map(u => ({
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
      outputs: [{
        address: toAccount.address,
        amountSompi
      }],
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
      ctx: systemRuntimeContext
    }) as unknown as TxPlanArtifact;
  }

  /**
   * Signs a transaction plan.
   */
  async sign(plan: TxPlanArtifact, account?: HardkasAccount | string): Promise<SignedTxArtifact> {
    let resolvedAccount: HardkasAccount;
    if (typeof account === "string") {
      resolvedAccount = await this.sdk.accounts.resolve(account);
    } else if (account) {
      resolvedAccount = account;
    } else {
      if (!plan.from.accountName) throw new Error("Plan does not specify an account name and no account was provided for signing.");
      resolvedAccount = await this.sdk.accounts.resolve(plan.from.accountName);
    }

    return signTxPlanArtifact({
      planArtifact: plan,
      account: resolvedAccount,
      config: this.sdk.config.config
    });
  }

  /**
   * Simulates a transaction on the local state without broadcasting to a real Kaspa node.
   * Modifies the local deterministic state and outputs receipt/trace artifacts.
   */
  async simulate(signedArtifact: SignedTxArtifact): Promise<{ receipt: TxReceiptArtifact; receiptPath: string; tracePath: string }> {
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
      { type: "phase.started", phase: "send", timestamp: startTime },
    ];

    const simResult = applySimulatedPayment(state, {
      from: signedArtifact.from.input || signedArtifact.from.address,
      to: signedArtifact.to.input || signedArtifact.to.address,
      amountSompi: BigInt(signedArtifact.amountSompi),
    }, systemRuntimeContext);

    coreEvents.normalizeAndEmit({
      kind: "workflow.submitted",
      txId: simResult.receipt.txId,
      endpoint: "simulated://local"
    } as unknown as Parameters<typeof coreEvents.normalizeAndEmit>[0]);

    events.push({ type: "phase.completed", phase: "send", timestamp: Date.now() });

    await saveLocalnetState(simResult.state);
    const receiptPath = await saveSimulatedReceipt(simResult.receipt as Parameters<typeof saveSimulatedReceipt>[0]);

    // Pre-determine trace path for immutability and hermetic sealing (VULN-03)
    const tracePath = receiptPath.replace(".json", ".trace.json");

    // Create unified receipt
    const receiptBase: any = {
      schema: ARTIFACT_SCHEMAS.TX_RECEIPT,
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
    const traceSteps = events.map(ev => ({
      phase: ev.phase || (ev as Record<string, unknown>).message as string || "unknown",
      status: ev.type.includes("completed") ? "completed" : ev.type.includes("failed") ? "failed" : "started",
      timestamp: new Date(ev.timestamp).toISOString(),
      details: ev.type === "note" ? { message: (ev as Record<string, unknown>).message as string } : undefined
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
      steps: traceSteps,
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
  async send(signedArtifact: SignedTxArtifact, url?: string): Promise<{ receipt: TxReceiptArtifact; receiptPath: string }> {
    // Perform pre-broadcast semantic verification (VULN-05)
    const verification = verifySignedTxSemantics(signedArtifact);
    if (!verification.ok) {
      throw new Error(`Pre-broadcast semantic verification failed: ${verification.issues.map(i => i.message).join(", ")}`);
    }

    const broadcastable = getBroadcastableSignedTransaction(signedArtifact);
    
    // Attempt broadcast
    const broadcastRecord = broadcastable.rawTransaction as unknown as Record<string, unknown>;
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
      txId: (result.transactionId || "failed"),
      sourceSignedId: signedArtifact.signedId,
      from: { address: signedArtifact.from.address },
      to: { address: signedArtifact.to.address },
      amountSompi: signedArtifact.amountSompi,
      feeSompi: signedArtifact.metadata?.estimatedFeeSompi || "0",
      submittedAt: new Date().toISOString(),
      ...(url ? { rpcUrl: url } : {})
    };
    realReceiptBase.contentHash = calculateContentHash(realReceiptBase, CURRENT_HASH_VERSION);
    const receipt: TxReceiptArtifact = realReceiptBase;

    const receiptPath = getDefaultReceiptPath(receipt.txId, this.sdk.config.cwd);
    await writeArtifact(receiptPath, receipt);

    return {
      receipt,
      receiptPath
    };
  }
}
