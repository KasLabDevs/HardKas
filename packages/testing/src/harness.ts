// SAFETY_LEVEL: SIMULATION_ONLY
//
// Test harness for HardKAS — provides fresh localnet per test.

import type { LocalnetState } from "@hardkas/localnet";
import { 
  createInitialLocalnetState, 
  applySimulatedPayment,
  getAccountBalanceSompi,
  createLocalnetSnapshot
} from "@hardkas/localnet";

export interface HarnessConfig {
  accounts?: number | undefined;          // default: 3
  initialBalance?: bigint | undefined;    // default: 100_000_000_000n (1000 KAS)
  networkId?: string | undefined;         // default: "simnet"
  ghostdagK?: number | undefined;         // default: 18
}

export interface TestHarness {
  /** The current localnet state. */
  state: LocalnetState;
  /** Send KAS from one account to another. Returns the receipt. */
  send(opts: { from: string; to: string; amountSompi: bigint }): SendResult;
  /** Get balance of an account by name (e.g., "alice"). */
  balanceOf(name: string): bigint;
  /** Get all account names. */
  accountNames(): string[];
  /** Take a snapshot of current state. */
  snapshot(): any;
  /** Reset to initial state. */
  reset(): void;
}

export interface SendResult {
  ok: boolean;
  receipt: any;
  plan: any;
  preBalance: { from: bigint; to: bigint };
  postBalance: { from: bigint; to: bigint };
}

export function createTestHarness(config?: HarnessConfig): TestHarness {
  const accountCount = config?.accounts ?? 3;
  const initialBalanceSompi = config?.initialBalance ?? 100_000_000_000n;
  
  let currentState = createInitialLocalnetState({
    accounts: accountCount,
    initialBalanceSompi
  });
  
  if (config?.networkId) {
    (currentState as any).networkId = config.networkId;
  }

  // structuredClone preserves BigInt values; JSON.parse(JSON.stringify()) does not.
  const initialState = structuredClone(currentState);

  const harness: TestHarness = {
    get state() {
      return currentState;
    },

    send(opts: { from: string; to: string; amountSompi: bigint }): SendResult {
      const preBalance = {
        from: getAccountBalanceSompi(currentState, opts.from),
        to: getAccountBalanceSompi(currentState, opts.to)
      };

      const result = applySimulatedPayment(currentState, opts);
      
      if (result.ok) {
        currentState = result.state;
      }

      const postBalance = {
        from: getAccountBalanceSompi(currentState, opts.from),
        to: getAccountBalanceSompi(currentState, opts.to)
      };

      return {
        ok: result.ok,
        receipt: result.receipt,
        plan: result.planArtifact,
        preBalance,
        postBalance
      };
    },

    balanceOf(name: string): bigint {
      return getAccountBalanceSompi(currentState, name);
    },

    accountNames(): string[] {
      return currentState.accounts.map(a => a.name);
    },

    snapshot(): any {
      return createLocalnetSnapshot(currentState);
    },

    reset(): void {
      currentState = structuredClone(initialState);
    }
  };

  return harness;
}
