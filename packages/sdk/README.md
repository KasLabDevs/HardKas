# `@hardkas/sdk`

The HardKas SDK is the programmatic API for local-first transaction workflows. It exposes the same core model as the CLI: plan, sign, simulate or send, then inspect artifacts and lineage.

## 1. Create A Local SDK

```typescript
import { Hardkas } from "@hardkas/sdk";

const sdk = await Hardkas.create({
  cwd: process.cwd(),
  autoBootstrap: true,
  network: "simulated"
});
```

`autoBootstrap: true` is the easiest local path. It creates or loads the workspace data needed for simulated accounts, artifacts, and local execution.

In a TypeScript project, install `@types/node` as a development dependency: the SDK's type declarations use Node.js types, and `@types/node` is only an optional peer dependency, so it is not installed for you.

## 2. Transaction Flow

```typescript
const plan = await sdk.tx.plan({
  from: "alice",
  to: "bob",
  amount: "1",
  network: "simulated"
});

const signed = await sdk.tx.sign(plan, {
  account: "alice"
});

const { receipt } = await sdk.tx.simulate(signed);
```

For a real RPC-backed node, create the SDK with an explicit network/provider configuration and treat the send step as network-state dependent.

### Mainnet is locked down (breaking)

The SDK makes **no connection to mainnet**, reads included, even to an endpoint the workspace declares (MAINNET TOTAL LOCKDOWN, owner decision 2026-11-09; it revokes the former "reading and planning on mainnet stay allowed"). `Hardkas.open` on a mainnet network (any spelling, or an alias whose config entry declares one; `policy.allowPublic` is still needed to open it) gives an **offline** instance: its `rpc` never connects and refuses every request with `MAINNET_CONNECTION_DISABLED`, and so do `tx.plan`, `tx.observe` / the waits, `accounts.getBalance`, `fees.estimate`, `observe.address`, `node.fundDevWallets` / `waitForSettlement` and `wallet.open`, before anything is read. `tx.sign` is `MAINNET_SIGNING_DISABLED` (no signer is asked, offline signing included) and `tx.send` `MAINNET_BROADCAST_DISABLED`, both before any connection or record. What needs no node keeps working (local records, `artifacts.verify` of a mainnet record offline). The raw clients of `@hardkas/kaspa-rpc` apply the same rule: a client used as a mainnet network never connects, and every connection asks the node its network once (`getServerInfo`) before anything else, closing it when the node answers mainnet. No option, flag, environment variable or configuration (`allowPublic`, `experimental`, `allowMainnet`, `HARDKAS_*`) changes this.

```typescript
const sdk = await Hardkas.open({ network: "mainnet", policy: { allowPublic: true } });
await sdk.rpc.getBlockDagInfo(); // throws MAINNET_CONNECTION_DISABLED — nothing was contacted
```

### Sending to a real node: the node must say it is synced

`sdk.tx.send(signed)` on a real network first asks the node (`getServerInfo`) whether it is synced, before any read the send depends on and before anything is sent or recorded. Only `isSynced: true` lets the send go on; anything else (`false`, no answer about sync, a failed read) is refused with `NODE_NOT_SYNCED` (a `NodeSyncError` of `@hardkas/kaspa-rpc`), as the CLI's `hardkas tx send` does. `covenants.send` and every other SDK send go through `tx.send`. This is a **breaking change** of this release: before, the SDK sent to whatever node its client reached. A rusty-kaspad v2.1.0 node accepts a submission even while it says it is not synced, so the refusal is HardKAS's.

```typescript
try {
  await sdk.tx.send(signed);
} catch (e: any) {
  if (e.code === "NODE_NOT_SYNCED") {
    // a fresh local node with no miner says isSynced: false; mine a block (or let it sync) and retry
  }
}

// Only for a controlled local simnet or devnet: send to a node that does not say it is synced.
await sdk.tx.send(signed, { allowUnsyncedNode: true });
```

`allowUnsyncedNode` must be `true` or `false` (`SEND_OPTION_INVALID`), is refused on every network other than simnet and devnet (`SEND_UNSYNCED_NODE_NOT_ALLOWED`), and is never implied by another option. Mainnet broadcast stays disabled whatever it says. Being synced says nothing about a transaction: mempool, acceptance and confirmation are read with `sdk.tx.observe` / `sdk.tx.status`.

What a plan cannot hold in this release, refused with a typed code: a lock time other than 0 (`LOCK_TIME_NOT_SUPPORTED`; no CLTV) and a spend from an ECDSA address (`ECDSA_SPEND_NOT_SUPPORTED`; paying to one works). See `docs/status/limitations.md`.

## 3. Artifacts And Queries

The SDK can read artifacts, trace lineage, replay local records, and query the local projection:

```typescript
const artifacts = await sdk.artifacts.list();
const trace = await sdk.lineage.trace(receipt.contentHash);

// Replay is addressed by the receipt's artifact id (its contentHash), not by its txId.
const replay = await sdk.replay.verify(receipt.contentHash);
console.log(replay.passed); // true
```

These snippets were run against the SDK build of this release (2026-11-06): `sdk.replay.verify()` without an argument
answers `passed: false` ("No receipt ID provided"), and with `receipt.txId` the lookup asks for `{ tx: … }`.

The SQLite query store is rebuildable. The durable source of truth is the workspace artifact and event data.

## 4. Contractual Guarantees & Concurrency

HardKAS relies on the authoritative Kaspa network for state validation and conflict resolution. The SDK enforces the following behavioral contracts:

- **Execution Authority**: Network validation remains the ultimate authority.
- **`plan()` is Read-Only**: Transaction planning is strictly read-only and non-reserving. Concurrent `plan()` calls observing the same state are allowed to select overlapping outpoints.
- **Mempool-Aware Spendability**: The planner filters inputs that are already visible in the mempool as pending spends. This is conflict *mitigation*, not reservation.
- **Optimistic Concurrency**: A successful plan does not imply that its inputs will remain spendable at submission time. Application-level serialization can coordinate cooperating intents, but it cannot prevent an external process holding the same keys from spending the same UTXO.
- **Exact Signed Submission**: HardKAS submits exactly what was signed, without hidden mutations.
- **Receipt Semantics**: A `submitted` receipt is persisted *only* after successful transaction submission acceptance by the RPC path. A rejected submission must not produce a `submitted` receipt. (Note: `submitted` ≠ `confirmed` ≠ `final`).
- **Artifact Authority**: Local state queries rely on immutable file artifacts, but network evidence rules absolute truth.
- **Observation & Recovery**: The transaction observer reads the node's virtual chain with `getVirtualChainFromBlock` (with accepted transaction ids) from the last verified cursor and seals each look as a `hardkas.txObservation.v1` artifact. An incoherent chain answer is rejected whole, and the next look re-reads from that cursor. The observer does not use `getVirtualChainFromBlockV2`.

## 5. Boundary

The SDK should be used from Node.js. Browser applications should talk to the dev server through `@hardkas/client`, not import `@hardkas/sdk` directly.

## 6. Experimental ZK (Groth16 / RISC Zero / Toccata)

- `verifyZkProofMath` / `verifyGroth16Math`: snarkjs pairing check over BN254. The result is
  `ZK_GROTH16_MATH_VERIFIED` only for an anchored key (`expectedVerificationKeyHash` = the key's
  `verificationKeyFingerprint` obtained from a trusted source, or an entry of
  `PINNED_GROTH16_VERIFICATION_KEYS`); otherwise `ZK_GROTH16_MATH_VALID_UNANCHORED_VK` with
  `ok: false`. Fixture coherence is self-attested (`FIXTURE_COHERENCE_SELF_ATTESTED`).
- `verifyR0Groth16ReceiptLocal`: RISC Zero Groth16 receipt against the pinned RISC Zero key
  (risc0 v3.0.4). Its result is the only input that sets a ZK fact's `verifiedOffChain`.
- `getToccataPrecompileRules`: the facts HardKAS relies on (`opcode` `0xa6` = `OpZkPrecompile`,
  `tag` `0x20` = Groth16, `groth16PrecompileCostGrams` 140,000 plus
  `groth16VkElementCostScriptUnits` 250,000 per verifying-key element,
  `minimumR0Groth16ComputeBudget` 1550, `recommendedComputeBudget` 1600).
- `buildR0Groth16Scripts` / `buildR0Groth16Transaction`: Toccata scripts (`redeemScript`,
  `sigScript`, `p2shScriptPublicKey`, `p2shAddresses`) and the v1 spend, never broadcast. A ZK spend
  needs no signature (its `sigScript` is the authorization), so the built transaction is complete:
  `buildR0Groth16Transaction` and `buildR0Groth16Plan` refuse mainnet with `MAINNET_SIGNING_DISABLED`.
  `verifyR0Groth16Scripts` accepts a lock only over the pinned RISC Zero verifying key, control root
  and control id, and sets `consensusEnforced` only for an output-bound redeem script byte-identical
  to the one HardKAS builds for the outputs it carries (`redeemScriptCanonical`; otherwise
  `ZK_REDEEM_SCRIPT_NOT_CANONICAL`). `authorizationModel` on every result:
  - `IMAGE_ID_ONLY` (default, `bindingPolicy` absent or `proof-only`): the lock binds the image id
    only (any holder of a valid receipt spends, to any outputs; replay and front-running are possible
    by design); a testnet-10 address needs `addressNetworks` + `acknowledgeImageIdOnlyLock` and
    is never built for a public test vector. Mainnet (any spelling, or a bound payout or change address
    of mainnet) throws `MAINNET_SIGNING_DISABLED` while mainnet is locked down: no lock is built.
  - `IMAGE_ID_AND_OUTPUTS` (`bindingPolicy: { mode: "proof-and-output-bound", payout, change?,
    maxFeeSompi? }`): the redeem script also checks the output count and the payout/change script
    public key and amount by introspection, exactly one input, and an input of at most the bound
    outputs plus `maxFeeSompi`. Fund the lock with `requiredFundingSompi` (`maxInputSompi` is the
    largest UTXO it accepts).
  - Neither binds the spent outpoint (`utxoBinding` is refused: circular) or the journal.
    `createZkOutputBindingJournal` (`HKZ1`) is an off-chain convention that no lock checks.
- On-chain acceptance is shown only by the simnet suites (`zk-toccata-l1.simnet`,
  `zk-output-bound-l1.simnet`) against a harness-raised rusty-kaspad v2.1.0.

## 7. Third-party licenses (ZK)

`@hardkas/sdk` is MIT. Its Groth16 pairing check uses `snarkjs`, which is **not installed with the
package**: it is an optional peer dependency (`peerDependencies` + `peerDependenciesMeta`, pinned to
`snarkjs@0.7.6`), because `snarkjs` and part of its tree are **GPL-3.0**: `snarkjs`, `ffjavascript`
(0.3.0, 0.3.1), `wasmcurves@0.2.2`, `wasmbuilder@0.0.16`, `r1csfile@0.0.48`, `fastfile@0.0.20`,
`@iden3/binfileutils@0.0.12`, `@iden3/bigarray@0.0.2`. The rest of that tree is MIT, Apache-2.0,
BSD or ISC.

- Without `snarkjs`, everything else in the SDK works, and the ZK checks that need no engine
  (schemas, canonical points, the pinned-key and weak-key rules) still run and still reject. A
  verification that needs the pairing (`verifyGroth16Math`, `verifyZkProofMath`,
  `verifyR0Groth16ReceiptLocal`, `hardkas zk proof verify-math`, `hardkas zk toccata verify-receipt`)
  returns the error status (`ZK_GROTH16_VERIFIER_ERROR` / `ZK_R0_GROTH16_VERIFIER_ERROR`) with the
  issue `ZK_ENGINE_UNAVAILABLE`, never a verified result.
- To enable it, install it next to `@hardkas/sdk` (or `@hardkas/cli`), at the pinned version:
  `npm install snarkjs@0.7.6`. snarkjs is loaded only by those functions, in a child process.
- Anyone who installs `snarkjs`, or redistributes an application that bundles it, must review the
  GPL-3.0 obligations; this notice is not legal advice.