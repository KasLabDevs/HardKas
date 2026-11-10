export type NetworkId = "mainnet" | "testnet-10" | "testnet-11" | "simnet" | "devnet";

export interface SimulatorConfig {
  readonly networkId?: NetworkId;
  readonly k?: number;
  readonly automine?: boolean;
  readonly defaultFeeRate?: bigint;
  readonly coinbaseMaturity?: bigint;
  readonly initialDaaScore?: bigint;
  readonly defaultBlockRewardSompi?: bigint;
  readonly bootstrapDevAccounts?: boolean;
}

export interface DevAccount {
  readonly name: string;
  readonly address: string;
  readonly publicKey: string; // 32-byte x-only Schnorr public key hex (64 chars)
  readonly privateKey: string; // 32-byte private key hex (64 chars)
  readonly scriptPublicKey: string; // "20" + pubkey + "ac"
}

export interface SimulatorUtxo {
  readonly transactionId: string;
  readonly index: number;
  readonly address: string;
  readonly amountSompi: bigint;
  readonly scriptPublicKey: string;
  readonly blockDaaScore: bigint;
  readonly isCoinbase: boolean;
  readonly covenant?: { readonly authorizingInput: number; readonly covenantId: string } | undefined;
  /**
   * The covenant id the UTXO carries (UtxoEntry.covenant_id), filled by UtxoLedger.addUtxo from `covenant` when absent.
   * The authorizing input of the output that created it is not a property of the UTXO.
   */
  readonly covenantId?: string | undefined;
  /** The script public key version (`scriptPublicKey` is then the bare script). Treated as 0 when absent. */
  readonly scriptPublicKeyVersion?: number | undefined;
}

export interface Outpoint {
  readonly transactionId: string;
  readonly index: number;
}

export interface ScriptPublicKey {
  readonly version: number;
  readonly scriptPublicKey: string;
}

export interface TransactionInput {
  readonly previousOutpoint: Outpoint;
  readonly signatureScript: string;
  readonly sequence: bigint | number;
  readonly sigOpCount?: number;
  /** v1 compute budget (ComputeCommit::ComputeBudget); the input may consume budget * 10 000 + 9 999 script units. */
  readonly computeBudget?: number;
}

export interface TransactionOutput {
  readonly amount: bigint | number | string;
  readonly scriptPublicKey: ScriptPublicKey;
  readonly covenant?: {
    readonly authorizingInput: number;
    readonly covenantId: string;
  };
}

export interface KaspaRpcTransaction {
  readonly id?: string;
  readonly version: number;
  readonly inputs: ReadonlyArray<TransactionInput>;
  readonly outputs: ReadonlyArray<TransactionOutput>;
  readonly lockTime: bigint | number | string;
  readonly subnetworkId: string;
  readonly gas: bigint | number | string;
  readonly payload: string;
  readonly mass?: bigint | number | string;
}

export interface MempoolTransaction {
  readonly transactionId: string;
  readonly transaction: KaspaRpcTransaction;
  readonly mass: bigint;
  readonly feeSompi: bigint;
  readonly feeRate: number; // sompi per mass unit
  readonly addedAtDaaScore: bigint;
  readonly spentOutpoints: ReadonlyArray<string>; // "txId:index"
}

export interface BlockHeader {
  readonly hash: string;
  readonly version: number;
  readonly parents: ReadonlyArray<string>;
  readonly selectedParent: string;
  readonly blueScore: bigint;
  readonly blueWork: bigint;
  readonly daaScore: bigint;
  readonly timestampMs: number;
  readonly bits: number;
  readonly nonce: number;
}

export interface SimulatorBlock {
  readonly header: BlockHeader;
  readonly transactions: ReadonlyArray<KaspaRpcTransaction>;
  /** Ids of the transactions this block contains, in the order of `transactions` (coinbase first). */
  readonly transactionIds?: ReadonlyArray<string>;
  /** Ids this block accepts: the transactions of the blocks it merges (never its own; see DagChain). */
  readonly acceptedTransactionIds: ReadonlyArray<string>;
}

export interface BlockDagInfo {
  readonly networkId: NetworkId;
  readonly blockCount: bigint;
  readonly headerCount: bigint;
  readonly tipHashes: ReadonlyArray<string>;
  readonly difficulty: number;
  readonly pastMedianTime: bigint;
  readonly virtualParentHashes: ReadonlyArray<string>;
  readonly pruningPointHash: string;
  readonly virtualDaaScore: bigint;
  readonly sink: string;
}

export interface SimulatorSnapshot {
  readonly id: string;
  readonly daaScore: bigint;
  readonly blueScore: bigint;
  readonly utxos: ReadonlyArray<SimulatorUtxo>;
  readonly mempool: ReadonlyArray<MempoolTransaction>;
  readonly blocks: ReadonlyArray<SimulatorBlock>;
  readonly tipHashes: ReadonlyArray<string>;
  readonly timestampMs: number;
}
