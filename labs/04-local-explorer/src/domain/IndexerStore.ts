import { 
    PaymentReceiptArtifactV1, 
    TxReceiptArtifactV1,
    HardkasArtifactBase 
} from '@hardkas/artifacts';

export interface AddressHistoryItem {
    txId: string;
    timestamp: number;
    amountSompi: bigint;
    isSend: boolean;
}

export interface Utxo {
    transactionId: string;
    outputIndex: number;
    amountSompi: bigint;
    scriptPublicKey: string;
}

export class IndexerStore {
    // Projections
    public readonly artifacts: Map<string, HardkasArtifactBase> = new Map();
    public readonly paymentReceiptsByInvoice: Map<string, PaymentReceiptArtifactV1> = new Map();
    public readonly paymentReceiptsByMerchant: Map<string, PaymentReceiptArtifactV1[]> = new Map();
    
    // Address Projections
    public readonly addressBalances: Map<string, bigint> = new Map();
    public readonly addressUtxos: Map<string, Utxo[]> = new Map();
    public readonly addressHistory: Map<string, AddressHistoryItem[]> = new Map();

    // Transactions Index
    public readonly transactions: Map<string, any> = new Map();

    constructor() {}

    /**
     * Ingest a single artifact and update projections synchronously.
     * In a real persistent store, this would be an atomic transaction.
     */
    public ingestArtifact(artifact: any) {
        // We use stringified hash or random ID if contentHash is not set
        const artifactId = artifact.contentHash || `in-memory-${Date.now()}-${Math.random()}`;
        this.artifacts.set(artifactId, artifact);

        if (artifact.schema === "hardkas.paymentReceipt.v1") {
            const receipt = artifact as PaymentReceiptArtifactV1;
            
            // Index by invoiceId
            this.paymentReceiptsByInvoice.set(receipt.invoiceId, receipt);
            
            // Index by merchantId
            if (!this.paymentReceiptsByMerchant.has(receipt.merchantId)) {
                this.paymentReceiptsByMerchant.set(receipt.merchantId, []);
            }
            this.paymentReceiptsByMerchant.get(receipt.merchantId)!.push(receipt);

            // Index transaction
            this.transactions.set(receipt.txId, receipt);

            // Update address balances (assuming they received funds)
            const addr = receipt.paymentAddress;
            const currentBal = this.addressBalances.get(addr) || 0n;
            this.addressBalances.set(addr, currentBal + BigInt(receipt.amountFoundSompi));

            // Create a fake UTXO for the explorer
            if (!this.addressUtxos.has(addr)) {
                this.addressUtxos.set(addr, []);
            }
            this.addressUtxos.get(addr)!.push({
                transactionId: receipt.txId,
                outputIndex: 0,
                amountSompi: BigInt(receipt.amountFoundSompi),
                scriptPublicKey: "mock_script"
            });

            // Update history
            if (!this.addressHistory.has(addr)) {
                this.addressHistory.set(addr, []);
            }
            this.addressHistory.get(addr)!.push({
                txId: receipt.txId,
                timestamp: receipt.paidAt,
                amountSompi: BigInt(receipt.amountFoundSompi),
                isSend: false // Receiving funds
            });
        }
        
        // Handling TxReceiptV1
        if (artifact.schema === "hardkas.txReceipt.v1") {
            const receipt = artifact as TxReceiptArtifactV1;
            this.transactions.set(receipt.txId, receipt);

            // Update balances
            // Decrease sender
            const sender = receipt.from.address;
            const senderBal = this.addressBalances.get(sender) || 0n;
            this.addressBalances.set(sender, senderBal - BigInt(receipt.amountSompi) - BigInt(receipt.feeSompi));

            if (!this.addressHistory.has(sender)) this.addressHistory.set(sender, []);
            this.addressHistory.get(sender)!.push({
                txId: receipt.txId,
                timestamp: Date.now(), // Fallback if submittedAt missing
                amountSompi: BigInt(receipt.amountSompi),
                isSend: true
            });

            // Increase receiver
            const receiver = receipt.to.address;
            const receiverBal = this.addressBalances.get(receiver) || 0n;
            this.addressBalances.set(receiver, receiverBal + BigInt(receipt.amountSompi));

            if (!this.addressHistory.has(receiver)) this.addressHistory.set(receiver, []);
            this.addressHistory.get(receiver)!.push({
                txId: receipt.txId,
                timestamp: Date.now(),
                amountSompi: BigInt(receipt.amountSompi),
                isSend: false
            });
        }
    }

    public getBalance(address: string): bigint {
        return this.addressBalances.get(address) || 0n;
    }

    public getUtxos(address: string): Utxo[] {
        return this.addressUtxos.get(address) || [];
    }

    public getHistory(address: string): AddressHistoryItem[] {
        return this.addressHistory.get(address) || [];
    }
}
