import fs from 'node:fs';
import path from 'node:path';
import { withLock } from '@hardkas/core';

export interface PendingSpendScope {
  mode: 'localnet' | 'rpc';
  domain: 'kaspa-l1';
  network: string;
}

export interface PendingSpend {
  scope: PendingSpendScope;
  outpointKey: string;        // "txId:index"
  outpointTxId: string;
  outpointIndex: number;
  spendingTxId: string;
  registeredAt: string;       // ISO timestamp
  source: 'send';             // rc.12: only 'send'
}

export type UtxoSpendabilityState = 'ready' | 'stale' | 'reconstructing';

export type MempoolPresence =
  | { status: 'present' }
  | { status: 'absent' };

export interface ReconciliationResult {
  released: string[];     // outpointKeys that were released
  kept: string[];         // outpointKeys that were kept
  state: UtxoSpendabilityState;
}

export function executionScopeKey(scope: PendingSpendScope): string {
  return `${scope.mode}:${scope.domain}:${scope.network}`;
}

export function outpointKey(txId: string, index: number): string {
  return `${txId}:${index}`;
}

function qualifiedKey(scope: PendingSpendScope, opKey: string): string {
  return `${executionScopeKey(scope)}|${opKey}`;
}

export class PendingSpendService {
  private spends: Map<string, PendingSpend> = new Map();  // key = qualifiedKey
  private _state: UtxoSpendabilityState = 'stale';

  get state(): UtxoSpendabilityState { 
    return this._state; 
  }

  // --- Registration (in-memory only) ---
  register(
    scope: PendingSpendScope,
    spendingTxId: string,
    inputs: Array<{transactionId: string, index: number}>,
  ): void {
    const now = new Date().toISOString();
    for (const input of inputs) {
      const opKey = outpointKey(input.transactionId, input.index);
      const qKey = qualifiedKey(scope, opKey);
      
      this.spends.set(qKey, {
        scope,
        outpointKey: opKey,
        outpointTxId: input.transactionId,
        outpointIndex: input.index,
        spendingTxId,
        registeredAt: now,
        source: 'send'
      });
    }
  }

  // --- Planner integration ---
  filterSpendableOrFail<T extends {outpoint: {transactionId: string, index: number}}>(
    scope: PendingSpendScope,
    utxos: T[],
  ): T[] {
    if (this._state !== 'ready') {
      throw new Error(`UTXO_STATE_STALE: Cannot filter utxos when state is ${this._state}`);
    }
    
    return utxos.filter(utxo => {
      const opKey = outpointKey(utxo.outpoint.transactionId, utxo.outpoint.index);
      const qKey = qualifiedKey(scope, opKey);
      return !this.spends.has(qKey);
    });
  }

  // --- Reconciliation ---
  async reconcile(
    scope: PendingSpendScope,
    checkMempoolPresence: (txId: string) => Promise<MempoolPresence>,
    freshUtxos: Array<{outpoint: {transactionId: string, index: number}}>,
  ): Promise<ReconciliationResult> {
    this._state = 'reconstructing';
    
    // We don't strictly need to check the freshUtxoSet for the release logic since both
    // cases (in set vs not in set) result in releasing the spend, but we build it here
    // as part of the algorithm semantics.
    const freshUtxoSet = new Set<string>();
    for (const utxo of freshUtxos) {
      freshUtxoSet.add(outpointKey(utxo.outpoint.transactionId, utxo.outpoint.index));
    }
    
    const released: string[] = [];
    const kept: string[] = [];
    
    const scopeKey = executionScopeKey(scope);
    const matchingKeys = Array.from(this.spends.keys()).filter(k => k.startsWith(`${scopeKey}|`));
    
    for (const key of matchingKeys) {
      const spend = this.spends.get(key)!;
      try {
        const presence = await checkMempoolPresence(spend.spendingTxId);
        
        if (presence.status === 'present') {
          // tx still pending in mempool -> KEEP
          kept.push(spend.outpointKey);
        } else {
          // status === 'absent'
          this.spends.delete(key);
          released.push(spend.outpointKey);
        }
      } catch (err) {
        // RPC error or other failure -> stale
        this._state = 'stale';
        return { released, kept, state: this._state };
      }
    }
    
    this._state = 'ready';
    return { released, kept, state: this._state };
  }

  // --- Persistence ---
  private serialize(): object {
    return {
      schema: "hardkas.pendingSpends.v1",
      spends: Array.from(this.spends.values()),
      lastReconciledAt: new Date().toISOString()
    };
  }

  private static deserialize(data: any): PendingSpendService {
    const service = new PendingSpendService();
    // note: _state remains 'stale' as initialized by default
    if (data && Array.isArray(data.spends)) {
      for (const spend of data.spends) {
        const opKey = outpointKey(spend.outpointTxId, spend.outpointIndex);
        const qKey = qualifiedKey(spend.scope, opKey);
        service.spends.set(qKey, spend);
      }
    }
    return service;
  }

  private static getFilePath(workspaceRoot: string): string {
    return path.join(workspaceRoot, '.hardkas', 'pending-spends.json');
  }

  // Atomic operations (under lock)
  static async load(workspaceRoot: string): Promise<PendingSpendService> {
    const filePath = PendingSpendService.getFilePath(workspaceRoot);
    if (!fs.existsSync(filePath)) {
      return new PendingSpendService();
    }
    
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      return PendingSpendService.deserialize(data);
    } catch (err) {
      return new PendingSpendService();
    }
  }

  async persist(workspaceRoot: string): Promise<void> {
    await withLock(
      { rootDir: workspaceRoot, name: 'pending-spends', wait: true, timeoutMs: 5000 },
      async () => {
        const filePath = PendingSpendService.getFilePath(workspaceRoot);
        const dir = path.dirname(filePath);

        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        const data = JSON.stringify(this.serialize(), null, 2);
        const tempPath = `${filePath}.tmp`;

        // Atomic write: tmp + rename
        fs.writeFileSync(tempPath, data, 'utf-8');
        fs.renameSync(tempPath, filePath);
      }
    );
  }

  /**
   * Atomic read-modify-write under a single lock.
   * This is the SAFE way to register pending spends and persist them.
   * Prevents lost-update race conditions between concurrent processes.
   */
  static async registerAndPersist(
    workspaceRoot: string,
    scope: PendingSpendScope,
    spendingTxId: string,
    inputs: Array<{transactionId: string, index: number}>,
  ): Promise<void> {
    await withLock(
      { rootDir: workspaceRoot, name: 'pending-spends', wait: true, timeoutMs: 5000 },
      async () => {
        // Load current disk state (inside lock)
        const service = await PendingSpendService.load(workspaceRoot);
        service.register(scope, spendingTxId, inputs);
        
        const filePath = PendingSpendService.getFilePath(workspaceRoot);
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        const data = JSON.stringify(service.serialize(), null, 2);
        const tempPath = `${filePath}.tmp`;
        fs.writeFileSync(tempPath, data, 'utf-8');
        fs.renameSync(tempPath, filePath);

      }
    );
  }
}
