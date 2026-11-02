import type { EvmJsonRpcClient } from "./evm-rpc-client.js";

interface AccountNonceState {
  nextNonce: number;
  lock: Promise<void>;
}

/**
 * In-process nonce manager for serialized EVM transaction preparation.
 *
 * SCOPE & ARCHITECTURAL BOUNDARIES:
 * - Coordinates concurrent asynchronous transaction preparation WITHIN a single runtime / process
 *   (e.g., a backend service handling multiple concurrent user actions from a custody wallet).
 * - DOES NOT coordinate across separate operating system processes, cluster instances, or independent
 *   external signers sharing the same private key. Distributed concurrency requires external
 *   distributed locks (e.g., Redis / Postgres advisory locks).
 */
export class EvmNonceManager {
  private readonly states = new Map<string, AccountNonceState>();

  private getKey(account: string, chainId: number): string {
    return `${account.toLowerCase()}:${chainId}`;
  }

  /**
   * Atomically acquires the next sequential nonce for the given account and chain ID.
   * Synchronizes with the RPC node's pending transaction count on first use or after reset.
   */
  async acquireNonce(client: EvmJsonRpcClient, account: string): Promise<number> {
    const chainId = await client.getChainId();
    const key = this.getKey(account, chainId);

    // Acquire or chain onto the existing mutex lock for this account
    let state = this.states.get(key);
    if (!state) {
      state = { nextNonce: -1, lock: Promise.resolve() };
      this.states.set(key, state);
    }

    let releaseLock: () => void = () => {};
    const previousLock = state.lock;
    state.lock = new Promise<void>((resolve) => {
      releaseLock = resolve;
    });

    await previousLock;

    try {
      if (state.nextNonce < 0) {
        // Initial sync with remote node pending transaction count
        const rawPending = await client.getTransactionCount(account, "pending");
        state.nextNonce = Number(rawPending);
      } else {
        // Compare with remote node in case external tx was submitted
        const rawPending = await client.getTransactionCount(account, "pending");
        const nodePending = Number(rawPending);
        if (nodePending > state.nextNonce) {
          state.nextNonce = nodePending;
        }
      }

      const assigned = state.nextNonce;
      state.nextNonce += 1;
      return assigned;
    } finally {
      releaseLock();
    }
  }

  /**
   * Releases an acquired nonce if the transaction was cancelled or failed before being sent to the network.
   * If it is the most recent reservation it is reused directly. Otherwise a gap exists, so the
   * cached counter is invalidated and the next acquisition resyncs from the node's pending count
   * (which stops at the gap), so the gap is filled instead of blocking later transactions.
   * Returns true when the nonce was reused directly.
   */
  releaseUnusedNonce(account: string, chainId: number, nonce: number): boolean {
    const key = this.getKey(account, chainId);
    const state = this.states.get(key);
    if (state && state.nextNonce - 1 === nonce) {
      state.nextNonce = nonce;
      return true;
    }
    if (state && nonce < state.nextNonce) {
      state.nextNonce = -1;
    }
    return false;
  }

  /**
   * Resets cached nonce state, forcing the next acquireNonce call to re-query the node.
   * Do NOT call it for an UncertainBroadcastError: that transaction may still be in the mempool.
   */
  reset(account?: string, chainId?: number): void {
    if (account !== undefined && chainId !== undefined) {
      this.states.delete(this.getKey(account, chainId));
    } else {
      this.states.clear();
    }
  }

  /**
   * Returns the current nextNonce cached for an account, if initialized.
   */
  peekNextNonce(account: string, chainId: number): number | undefined {
    const key = this.getKey(account, chainId);
    const state = this.states.get(key);
    return state && state.nextNonce >= 0 ? state.nextNonce : undefined;
  }
}
