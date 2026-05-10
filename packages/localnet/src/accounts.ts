
export interface HardkasAccount {
  readonly name: string;
  readonly address: string;
  readonly balanceSompi: bigint;
}

export function createDeterministicAccounts(input?: {
  readonly count?: number | undefined;
  readonly initialBalanceSompi?: bigint | undefined;
} | undefined): HardkasAccount[] {
  const count = input?.count ?? 5;
  const initialBalanceSompi = input?.initialBalanceSompi ?? 1000n * 100_000_000n;

  const names = ["alice", "bob", "carol", "dave", "erin"];

  return Array.from({ length: count }, (_, index) => {
    const name = names[index] ?? `account${index}`;

    return {
      name,
      address: `kaspa:sim_${name}`,
      balanceSompi: initialBalanceSompi
    };
  });
}
export function resolveAccountAddress(input: string): string {
  if (input.startsWith("kaspa:")) {
    return input;
  }

  const aliases: Record<string, string> = {
    alice: "kaspa:sim_alice",
    bob: "kaspa:sim_bob",
    carol: "kaspa:sim_carol",
    dave: "kaspa:sim_dave",
    erin: "kaspa:sim_erin"
  };

  const resolved = aliases[input.toLowerCase()];

  if (!resolved) {
    throw new Error(`Unknown account alias: ${input}`);
  }

  return resolved;
}
