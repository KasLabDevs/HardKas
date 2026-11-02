# Example 11 — KCC-20 fungible tokens on L1 covenants

KCC-20 is the fungible-token convention of the Kaspa Covenant Conventions (kaspanet/kccs, **Final** since 2026-10-21):
a token lives in covenant UTXOs, each holding a `KCC20State` (amount, owner, owner scheme, borrow scheme, borrow guard,
extension commitment), and moves through a `transfer` / `transfer_delegator` interface that the token's own covenant
program enforces on Kaspa L1. It builds on two other Final conventions that are **not** token standards:

- **KCC-1**: the covenant ABI: value codecs, dispatch tags, the P2SH envelope, state, templates and template views,
  leader and delegator roles, virtual elements.
- **KCC-2**: the authority-scheme registry (who may approve: a key, a key hash, a script or a covenant lineage).

KCC-20 is not KRC-20. KRC-20 (Kasplex) is an inscription protocol: its balances are kept by off-chain indexers that
read transaction data. A KCC-20 balance is a covenant UTXO whose rules the covenant program checks on L1. Nothing here
involves EVM.

## What HardKAS gives you

`@hardkas/core` implements the three conventions off chain and runs every official machine-readable conformance vector
(KCC-1, KCC-2, KCC-20 at kaspanet/kccs `1ed87aef`): exact codecs (strict decoding: non-canonical bytes are refused),
dispatch tags, signature scripts, template hashes and views, KCC-2 approval checks, KCC-20 witnesses, borrow schemes,
and `kcc20CheckTransfer`, a model of the leader's rules (conservation, token identity by extension commitment,
ownership, borrowed receive). It does not verify signatures (KCC-20 fixes no sighash; the covenant program checks them),
nor the continuation outputs' programs and covenant bindings (the program checks those too), and it is not a covenant
program: a token's program is compiled from its own source, such as the linked reference implementation.

## Commands

```bash
# the KCC-1 dispatch tag of the KCC-20 transfer entrypoint: 79c71c23
node packages/cli/dist/index.js kcc dispatch "transfer({int,byte[32],byte,byte,byte[32],byte[32]}[],byte[])"

# a KCC20State as its 112-byte encoding, and back (strict decoding; KCC-20 rule problems are reported)
node packages/cli/dist/index.js kcc20 encode-state examples/11-kcc20-token/state.json --json
node packages/cli/dist/index.js kcc20 decode-state <112-byte hex> --json

# a transfer checked against the leader's rules; signatures are listed, never verified
#   exit 0 STRUCTURALLY_VALID, 1 REJECTED (KCC20_TRANSFER_REJECTED), 2 usage
node packages/cli/dist/index.js kcc20 check examples/11-kcc20-token/transfer.json --json

# a program artifact in the reference implementation's kcc20.json form
node packages/cli/dist/index.js kcc20 artifact examples/11-kcc20-token/kcc20.json --json

# the API: states, invocations, checks and a hash-chain borrow (after pnpm build)
node examples/11-kcc20-token/walkthrough.mjs
```

Amounts are exact: write an amount past 2^53 as a decimal string ("9007199254740993"); a JSON number that large is
refused (`KCC_JSON_NUMBER_UNSAFE`), never rounded.

## The reference program, at the silverc and runner levels

KCC-20's Final pull request links one implementation, `argent-lang/kcc20-reference` (ISC). HardKAS reads a pinned
checkout of it (commit `27f8403f`, file digests checked by the tests) and does not vendor it. The digests are of the
files as published, so check it out without line-ending conversion: on Windows, where `core.autocrlf=true` rewrites
them as CRLF, use `git clone -c core.autocrlf=false https://github.com/argent-lang/kcc20-reference` and then
`git -C kcc20-reference checkout 27f8403fee55863125b044c73b2c9449d997a6ca`. A converted copy fails the digest check
(it never passes), and the failure says the line endings were converted.

```bash
# silverc level: its vectors are KCC-20's; its kcc20.json reads as the default configuration; every compiled entry
# has the KCC-1 dispatch tag HardKAS computes; HardKAS's pinned silverc v1.0.0 compiles its KCC20.sil to the same
# bytecode, state span and template hash; its KCC20State is a KCC-1 template view of its 145-byte state; the SDK-based
# SilverScript encoder and the KCC-1 encoder write the same invocation
HARDKAS_TEST_KCC20_REFERENCE=<checkout> pnpm vitest run --config vitest.silverc.config.ts packages/core/test/kcc20-reference.silverc.test.ts

# runner level (UNVERIFIED local cli-debugger build under the level's opt-in): the program's transfer on the Kaspa
# script engine with real Schnorr signatures (owner transfer, conservation, wrong key, unsupported scheme, negative
# amount, borrowed receive at and above the threshold, the delegator's own input), each verdict equal to the model's
HARDKAS_TEST_KCC20_REFERENCE=<checkout> pnpm vitest run --config vitest.silver-runner.config.ts packages/core/test/kcc20-reference.silver-runner.test.ts
```

These are script-engine verdicts on scenario transactions: not transaction validity and not node evidence.

## On a real node (simnet)

The simnet level runs the reference program on an isolated rusty-kaspad v2.1.0 simnet node that the test harness
starts in Docker (never the canonical localnet's container), or from a kaspad binary when `KASPAD_BIN` names one (no
Docker daemon involved). The token is created by a covenant genesis; each transfer
is a signed v1 transaction the node validates by running the program:

```bash
# this example: alice's 1000 -> bob 600 + alice 400 accepted and confirmed; 1000 -> 500 + 600 rejected
HARDKAS_TEST_KCC20_REFERENCE=<checkout> pnpm vitest run --config vitest.simnet.config.ts examples/11-kcc20-token/test/kcc20-token.simnet.test.ts

# the full battery: chained spends, a delegator, the owner schemes p2pk-schnorr, p2pkh-schnorr, p2sh and covenant-id,
# borrowed receive under all three borrow schemes, invalid transitions, amounts at 2^53 + 1 and 2^63 - 1
HARDKAS_TEST_KCC20_REFERENCE=<checkout> pnpm vitest run --config vitest.simnet.config.ts packages/testing/test/kcc20-reference.simnet.test.ts
```

The tests assemble these transactions with kaspa-wasm and HardKAS's KCC-1/KCC-20 encoders: HardKAS has no KCC-20
transaction builder. Simnet only: no KCC-20 transaction has been sent to testnet or mainnet, and the p2pkh-ecdsa/v1
owner scheme is not exercised on a node (kaspa-wasm 2.1.0 has no ECDSA input signer).

What these levels prove, and what they do not:

- **No pass by omission.** Without `HARDKAS_TEST_KCC20_REFERENCE` the four suites above fail with
  `KCC20_REFERENCE_MISSING`. `HARDKAS_TEST_SKIP_KCC20_REFERENCE=1` skips them explicitly, and they are reported as skipped.
- **Why the node rejected.** Every rejection must carry the class HardKAS's classifier gives it (`SCRIPT_POLICY_REJECTED`
  with the engine's "script ran, but verification failed", i.e. the program ran to its end and returned false;
  `COVENANT_RULE_REJECTED` for the tampered covenant binding), and never a fee, a mass or a compute budget. The node
  does not say *which* rule of the program failed: that is attributed by construction, with positive controls on the
  same assembly, and with four cases whose rejected and accepted transactions share a txid (in v1 the txid does not
  cover signature scripts).
- **Fee, mass and budget are fixed, not optimized.** A fixed fee of 0.2 KAS per transfer, a compute budget of 300 per
  token input (10 for the P2SH authority input), and the storage mass HardKAS computes with the upstream formula
  (`calculateUpstreamStorageMass`). The tests show these are sufficient (the node accepts the positive cases); they do
  not show they are minimal.
- **Evidence per run.** With `HARDKAS_TEST_EVIDENCE_DIR` set, the full battery writes its own file per run,
  `kcc20-reference-simnet.<run id>.json`, created exclusively (never overwritten), with the run id, the tree the caller
  declares in `HARDKAS_TEST_TREE_ID`, the node (version, network, identity or binary digest) and every transaction with
  its verdict, reason and class. Txids depend on the outpoints that run's node mined (each run's coinbase
  transactions differ), so another run has other txids; no txid is ever reconstructed or carried over.
