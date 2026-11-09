import { ApproxGhostdagEngine, DEFAULT_K } from "../ghostdag/ghostdag-engine.js";
import { GhostdagStore, genesisGhostdagData } from "../ghostdag/ghostdag-store.js";
import { GENESIS_HASH, type BlockHash } from "../ghostdag/ghostdag-types.js";
import { KaspaHasher, bytesToHex } from "../crypto/kaspa-sighash.js";
import { extractAddressFromScriptPublicKey } from "../ledger/script-engine.js";
import { UtxoLedger } from "../ledger/utxo-ledger.js";
import { Mempool } from "../mempool/mempool.js";
import { checkMassCommitment } from "../mass.js";
import { getNetworkPrefix } from "../crypto/accounts.js";
import type { KaspaRpcTransaction, SimulatorBlock, NetworkId, SimulatorUtxo } from "../types.js";

export const DEFAULT_BLOCK_REWARD_SOMPI = 500n * 100_000_000n; // 500 KAS

/** UTXOs a block created and spent (what the simulator's RPC server relays as utxos-changed). */
export interface BlockUtxoDiff {
  readonly added: SimulatorUtxo[];
  readonly removed: SimulatorUtxo[];
}

function hexToBytes(s: string): Uint8Array {
  const bytes = new Uint8Array(s.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(s.substring(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

/**
 * SIM-07 point 9 · block validation of the storage-mass commitment (rusty-kaspa 2.1.0 tx_validation_in_utxo_context.rs
 * `check_mass_commitment`, TxRuleError::WrongMass): every transaction of a block commits the storage mass calculated from
 * the UTXOs it spends, the ledger's or those created by an earlier transaction of the same block. The simulator's mempool
 * sets that mass (as the node's), so a mismatch means a corrupted entry; the block is refused before anything is applied,
 * with the node's message. An input the ledger cannot resolve is not checked here (no missing-outpoint rule at block
 * assembly, as before); the mempool refused such inputs on entry. The simulator has no submitBlock: this is the only path
 * that turns transactions into a block.
 */
export function assertBlockMassCommitments(
  transactions: ReadonlyArray<{ readonly transactionId: string; readonly transaction: KaspaRpcTransaction }>,
  ledger: UtxoLedger
): void {
  const createdInBlock = new Map<string, SimulatorUtxo>();
  for (const { transactionId, transaction } of transactions) {
    const spent: SimulatorUtxo[] = [];
    for (const inp of transaction.inputs) {
      const { transactionId: prevId, index } = inp.previousOutpoint;
      const u = createdInBlock.get(UtxoLedger.outpointKey(prevId, index)) ?? ledger.getUtxo(prevId, index);
      if (u) spent.push(u);
    }
    if (spent.length === transaction.inputs.length) {
      const verdict = checkMassCommitment(transaction, spent);
      if (!verdict.ok) {
        const err = new Error(`${verdict.code}: ${verdict.error}`);
        (err as any).code = verdict.code;
        (err as any).transactionId = transactionId;
        throw err;
      }
    }
    transaction.outputs.forEach((out, index) => {
      createdInBlock.set(UtxoLedger.outpointKey(transactionId, index), {
        transactionId,
        index,
        address: "",
        amountSompi: BigInt(out.amount),
        scriptPublicKey: out.scriptPublicKey.scriptPublicKey,
        blockDaaScore: 0n,
        isCoinbase: false,
        ...(out.covenant ? { covenant: out.covenant } : {})
      });
    });
  }
}

/**
 * The simulator's block DAG: an approximate GHOSTDAG (see ghostdag-engine.ts; no consensus equivalence is claimed),
 * blocks made of the mempool's selection, and acceptance as Kaspa reports it.
 *
 * Acceptance (SIM-13): a block's transactions are accepted by the chain block that merges it (its mergeset: the selected
 * parent and the other merged blocks), never by the block that contains them. `acceptedTransactionIds` of a block are
 * the ids of the transactions of its mergeset; its own transactions are `transactionIds`. The ledger applies a block's
 * transactions when it is mined, as the node's virtual UTXO set does for the sink's (the virtual merges the sink).
 */
export class DagChain {
  private gdEngine: ApproxGhostdagEngine;
  private gdStore: GhostdagStore;
  private blocksByHash = new Map<string, SimulatorBlock>();
  private utxoDiffs = new Map<string, BlockUtxoDiff>();
  private tipHashes: string[] = [];
  private virtualDaaScore: bigint = 1n;
  private networkId: NetworkId;
  private blockRewardSompi: bigint;
  private readonly k: number;

  constructor(options?: {
    k?: number;
    networkId?: NetworkId;
    initialDaaScore?: bigint;
    blockRewardSompi?: bigint;
  }) {
    this.networkId = options?.networkId ?? "simnet";
    this.k = options?.k ?? DEFAULT_K;
    this.gdEngine = new ApproxGhostdagEngine(this.k, GENESIS_HASH);
    this.gdStore = new GhostdagStore();
    this.blockRewardSompi = options?.blockRewardSompi ?? DEFAULT_BLOCK_REWARD_SOMPI;
    this.virtualDaaScore = options?.initialDaaScore ?? 1n;

    this.initGenesis();
  }

  private initGenesis(): void {
    const genesisData = genesisGhostdagData(GENESIS_HASH);
    this.gdStore.insert(GENESIS_HASH, genesisData);

    const genesisBlock: SimulatorBlock = {
      header: {
        hash: GENESIS_HASH,
        version: 1,
        parents: [],
        selectedParent: GENESIS_HASH,
        blueScore: 0n,
        blueWork: 0n,
        daaScore: 0n,
        timestampMs: 0,
        bits: 1000,
        nonce: 0
      },
      transactions: [],
      transactionIds: [],
      acceptedTransactionIds: []
    };

    this.blocksByHash.set(GENESIS_HASH, genesisBlock);
    this.tipHashes = [GENESIS_HASH];
  }

  public getVirtualDaaScore(): bigint {
    return this.virtualDaaScore;
  }

  public getTipHashes(): ReadonlyArray<string> {
    return [...this.tipHashes];
  }

  public getBlock(hash: string): SimulatorBlock | undefined {
    return this.blocksByHash.get(hash);
  }

  public getAllBlocks(): SimulatorBlock[] {
    return Array.from(this.blocksByHash.values());
  }

  public getSink(): string {
    return this.tipHashes[0] || GENESIS_HASH;
  }

  public getBlueScore(): bigint {
    const sink = this.getSink();
    return BigInt(this.gdStore.getBlueScore(sink) ?? 0);
  }

  /** The UTXOs a mined block created and spent (empty for genesis and unknown blocks). */
  public getUtxoDiff(hash: string): BlockUtxoDiff {
    return this.utxoDiffs.get(hash) ?? { added: [], removed: [] };
  }

  /**
   * Past median time (ms) of the virtual: the median timestamp of the last 11 selected-chain blocks. An approximation
   * (rusty-kaspa samples a larger DAA window); with no mined block yet, the wall clock.
   */
  public getPastMedianTimeMs(): bigint {
    const chain = this.getSelectedChain(this.getSink()).slice(-11).map((b) => b.header.timestampMs).sort((a, b) => a - b);
    if (chain.length === 0) return BigInt(Date.now());
    return BigInt(chain[Math.floor(chain.length / 2)]!);
  }

  /** The ids of the transactions a block contains (coinbase first). */
  public containedTransactionIds(block: SimulatorBlock): ReadonlyArray<string> {
    return block.transactionIds ?? [];
  }

  /**
   * The chain block that accepted `txId` (it merges the block containing it), with the containing block; undefined
   * while the containing block is not merged yet (it is the sink, or off the selected chain).
   */
  public findAcceptance(txId: string): { containingBlockHash: string; acceptingBlockHash?: string } | undefined {
    const id = txId.toLowerCase();
    let containing: SimulatorBlock | undefined;
    for (const b of this.blocksByHash.values()) {
      if (this.containedTransactionIds(b).includes(id)) {
        containing = b;
        break;
      }
    }
    if (!containing) return undefined;
    const chain = this.getSelectedChain(this.getSink());
    const accepting = chain.find((b) => b.acceptedTransactionIds.includes(id));
    return { containingBlockHash: containing.header.hash, ...(accepting ? { acceptingBlockHash: accepting.header.hash } : {}) };
  }

  /**
   * Mines a block containing unconfirmed mempool transactions and awards fees + subsidy to miner.
   */
  public mineBlock(
    minerAddress: string,
    minerScriptPublicKey: string,
    mempool: Mempool,
    ledger: UtxoLedger,
    explicitParents?: string[]
  ): SimulatorBlock {
    const mempoolTxs = mempool.selectTransactionsForBlock();
    assertBlockMassCommitments(mempoolTxs.map((m) => ({ transactionId: m.transactionId, transaction: m.transaction })), ledger);
    let totalFeesSompi = 0n;
    for (const m of mempoolTxs) {
      totalFeesSompi += m.feeSompi;
    }

    const parents = explicitParents && explicitParents.length > 0 ? explicitParents : this.tipHashes.slice(0, 16);
    const gdData = this.gdEngine.ghostdag(parents, this.gdStore);

    const daaScore = this.virtualDaaScore;
    const timestampMs = Date.now();
    // SIM-14: the hash depends only on the DAG's history (DAA score, how many blocks precede it, parents and the
    // transactions it carries), never on the clock, so the same history always gives the same block hashes.
    const h = new KaspaHasher("BlockHash");
    h.u64(daaScore);
    h.u64(BigInt(this.blocksByHash.size));
    for (const p of parents) h.bytes(hexToBytes(p));
    for (const m of mempoolTxs) h.bytes(hexToBytes(m.transactionId));
    const blockHash = bytesToHex(h.digest());

    this.gdStore.insert(blockHash, gdData, parents);

    const coinbaseAmount = this.blockRewardSompi + totalFeesSompi;
    // Simulator-only coinbase id (not the consensus id of the coinbase transaction below; documented divergence).
    const coinbaseTxId = bytesToHex(
      new KaspaHasher("TransactionID")
        .u64(daaScore)
        .bytes(hexToBytes(blockHash))
        .digest()
    );

    const coinbaseTx: KaspaRpcTransaction = {
      version: 0,
      inputs: [],
      outputs: [
        {
          amount: coinbaseAmount,
          scriptPublicKey: {
            version: 0,
            scriptPublicKey: minerScriptPublicKey
          }
        }
      ],
      lockTime: 0n,
      subnetworkId: "00".repeat(20),
      gas: 0n,
      payload: "636f696e62617365"
    };

    const coinbaseUtxo: SimulatorUtxo = {
      transactionId: coinbaseTxId,
      index: 0,
      address: minerAddress,
      amountSompi: coinbaseAmount,
      scriptPublicKey: minerScriptPublicKey,
      blockDaaScore: daaScore,
      isCoinbase: true
    };
    ledger.addUtxo(coinbaseUtxo);

    const added: SimulatorUtxo[] = [coinbaseUtxo];
    const removed: SimulatorUtxo[] = [];
    const prefix = getNetworkPrefix(this.networkId);
    const containedTxIds: string[] = [coinbaseTxId];

    // The mempool selection is in dependency order (a transaction after the in-mempool transactions it spends).
    for (const m of mempoolTxs) {
      const tx = m.transaction;
      for (const inp of tx.inputs) {
        const spent = ledger.spendUtxo(inp.previousOutpoint.transactionId, inp.previousOutpoint.index);
        if (spent) removed.push(spent);
      }

      for (let outIndex = 0; outIndex < tx.outputs.length; outIndex++) {
        const out = tx.outputs[outIndex]!;
        const spk = out.scriptPublicKey.scriptPublicKey;
        let outAddress = (out as any).address;
        if (!outAddress) {
          outAddress = extractAddressFromScriptPublicKey(spk, prefix) || "";
        }

        const newUtxo: SimulatorUtxo = {
          transactionId: m.transactionId,
          index: outIndex,
          address: outAddress,
          amountSompi: BigInt(out.amount),
          scriptPublicKey: spk,
          blockDaaScore: daaScore,
          isCoinbase: false,
          ...(out.scriptPublicKey.version ? { scriptPublicKeyVersion: Number(out.scriptPublicKey.version) } : {}),
          ...((out as any).covenant ? { covenant: (out as any).covenant } : {})
        };
        ledger.addUtxo(newUtxo);
        added.push(ledger.getUtxo(newUtxo.transactionId, newUtxo.index) ?? newUtxo);
      }

      mempool.removeTransaction(m.transactionId);
      containedTxIds.push(m.transactionId);
    }

    // Accepted by this block: the transactions of the blocks it merges (selected parent first, then the other blues,
    // then the reds), as the node's acceptance data lists them.
    const acceptedTxIds: string[] = [];
    for (const merged of [...gdData.mergesetBlues, ...gdData.mergesetReds]) {
      const b = this.blocksByHash.get(merged);
      if (b) acceptedTxIds.push(...this.containedTransactionIds(b));
    }

    const block: SimulatorBlock = {
      header: {
        hash: blockHash,
        version: 1,
        parents,
        selectedParent: gdData.selectedParent,
        blueScore: BigInt(gdData.blueScore),
        blueWork: gdData.blueWork,
        daaScore,
        timestampMs,
        bits: 1000,
        nonce: 0
      },
      transactions: [coinbaseTx, ...mempoolTxs.map((m) => m.transaction)],
      transactionIds: containedTxIds,
      acceptedTransactionIds: acceptedTxIds
    };

    this.blocksByHash.set(blockHash, block);
    this.utxoDiffs.set(blockHash, { added, removed });

    const parentSet = new Set(parents);
    this.tipHashes = this.tipHashes.filter((t) => !parentSet.has(t));
    this.tipHashes.unshift(blockHash);

    // Sort tips by blueWork descending so tipHashes[0] is always the heaviest sink
    this.tipHashes.sort((a, b) => {
      const wa = this.gdStore.getBlueWork(a) ?? 0n;
      const wb = this.gdStore.getBlueWork(b) ?? 0n;
      return wa > wb ? -1 : (wa < wb ? 1 : 0);
    });

    this.virtualDaaScore += 1n;

    return block;
  }

  /**
   * Retrieves the selected chain of blocks from `tipHash` backwards to GENESIS.
   * Returned in chronological order (earliest block after genesis first, tip last).
   */
  public getSelectedChain(tipHash: string): SimulatorBlock[] {
    const chain: SimulatorBlock[] = [];
    let curr: string | undefined = tipHash;
    const visited = new Set<string>();

    while (curr && curr !== GENESIS_HASH && !visited.has(curr)) {
      visited.add(curr);
      const b = this.blocksByHash.get(curr);
      if (!b) break;
      chain.unshift(b);
      curr = b.header.selectedParent;
    }
    return chain;
  }

  /** A copy with the same blocks, tips, DAA score and GHOSTDAG data (SIM-14: the GHOSTDAG store is copied too). */
  public clone(): DagChain {
    const next = new DagChain({
      k: this.k,
      networkId: this.networkId,
      initialDaaScore: this.virtualDaaScore,
      blockRewardSompi: this.blockRewardSompi
    });
    for (const [hash, block] of this.blocksByHash) {
      next.blocksByHash.set(hash, { ...block });
      const gd = this.gdStore.getData(hash as BlockHash);
      if (gd) next.gdStore.insert(hash, gd, [...(this.gdStore.getParents(hash) ?? block.header.parents)]);
      const diff = this.utxoDiffs.get(hash);
      if (diff) next.utxoDiffs.set(hash, diff);
    }
    next.tipHashes = [...this.tipHashes];
    return next;
  }

  /**
   * Restores blocks, tips and DAA score from a snapshot. GHOSTDAG data the store already holds for a block is kept
   * (SIM-14: it used to be overwritten with empty mergesets); only blocks the store never saw get a minimal entry.
   */
  public restoreFrom(blocks: ReadonlyArray<SimulatorBlock>, tipHashes: ReadonlyArray<string>, daaScore: bigint): void {
    this.blocksByHash.clear();
    for (const b of blocks) {
      this.blocksByHash.set(b.header.hash, { ...b });
      if (this.gdStore.has(b.header.hash)) continue;
      const parents = [...b.header.parents];
      this.gdStore.insert(
        b.header.hash,
        {
          blueScore: Number(b.header.blueScore),
          blueWork: b.header.blueWork,
          selectedParent: b.header.selectedParent,
          mergesetBlues: [b.header.selectedParent],
          mergesetReds: [],
          bluesAnticoneSizes: [0]
        },
        parents
      );
    }
    for (const hash of [...this.utxoDiffs.keys()]) if (!this.blocksByHash.has(hash)) this.utxoDiffs.delete(hash);
    this.tipHashes = [...tipHashes];
    this.virtualDaaScore = daaScore;
  }
}
