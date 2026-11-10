import { EventEmitter } from "node:events";
import { SIMULATOR_NODE_EXPECTATION } from "@hardkas/core";
import { GENESIS_HASH } from "../ghostdag/ghostdag-types.js";
import { UtxoLedger } from "../ledger/utxo-ledger.js";
import { Mempool } from "../mempool/mempool.js";
import { DagChain } from "../dag/dag-chain.js";
import type { DevAccount, SimulatorBlock } from "../types.js";
import type {
  KaspaRpcTransaction,
  NetworkId,
  BlockDagInfo
} from "../types.js";

/**
 * The version the simulator reports (getServerInfo and getInfo): the rusty-kaspad release whose RPC it imitates plus
 * `-kaspa-simulator` (HK-01). The canonical identity check refuses it; the simulator's own expectation
 * (`SIMULATOR_NODE_EXPECTATION` in @hardkas/core) requires it.
 */
export const SIMULATOR_SERVER_VERSION = SIMULATOR_NODE_EXPECTATION.serverVersion;

/**
 * Events the simulator emits to its own RPC server. They are in-process simulator events, deliberately not named like
 * the node's notifications (`block-added`, `utxos-changed`, ...), which kaspa-rpc no longer exposes (Surface Cut 3c-2).
 */
export const SIMULATOR_EVENTS = Object.freeze({
  blockAdded: "simulator:block-mined",
  daaScoreChanged: "simulator:daa-score",
  utxosChanged: "simulator:utxo-diff"
} as const);

/** An RPC error with a stable code (`CODE: message`), as the simulator's methods throw them. */
export function simulatorRpcError(code: string, message: string): Error {
  const err = new Error(`${code}: ${message}`);
  (err as any).code = code;
  return err;
}

export interface RpcUtxoEntry {
  address: string;
  amountSompi: bigint;
  outpoint: {
    transactionId: string;
    index: number;
  };
  utxoEntry: {
    amount: bigint;
    scriptPublicKey: string;
    blockDaaScore: bigint;
    isCoinbase: boolean;
  };
  scriptPublicKey: string;
  blockDaaScore: bigint;
  isCoinbase: boolean;
}

/**
 * Normalizes raw transaction payloads from various sources (kaspa-wasm RpcClient,
 * raw JSON, CLI payloads, snake_case or camelCase) into a clean KaspaRpcTransaction.
 */
export function normalizeRpcTransaction(rawTx: any): KaspaRpcTransaction {
  if (!rawTx || typeof rawTx !== "object") {
    throw new Error("Invalid transaction: expected an object");
  }
  const tx = rawTx.transaction ?? rawTx.tx ?? rawTx.inner ?? rawTx;
  const version = Number(tx.version ?? 0);
  const carriedId = tx.id ?? tx.transactionId ?? tx.verboseData?.transactionId ?? rawTx.id ?? rawTx.transactionId;

  const inputs = (tx.inputs ?? []).map((inp: any) => {
    const po = inp.previousOutpoint ?? inp.previous_outpoint ?? inp.outpoint ?? {};
    return {
      previousOutpoint: {
        transactionId: String(po.transactionId ?? po.transaction_id ?? po.txId ?? "").replace(/^0x/, ""),
        index: Number(po.index ?? po.outpointIndex ?? 0)
      },
      signatureScript: String(inp.signatureScript ?? inp.signature_script ?? inp.sigScript ?? "").replace(/^0x/, ""),
      sequence: BigInt(inp.sequence ?? 0),
      sigOpCount: Number(inp.sigOpCount ?? inp.sig_op_count ?? (version >= 1 ? 0 : 1)),
      ...(inp.computeBudget !== undefined || inp.compute_budget !== undefined
        ? { computeBudget: Number(inp.computeBudget ?? inp.compute_budget) }
        : {})
    };
  });

  const outputs = (tx.outputs ?? []).map((out: any) => {
    const amount = BigInt(out.amount ?? out.value ?? 0);
    let scriptPublicKey: { version: number; scriptPublicKey: string };

    const spk = out.scriptPublicKey ?? out.script_public_key ?? out.spk;
    if (typeof spk === "string") {
      const clean = spk.replace(/^0x/, "");
      if (clean.length >= 4) {
        const version = parseInt(clean.substring(0, 4), 16);
        const script = clean.substring(4);
        scriptPublicKey = { version, scriptPublicKey: script };
      } else {
        scriptPublicKey = { version: 0, scriptPublicKey: clean };
      }
    } else if (spk && typeof spk === "object") {
      const v = Number(spk.version ?? 0);
      const s = String(spk.scriptPublicKey ?? spk.script ?? "").replace(/^0x/, "");
      scriptPublicKey = { version: v, scriptPublicKey: s };
    } else {
      scriptPublicKey = { version: 0, scriptPublicKey: "" };
    }

    return {
      amount,
      scriptPublicKey,
      ...(out.covenant ? { covenant: out.covenant } : {})
    };
  });

  const massVal = tx.mass !== undefined ? BigInt(tx.mass) : (tx.storageMass !== undefined ? BigInt(tx.storageMass) : undefined);

  return {
    ...(carriedId && /^[0-9a-f]{64}$/i.test(String(carriedId)) ? { id: String(carriedId).toLowerCase() } : {}),
    version,
    inputs,
    outputs,
    lockTime: BigInt(tx.lockTime ?? tx.lock_time ?? 0),
    subnetworkId: String(tx.subnetworkId ?? tx.subnetwork_id ?? "00".repeat(20)),
    gas: BigInt(tx.gas ?? 0),
    payload: String(tx.payload ?? ""),
    ...(massVal !== undefined ? { mass: massVal } : {})
  };
}

export class SimulatorRpcClient extends EventEmitter {
  constructor(
    private readonly ledger: UtxoLedger,
    private readonly mempool: Mempool,
    private readonly dagChain: DagChain,
    private readonly minerAccount: DevAccount,
    private readonly networkId: NetworkId = "simnet",
    private automine: boolean = true
  ) {
    super();
  }

  public setAutomine(enabled: boolean): void {
    this.automine = enabled;
  }

  public isAutomineEnabled(): boolean {
    return this.automine;
  }

  /**
   * Submits a transaction to the network.
   * If automine is enabled, a block is immediately mined and confirmed.
   */
  public async submitTransaction(
    transactionOrWrapper: any,
    _options?: any
  ): Promise<{ transactionId: string }> {
    const transaction = normalizeRpcTransaction(transactionOrWrapper?.transaction ?? transactionOrWrapper);
    const daaScore = this.dagChain.getVirtualDaaScore();
    const result = this.mempool.submitTransaction(transaction, this.ledger, daaScore, { pastMedianTimeMs: this.dagChain.getPastMedianTimeMs() });

    if (!result.ok) {
      const txId = transaction.id ?? "";
      throw new Error(`Rejected transaction ${txId}: [${result.code}] ${result.error}`);
    }

    // If automine is active, mine the transaction into the DAG immediately
    if (this.automine) {
      const block = this.dagChain.mineBlock(
        this.minerAccount.address,
        this.minerAccount.scriptPublicKey,
        this.mempool,
        this.ledger
      );
      this.notifyBlockMined(block);
    }

    return { transactionId: result.transactionId };
  }

  /**
   * Tells the simulator's own RPC server (in-process listeners) that a block was mined: the block, the new DAA score,
   * and the UTXOs the block created and spent. These are simulator events, not node notifications (see SIMULATOR_EVENTS).
   */
  public notifyBlockMined(block: SimulatorBlock): void {
    this.emit(SIMULATOR_EVENTS.blockAdded, block);
    this.emit(SIMULATOR_EVENTS.daaScoreChanged, block.header.daaScore);
    this.emit(SIMULATOR_EVENTS.utxosChanged, this.dagChain.getUtxoDiff(block.header.hash));
  }

  /**
   * SIM-09: replace-by-fee is not implemented by the simulator, so the method refuses explicitly instead of behaving as
   * a plain submit (which always failed with a double spend). rusty-kaspad 2.1.0 implements it; test RBF on simnet.
   */
  public async submitTransactionReplacement(_transactionOrWrapper: any): Promise<{ transactionId: string }> {
    throw simulatorRpcError(
      "SIMULATOR_RBF_UNSUPPORTED",
      "submitTransactionReplacement (replace-by-fee) is not implemented by the HardKAS simulator; run it against rusty-kaspad on simnet"
    );
  }

  public async getUtxosByAddress(address: string): Promise<RpcUtxoEntry[]> {
    const utxos = this.ledger.getUtxosByAddress(address);
    return utxos.map((u) => {
      const spkWire = u.scriptPublicKey.startsWith("0000") ? u.scriptPublicKey : `0000${u.scriptPublicKey}`;
      return {
        address: u.address,
        amountSompi: u.amountSompi,
        outpoint: {
          transactionId: u.transactionId,
          index: u.index
        },
        utxoEntry: {
          amount: u.amountSompi,
          scriptPublicKey: spkWire,
          blockDaaScore: u.blockDaaScore,
          isCoinbase: u.isCoinbase,
          ...((u as any).covenant ? { covenantId: (u as any).covenant.covenantId } : {})
        },
        scriptPublicKey: u.scriptPublicKey,
        blockDaaScore: u.blockDaaScore,
        isCoinbase: u.isCoinbase,
        ...((u as any).covenant ? { covenantId: (u as any).covenant.covenantId } : {})
      };
    });
  }

  public async getUtxosByAddresses(addresses: string[]): Promise<{ entries: RpcUtxoEntry[] }> {
    const entries: RpcUtxoEntry[] = [];
    for (const addr of addresses) {
      const u = await this.getUtxosByAddress(addr);
      entries.push(...u);
    }
    return { entries };
  }

  public async getBalanceByAddress(address: string): Promise<{ address: string; balanceSompi: bigint; balance: bigint }> {
    // SIM-13: the node's UTXO index sums every UTXO of the address, immature coinbase included.
    const bal = this.ledger.getBalance(address);
    return { address, balanceSompi: bal, balance: bal };
  }

  public async getBalancesByAddresses(addresses: string[]): Promise<{ entries: Array<{ address: string; balanceSompi: bigint; balance: bigint }> }> {
    const results: Array<{ address: string; balanceSompi: bigint; balance: bigint }> = [];
    for (const addr of addresses) {
      results.push(await this.getBalanceByAddress(addr));
    }
    return { entries: results };
  }

  public async getServerInfo(): Promise<{
    rpcApiVersion: number;
    rpcApiRevision: number;
    serverVersion: string;
    networkId: NetworkId;
    hasUtxoIndex: boolean;
    isSynced: boolean;
    virtualDaaScore: bigint;
  }> {
    return {
      rpcApiVersion: 1,
      rpcApiRevision: 0,
      // HK-01: the simulator names itself (SIMULATOR_SERVER_VERSION = "2.1.0-kaspa-simulator", a semver pre-release, so
      // version parsers keep working); it never reports the canonical rusty-kaspad version.
      serverVersion: SIMULATOR_SERVER_VERSION,
      networkId: this.networkId,
      hasUtxoIndex: true,
      isSynced: true,
      virtualDaaScore: this.dagChain.getVirtualDaaScore()
    };
  }

  public async getBlockDagInfo(): Promise<BlockDagInfo & { network: NetworkId; networkName: NetworkId }> {
    const blocks = this.dagChain.getAllBlocks();
    const sink = this.dagChain.getSink();
    const tips = this.dagChain.getTipHashes();
    const daaScore = this.dagChain.getVirtualDaaScore();
    return {
      network: this.networkId,
      networkId: this.networkId,
      networkName: this.networkId,
      blockCount: BigInt(blocks.length),
      headerCount: BigInt(blocks.length),
      tipHashes: tips,
      difficulty: 1.0,
      pastMedianTime: this.dagChain.getPastMedianTimeMs(),
      virtualParentHashes: tips,
      pruningPointHash: GENESIS_HASH,
      virtualDaaScore: daaScore,
      sink
    };
  }

  public async getSink(): Promise<{ sink: string }> {
    return { sink: this.dagChain.getSink() };
  }

  public async getVirtualDaaScore(): Promise<{ virtualDaaScore: bigint }> {
    return { virtualDaaScore: this.dagChain.getVirtualDaaScore() };
  }

  public async getVirtualSelectedParentBlueScore(): Promise<{ blueScore: bigint }> {
    return { blueScore: this.dagChain.getBlueScore() };
  }

  /**
   * CA-TX-07: only the node's shape, `{ estimate: { priorityBucket, normalBuckets, lowBuckets } }` with `feerate` in
   * sompi per gram (kaspa-wasm 2.1.0 IGetFeeEstimateResponse). The simulator has no fee market: every bucket is the
   * mempool's minimum relay feerate (100 sompi/gram by default, as rusty-kaspad 2.1.0).
   */
  public async getFeeEstimate(): Promise<{
    estimate: {
      priorityBucket: { feerate: number; estimatedSeconds: number };
      normalBuckets: Array<{ feerate: number; estimatedSeconds: number }>;
      lowBuckets: Array<{ feerate: number; estimatedSeconds: number }>;
    };
  }> {
    const feerate = Number(this.mempool.getMinimumFeeRate());
    const bucket = () => ({ feerate, estimatedSeconds: 1 });
    return {
      estimate: {
        priorityBucket: bucket(),
        normalBuckets: [bucket()],
        lowBuckets: [bucket()]
      }
    };
  }

  public async getFeeEstimateExperimental(): Promise<any> {
    return this.getFeeEstimate();
  }

  public async getCoinSupply(): Promise<{ maxSompi: bigint; circulatingSompi: bigint }> {
    return {
      maxSompi: 2900000000000000000n,
      circulatingSompi: this.ledger.getTotalSupply()
    };
  }

  public async getCurrentNetwork(): Promise<{ network: string }> {
    return { network: this.networkId };
  }

  public async getSyncStatus(): Promise<{ isSynced: boolean }> {
    return { isSynced: true };
  }

  public async getBlockCount(): Promise<{ headerCount: bigint; blockCount: bigint }> {
    const count = BigInt(this.dagChain.getAllBlocks().length);
    return { headerCount: count, blockCount: count };
  }

  public async getConnectedPeerInfo(): Promise<{ peerInfo: any[] }> {
    return { peerInfo: [] };
  }

  public async getConnections(): Promise<{ clients: number; peers: number }> {
    return { clients: 1, peers: 0 };
  }

  public async getPeerAddresses(): Promise<{ knownAddresses: string[]; bannedAddresses: string[] }> {
    return { knownAddresses: [], bannedAddresses: [] };
  }

  public async getBlockTemplate(params?: any): Promise<any> {
    const tips = this.dagChain.getTipHashes();
    const daaScore = this.dagChain.getVirtualDaaScore();
    const mempoolTxs = this.mempool.selectTransactionsForBlock();
    return {
      block: {
        header: {
          version: 1,
          parentsByLevel: [tips],
          hashMerkleRoot: "00".repeat(32),
          acceptedIdMerkleRoot: "00".repeat(32),
          utxoCommitment: "00".repeat(32),
          timestamp: Date.now(),
          bits: 0x1e7fffff,
          nonce: 0,
          daaScore,
          blueScore: this.dagChain.getBlueScore(),
          blueWork: "0",
          pruningPoint: GENESIS_HASH
        },
        transactions: mempoolTxs.map((t) => t.transaction)
      },
      isSynced: true
    };
  }

  public async getMempoolEntries(): Promise<{ mempoolEntries: any[]; entries: any[] }> {
    const entries = this.mempool.getAllTransactions().map((m) => ({
      fee: m.feeSompi,
      mass: m.mass,
      transaction: m.transaction
    }));
    return { mempoolEntries: entries, entries };
  }

  public async getMempoolEntriesByAddresses(addresses: string[]): Promise<{ mempoolEntries: any[]; entries: any[] }> {
    const list = Array.isArray(addresses) ? addresses : [];
    return {
      mempoolEntries: [],
      entries: list.map((a) => ({
        address: a,
        receiving: [],
        sending: []
      }))
    };
  }

  public async getMempoolEntry(txId: string): Promise<{ mempoolEntry: any; entry: any }> {
    const m = this.mempool.getTransaction(txId);
    if (!m) {
      throw new Error(`Transaction ${txId} not found in mempool`);
    }
    const item = {
      fee: m.feeSompi,
      mass: m.mass,
      transaction: m.transaction
    };
    return {
      mempoolEntry: item,
      entry: item
    };
  }

  public async getTransaction(txId: string): Promise<any | null> {
    const memTx = this.mempool.getTransaction(txId);
    if (memTx) {
      return {
        transaction: memTx.transaction,
        isInMempool: true,
        blockHash: null
      };
    }
    // SIM-13: the transaction asked for (it used to return the block's first transaction with inputs), and the chain
    // block that accepted it once one merges its block. A simulator extension: the node's RpcApi has no getTransaction.
    const id = txId.toLowerCase();
    for (const block of this.dagChain.getAllBlocks()) {
      const ids = this.dagChain.containedTransactionIds(block);
      const index = ids.indexOf(id);
      if (index !== -1) {
        const acceptance = this.dagChain.findAcceptance(id);
        return {
          transaction: block.transactions[index],
          isInMempool: false,
          blockHash: block.header.hash,
          acceptingBlockHash: acceptance?.acceptingBlockHash ?? null
        };
      }
    }
    return null;
  }

  private formatRpcBlock(b: any): any {
    // SIM-13: v1 inputs carry their compute budget (no sig-op count), v0 inputs their sig-op count; outputs keep their
    // covenant binding; the mass is the one the transaction committed to (0 when it committed none), never invented.
    const formatTx = (tx: any) => {
      const version = Number(tx.version ?? 0);
      return {
        version,
        inputs: (tx.inputs || []).map((inp: any) => ({
          previousOutpoint: {
            transactionId: inp.previousOutpoint?.transactionId ?? "",
            index: inp.previousOutpoint?.index ?? 0
          },
          signatureScript: inp.signatureScript || "",
          sequence: inp.sequence ?? 0,
          ...(version >= 1 ? { computeBudget: Number(inp.computeBudget ?? 0) } : { sigOpCount: inp.sigOpCount ?? 0 })
        })),
        outputs: (tx.outputs || []).map((out: any) => {
          const spk = out.scriptPublicKey;
          const script = typeof spk === "string" ? spk : (spk?.script ?? spk?.scriptPublicKey ?? "");
          const spkVersion = typeof spk === "object" ? Number(spk?.version ?? 0) : 0;
          const val = out.value !== undefined ? out.value : (out.amount !== undefined ? out.amount : (out.amountSompi ?? 0));
          return {
            value: val,
            scriptPublicKey: {
              version: spkVersion,
              script
            },
            ...(out.covenant
              ? { covenant: { authorizingInput: Number(out.covenant.authorizingInput ?? 0), covenantId: String(out.covenant.covenantId) } }
              : {})
          };
        }),
        lockTime: tx.lockTime ?? 0,
        subnetworkId: tx.subnetworkId || "00".repeat(20),
        gas: tx.gas ?? 0,
        payload: /^[0-9a-fA-F]*$/.test(tx.payload || "")
          ? (tx.payload || "")
          : Buffer.from(tx.payload || "", "utf8").toString("hex"),
        mass: BigInt(tx.mass ?? 0)
      };
    };

    return {
      header: {
        hash: b.header.hash,
        version: b.header.version,
        parentsByLevel: b.header.parents && b.header.parents.length > 0 ? [b.header.parents] : [],
        hashMerkleRoot: "00".repeat(32),
        acceptedIdMerkleRoot: "00".repeat(32),
        utxoCommitment: "00".repeat(32),
        timestamp: b.header.timestampMs,
        bits: b.header.bits,
        nonce: b.header.nonce,
        daaScore: b.header.daaScore,
        blueWork: (() => {
          const hex = b.header.blueWork !== undefined ? b.header.blueWork.toString(16) : "00";
          return hex.length % 2 !== 0 ? "0" + hex : hex;
        })(),
        blueScore: b.header.blueScore,
        pruningPoint: GENESIS_HASH
      },
      transactions: (b.transactions ?? []).map(formatTx),
      verboseData: {
        hash: b.header.hash,
        difficulty: 1.0,
        selectedParentHash: b.header.selectedParent ?? b.header.hash,
        // the ids of the transactions the block contains (as the node's verbose data), not the ones it accepts
        transactionIds: [...this.dagChain.containedTransactionIds(b)],
        isHeaderOnly: false,
        blueScore: b.header.blueScore,
        childrenHashes: [],
        mergeSetBluesHashes: [],
        mergeSetRedsHashes: [],
        isChainBlock: true
      }
    };
  }

  /** SIM-13: an unknown block is an error, as the node answers it (it used to be `null`). */
  public async getBlock(hash: string): Promise<{ block: any }> {
    const block = this.dagChain.getBlock(String(hash ?? "").toLowerCase());
    if (!block) throw simulatorRpcError("SIMULATOR_BLOCK_NOT_FOUND", `block ${hash} not found`);
    return { block: this.formatRpcBlock(block) };
  }

  public async getBlocks(options?: any): Promise<{ blockHashes: string[]; blocks: any[] }> {
    const blocks = this.dagChain.getAllBlocks();
    const includeBlocks = Boolean(options?.includeBlocks);
    return {
      blockHashes: blocks.map((b) => b.header.hash),
      blocks: includeBlocks ? blocks.map((b) => this.formatRpcBlock(b)) : []
    };
  }

  public async getInfo(): Promise<any> {
    return {
      p2pId: "simulator-local-node",
      mempoolSize: BigInt(this.mempool.getAllTransactions().length),
      serverVersion: SIMULATOR_SERVER_VERSION,
      isUtxoIndexed: true,
      isSynced: true,
      hasNotifyCommand: true,
      hasMessageId: true
    };
  }

  public async healthCheck(): Promise<any> {
    return {
      endpoint: "simulator://local",
      status: "healthy",
      latencyMs: 0,
      circuitState: "closed",
      stale: false,
      info: await this.getInfo(),
      reachable: true
    };
  }

  public async getBlockHeader(hash: string): Promise<any> {
    const res = await this.getBlock(hash);
    return { header: res.block.header };
  }

  public async getVirtualChainFromBlock(
    params: string | { startHash: string; includeAcceptedTransactionIds?: boolean }
  ): Promise<{
    removedChainBlockHashes: string[];
    addedChainBlockHashes: string[];
    acceptedTransactionIds: Array<{
      acceptingBlockHash: string;
      acceptedTransactionIds: string[];
    }>;
  }> {
    const startHash = typeof params === "string" ? params : (params?.startHash ?? GENESIS_HASH);
    const sink = this.dagChain.getSink();
    const selectedChain = this.dagChain.getSelectedChain(sink);

    let addedBlocks: any[] = [];
    const removedHashes: string[] = [];

    if (startHash === GENESIS_HASH) {
      addedBlocks = selectedChain;
    } else {
      const idx = selectedChain.findIndex((b) => b.header.hash === startHash);
      if (idx !== -1) {
        addedBlocks = selectedChain.slice(idx + 1);
      } else {
        const startBlock = this.dagChain.getBlock(startHash);
        if (!startBlock) {
          throw new Error(`cannot find header for block ${startHash}`);
        }
        const selectedMap = new Map<string, number>();
        selectedMap.set(GENESIS_HASH, -1);
        for (let i = 0; i < selectedChain.length; i++) {
          selectedMap.set(selectedChain[i]!.header.hash, i);
        }

        let curr: string | undefined = startHash;
        let commonAncestorIdx = -1;
        while (curr && curr !== GENESIS_HASH) {
          if (selectedMap.has(curr)) {
            commonAncestorIdx = selectedMap.get(curr)!;
            break;
          }
          removedHashes.push(curr);
          const b = this.dagChain.getBlock(curr);
          curr = b?.header.selectedParent;
        }

        if (commonAncestorIdx === -1) {
          addedBlocks = selectedChain;
        } else {
          addedBlocks = selectedChain.slice(commonAncestorIdx + 1);
        }
      }
    }

    const addedChainBlockHashes = addedBlocks.map((b) => b.header.hash);
    const acceptedTransactionIds = addedBlocks.map((b) => ({
      acceptingBlockHash: b.header.hash,
      acceptedTransactionIds: b.acceptedTransactionIds ?? []
    }));

    return {
      removedChainBlockHashes: removedHashes,
      addedChainBlockHashes,
      acceptedTransactionIds
    };
  }

  /**
   * Generic call dispatcher: executes any Kaspa RPC method.
   */
  public async call<TResponse = unknown>(method: string, params?: any): Promise<TResponse> {
    const bare = method.endsWith("Request") ? method.slice(0, -"Request".length) : method;
    switch (bare) {
      case "getServerInfo":
        return (await this.getServerInfo()) as TResponse;
      case "getBlockDagInfo":
        return (await this.getBlockDagInfo()) as TResponse;
      case "getSink":
        return (await this.getSink()) as TResponse;
      case "getSinkBlueScore":
      case "getVirtualSelectedParentBlueScore":
        return (await this.getVirtualSelectedParentBlueScore()) as TResponse;
      case "getVirtualDaaScore":
        return (await this.getVirtualDaaScore()) as TResponse;
      case "submitTransaction":
        return (await this.submitTransaction(params)) as TResponse;
      case "submitTransactionReplacement":
        return (await this.submitTransactionReplacement(params)) as TResponse;
      case "getUtxosByAddresses": {
        const addresses = Array.isArray(params) ? params : (params?.addresses ?? []);
        return (await this.getUtxosByAddresses(addresses)) as TResponse;
      }
      case "getBalanceByAddress": {
        const addr = typeof params === "string" ? params : (params?.address ?? "");
        return (await this.getBalanceByAddress(addr)) as TResponse;
      }
      case "getBalancesByAddresses": {
        const addrs = Array.isArray(params) ? params : (params?.addresses ?? []);
        return (await this.getBalancesByAddresses(addrs)) as TResponse;
      }
      case "getFeeEstimate":
      case "getFeeEstimateExperimental":
        return (await this.getFeeEstimate()) as TResponse;
      case "getMempoolEntries":
        return (await this.getMempoolEntries()) as TResponse;
      case "getMempoolEntriesByAddresses": {
        const addrs = Array.isArray(params) ? params : (params?.addresses ?? []);
        return (await this.getMempoolEntriesByAddresses(addrs)) as TResponse;
      }
      case "getMempoolEntry": {
        const txId = typeof params === "string" ? params : (params?.transactionId ?? params?.txId ?? "");
        return (await this.getMempoolEntry(txId)) as TResponse;
      }
      case "getTransaction": {
        const txId = typeof params === "string" ? params : (params?.transactionId ?? params?.txId ?? "");
        return (await this.getTransaction(txId)) as TResponse;
      }
      case "getBlock": {
        const hash = typeof params === "string" ? params : (params?.hash ?? "");
        return (await this.getBlock(hash)) as TResponse;
      }
      case "getBlockHeader": {
        const hash = typeof params === "string" ? params : (params?.hash ?? "");
        return (await this.getBlockHeader(hash)) as TResponse;
      }
      case "getVirtualChainFromBlock":
      case "getVirtualChainFromBlockV2":
        return (await this.getVirtualChainFromBlock(params)) as TResponse;
      case "getBlocks":
      case "getBlockHeaders":
      case "getHeaders":
        return (await this.getBlocks(params)) as TResponse;
      case "ping":
        return {} as TResponse;
      case "getCoinSupply":
        return (await this.getCoinSupply()) as TResponse;
      case "getCurrentNetwork":
        return (await this.getCurrentNetwork()) as TResponse;
      case "getSyncStatus":
        return (await this.getSyncStatus()) as TResponse;
      case "getBlockCount":
        return (await this.getBlockCount()) as TResponse;
      case "getConnectedPeerInfo":
        return (await this.getConnectedPeerInfo()) as TResponse;
      case "getConnections":
        return (await this.getConnections()) as TResponse;
      case "getPeerAddresses":
        return (await this.getPeerAddresses()) as TResponse;
      case "getBlockTemplate":
        return (await this.getBlockTemplate(params)) as TResponse;
      case "subscribeBlockAdded":
      case "subscribeSinkBlueScoreChanged":
      case "subscribeVirtualSelectedParentBlueScoreChanged":
      case "subscribeVirtualDaaScoreChanged":
      case "subscribeUtxosChanged":
      case "unsubscribeBlockAdded":
      case "unsubscribeSinkBlueScoreChanged":
      case "unsubscribeVirtualSelectedParentBlueScoreChanged":
      case "unsubscribeVirtualDaaScoreChanged":
      case "unsubscribeUtxosChanged":
        return {} as TResponse;
      case "getInfo":
        return (await this.getInfo()) as TResponse;
      default:
        // SIM-13: an unknown method is an error (it used to answer null, which clients read as an empty success)
        throw simulatorRpcError("SIMULATOR_RPC_METHOD_UNSUPPORTED", `the HardKAS simulator does not implement '${method}'`);
    }
  }

  public async close(): Promise<void> {
    this.removeAllListeners();
  }
}
