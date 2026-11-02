// KCC-20 off chain with @hardkas/core (the built package): a token state, a transfer invocation, the leader's rules, and a
// hash-chain borrowed receive. Placeholder keys and signatures, as in the official vectors: nothing here is signed, sent
// or verified on a network. Run from the repository root after `pnpm build`:
//   node examples/11-kcc20-token/walkthrough.mjs
import {
  kcc20Entrypoints,
  kcc20State,
  kcc20EncodeState,
  kcc20DecodeState,
  kcc20TransferArguments,
  kcc20TransferWitness,
  kcc20BorrowWitness,
  kcc20CheckTransfer,
  kcc20HashChain,
  kccHex
} from "../../packages/core/dist/index.js";

const ZERO = "00".repeat(32);
const SIG = "44".repeat(65); // a placeholder 65-byte Schnorr transaction signature

// 1. The interface: two entrypoints and their KCC-1 dispatch tags
const tags = kcc20Entrypoints();
console.log(`transfer  ${tags.transfer.dispatchTag}  ${tags.transfer.functionSignature}`);
console.log(`delegator ${tags.delegator.dispatchTag}  ${tags.delegator.functionSignature}`);

// 2. A token state: 1000 units owned by a p2pk-schnorr/v1 key, no borrowing, no extended state
const leader = kcc20State({ amount: 1000n, owner: "11".repeat(32), ownerScheme: 0, borrowScheme: 0, borrowGuard: ZERO, extensionCommitment: ZERO });
const encoded = kcc20EncodeState(leader);
console.log(`state     ${encoded.length} bytes; decodes to amount ${kcc20DecodeState(encoded).amount}`);

// 3. A transfer: 600 to one owner, 400 back; the leader authenticates its owner (path byte 00 + signature)
const next = [
  kcc20State({ ...leader, amount: 600n, owner: "22".repeat(32) }),
  kcc20State({ ...leader, amount: 400n })
];
const witness = kcc20TransferWitness({ scheme: 0x00, signature: SIG });
console.log(`arguments ${kccHex(kcc20TransferArguments(next, witness)).length / 2} bytes, then 04${tags.transfer.dispatchTag} and the program`);

// 4. The leader's rules, off chain (the signature check is the caller's: here it is stipulated, as the vectors do)
const transfer = {
  inputs: [{ state: leader, kasValueSompi: 100_000_000n, witness: kccHex(witness) }],
  nextStates: next,
  outputs: next.map((s) => ({ state: s, kasValueSompi: 49_000_000n })),
  signatureValid: () => true
};
console.log("check     ", kcc20CheckTransfer(transfer));
const inflated = [next[0], kcc20State({ ...next[1], amount: 401n })];
console.log("inflated  ", kcc20CheckTransfer({ ...transfer, nextStates: inflated, outputs: inflated.map((s) => ({ state: s, kasValueSompi: 49_000_000n })) }));

// 5. hash-chain/v1 borrowed receive: the owner publishes x_3; each borrow reveals one link and a one-time key
const chain = kcc20HashChain("a0".repeat(32), ["b1".repeat(32), "b2".repeat(32), "b3".repeat(32)]);
console.log(`chain     initial borrow_guard ${chain[2]}`);
const borrow = kcc20BorrowWitness({ scheme: 0x03, revealedGuard: chain[1], oneTimePublicKey: "b3".repeat(32), signature: SIG });
console.log(`borrow    witness ${borrow.length} bytes (01 || x_2 || one-time key || signature)`);
