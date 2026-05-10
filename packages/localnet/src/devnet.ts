import { createDeterministicAccounts, type HardkasAccount } from "./accounts";
import { SimulatedKaspaChain } from "./simulated-chain";

export interface HardkasDevnet {
  readonly mode: "simulated";
  readonly accounts: readonly HardkasAccount[];
  readonly chain: SimulatedKaspaChain;
  stop(): Promise<void>;
}

export async function startSimulatedDevnet(input?: {
  readonly accounts?: number | undefined;
  readonly initialBalanceSompi?: bigint | undefined;
} | undefined): Promise<HardkasDevnet> {
  const accounts = createDeterministicAccounts({
    count: input?.accounts,
    initialBalanceSompi: input?.initialBalanceSompi
  });

  const chain = new SimulatedKaspaChain(accounts);

  return {
    mode: "simulated",
    accounts,
    chain,
    async stop(): Promise<void> {
      // Nothing to stop in simulated mode.
    }
  };
}
