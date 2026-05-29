export interface HardkasAccount {
  readonly name: string;
  readonly address: string;
  readonly evmAddress: string;
  readonly balanceSompi: bigint;
}

const DEFAULT_EVM_ADDRESSES = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266", // alice
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8", // bob
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC", // carol
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906", // dave
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65" // erin
];

export function createDeterministicAccounts(
  input?:
    | {
        readonly count?: number | undefined;
        readonly initialBalanceSompi?: bigint | undefined;
      }
    | undefined
): HardkasAccount[] {
  const count = input?.count ?? 5;
  const initialBalanceSompi = input?.initialBalanceSompi ?? 1000n * 100_000_000n;

  const names = ["alice", "bob", "carol", "dave", "erin"];

  return Array.from({ length: count }, (_, index) => {
    const name = names[index] ?? `account${index}`;

    return {
      name,
      address: `kaspa:sim_${name}`,
      evmAddress:
        DEFAULT_EVM_ADDRESSES[index] ||
        `0x000000000000000000000000000000000000000${index}`,
      balanceSompi: initialBalanceSompi
    };
  });
}
export function resolveAccountAddress(input: string): string {
  if (input.startsWith("kaspa:") || input.startsWith("kaspasim:")) {
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
