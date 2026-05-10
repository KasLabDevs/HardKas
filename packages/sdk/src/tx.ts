import { Hardkas } from "./index.js";
import { 
  buildPaymentPlan, 
  Utxo as BuilderUtxo 
} from "@hardkas/tx-builder";
import { 
  TxPlanArtifact, 
  SignedTxArtifact, 
  TxReceiptArtifact, 
  HARDKAS_VERSION,
  getBroadcastableSignedTransaction,
  writeArtifact,
  getDefaultReceiptPath,
  createTxPlanArtifact,
  readTxReceiptArtifact,
  calculateContentHash
} from "@hardkas/artifacts";
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

    const amountSompi = typeof options.amount === "string" ? parseKasToSompi(options.amount) : options.amount;

    // Fetch UTXOs
    const rpcUtxos = await this.sdk.rpc.getUtxosByAddress(fromAccount.address);
    const builderUtxos: BuilderUtxo[] = rpcUtxos.map(u => ({
      outpoint: {
        transactionId: u.outpoint.transactionId,
        index: u.outpoint.index
      },
      address: u.address,
      amountSompi: u.amountSompi,
      scriptPublicKey: u.scriptPublicKey || ""
    }));

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
      plan: builderPlan
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
   * Sends a signed transaction.
   */
  async send(signed: SignedTxArtifact): Promise<TxReceiptArtifact> {
    const broadcastable = getBroadcastableSignedTransaction(signed);
    const result = await this.sdk.rpc.submitTransaction(broadcastable.rawTransaction);
    
    const txId = result.transactionId;
    if (!txId) throw new Error("Broadcast failed: RPC returned no transaction ID.");

    const receipt: any = {
      schema: "hardkas.txReceipt",
      hardkasVersion: HARDKAS_VERSION,
      version: "1.0.0-alpha",
      networkId: signed.networkId,
      mode: signed.mode,
      status: "accepted",
      createdAt: new Date().toISOString(),
      txId,
      from: {
        address: signed.from.address
      },
      to: {
        address: signed.to.address
      },
      amountSompi: String(signed.amountSompi),
      feeSompi: String((signed as any).estimatedFeeSompi || "0")
    };

    receipt.contentHash = calculateContentHash(receipt);

    // Auto-save receipt
    const receiptPath = getDefaultReceiptPath(txId, this.sdk.config.cwd);
    await writeArtifact(receiptPath, receipt);

    return {
      ...receipt,
      receiptPath
    } as any;
  }
}
