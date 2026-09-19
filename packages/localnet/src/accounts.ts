export interface HardkasAccount {
  readonly name: string;
  readonly address: string;
  readonly evmAddress: string;
  readonly balanceSompi: bigint;
}

// DEF-27 (Wave 4): these are CACHED PUBLIC REPRESENTATIONS of the addresses
// produced by the CANONICAL deterministic dev-account derivation that lives
// SOLELY in `packages/accounts/src/dev-accounts.ts` (scheme:
// sha256("hardkas-deterministic-simnet-seed-v1-<index>") -> PrivateKey ->
// Keypair -> toAddress("simnet")).
//
// This file is NOT a second derivation owner — it only caches the addresses
// as literals so consumers (resolveAccountAddress, createDeterministicAccounts)
// don't need to load kaspa-wasm synchronously. The cross-layer regression at
// `packages/localnet/test/wave4-def27-deterministic-identity.test.ts`
// mechanically enforces:
//
//   DEFAULT_KASPA_ADDRESSES[i] === scheme2Derive(i).address
//
// so these constants cannot silently drift from the canonical scheme.
//
// Alice's address is preserved byte-for-byte from the historical value
// because scheme-2 index 0 produces exactly that address; the historical
// value was originally derived correctly. bob/carol/dave/erin were previously
// placeholder strings that never went through the real derivation and were
// rejected by kaspa-wasm 2.0.1's Address parser — Wave 4 aligns them with
// the canonical scheme.
const DEFAULT_KASPA_ADDRESSES = [
  "kaspasim:qqlpk9rs7yag6eqj3lttzqd8vgvssz8l8fxlpdag4h7zx2rjjr8lkkerwkezn", // alice · scheme-2 index 0
  "kaspasim:qryj23rch0n5rc7klfug58zcrnuc966qljwgzpu3mflqgxu6w2pjg6n575980", // bob   · scheme-2 index 1
  "kaspasim:qqngk9jxxnkhcxpa8w2np5cnvl5v7ke0nx89g4hvgegmrd4awlyts3wxy0770", // carol · scheme-2 index 2
  "kaspasim:qq49jccu6feeazyfwqz7sjhkzqcn7f74swvcjcde5khnvtdfn7x2zzzaystaj", // dave  · scheme-2 index 3
  "kaspasim:qrj0cc3yrdhajhncal833a8rsqv8q758sa647w7dpwnqdfm8696gslkrvdw5l"  // erin  · scheme-2 index 4
];

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
      address: DEFAULT_KASPA_ADDRESSES[index] || `kaspa:sim_${name}`,
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

  // DEF-27 (Wave 4): keep this alias map in exact sync with
  // DEFAULT_KASPA_ADDRESSES above. The Wave 4 regression enforces
  // resolveAccountAddress(name) === DEFAULT_KASPA_ADDRESSES[index].
  const aliases: Record<string, string> = {
    alice: DEFAULT_KASPA_ADDRESSES[0]!,
    bob: DEFAULT_KASPA_ADDRESSES[1]!,
    carol: DEFAULT_KASPA_ADDRESSES[2]!,
    dave: DEFAULT_KASPA_ADDRESSES[3]!,
    erin: DEFAULT_KASPA_ADDRESSES[4]!
  };

  const resolved = aliases[input.toLowerCase()];

  if (!resolved) {
    throw new Error(`Unknown account alias: ${input}`);
  }

  return resolved;
}
