import { UtxoLedger } from "./ledger/utxo-ledger.js";
import { Mempool } from "./mempool/mempool.js";
import { DagChain } from "./dag/dag-chain.js";
import type { SimulatorSnapshot } from "./types.js";

export class SnapshotManager {
  private snapshots = new Map<string, SimulatorSnapshot>();
  private counter = 0;

  constructor(
    private readonly ledger: UtxoLedger,
    private readonly mempool: Mempool,
    private readonly dagChain: DagChain
  ) {}

  /**
   * Captures the entire simulator state (UTXOs, mempool, blocks, DAG tips, DAA score).
   */
  public snapshot(): string {
    this.counter += 1;
    const id = `snap_${this.counter}_${Date.now().toString(36)}`;

    const snap: SimulatorSnapshot = {
      id,
      daaScore: this.dagChain.getVirtualDaaScore(),
      blueScore: this.dagChain.getBlueScore(),
      utxos: this.ledger.getAllUtxos(),
      mempool: this.mempool.getAllTransactions(),
      blocks: this.dagChain.getAllBlocks(),
      tipHashes: this.dagChain.getTipHashes(),
      timestampMs: Date.now()
    };

    this.snapshots.set(id, snap);
    return id;
  }

  /**
   * Reverts the simulator to a previously captured snapshot.
   */
  public revert(snapshotId: string): boolean {
    const snap = this.snapshots.get(snapshotId);
    if (!snap) return false;

    // 1. Restore UTXO Ledger
    this.ledger.restoreFrom(snap.utxos);

    // 2. Restore Mempool
    this.mempool.clear();
    for (const tx of snap.mempool) {
      this.mempool.submitTransaction(tx.transaction, this.ledger, snap.daaScore);
    }

    // 3. Restore DAG Chain
    this.dagChain.restoreFrom(snap.blocks, snap.tipHashes, snap.daaScore);

    return true;
  }

  public getSnapshot(snapshotId: string): SimulatorSnapshot | undefined {
    return this.snapshots.get(snapshotId);
  }

  public clear(): void {
    this.snapshots.clear();
  }
}
