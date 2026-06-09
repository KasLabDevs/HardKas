# HardKas Architectural Invariants

These are the rules the system should not break as the product grows.

## 1. Artifact Invariant

Changing any meaningful transaction field after creation must invalidate verification.

Artifacts are the source of truth for transaction stages. Fields such as `amountSompi`, `to.address`, `networkId`, inputs, outputs, payloads, and lineage data are part of the semantic record. Tool metadata can change; financial or network intent cannot.

## 2. Signer Invariant

Private keys must not cross process, worker, browser, or serialization boundaries as live WASM objects.

The signer should receive validated portable material, instantiate runtime key objects locally, sign the deterministic artifact, and then release sensitive runtime state.

## 3. Provider Invariant

Simulated execution and real RPC execution are different modes.

- Simulated execution uses local workspace state.
- RPC execution asks a configured Kaspa node for UTXOs and submission.

Crossing from local simulation into real simnet must be explicit through network/provider/url configuration.

## 4. Network Invariant

A transaction artifact belongs to exactly one network context.

The `networkId` chosen during planning is part of the transaction intent and lineage. Do not mutate it after planning. If the target network changes, create a new plan.

## 5. UTXO Invariant

Wallet size and transaction size are separate concerns.

A wallet may have thousands of UTXOs, but a single transaction has mass limits. The planner selects the inputs needed for the requested amount. The signer should never receive an unbounded wallet dump.

## 6. RPC Invariant

Local validation should happen before asking a node whenever possible.

Artifact mutation checks, network checks, address checks, and signature structure checks should fail locally before `submitTransaction` is attempted.

## 7. Mainnet Invariant

Mainnet is outside the default alpha happy path.

Any future mainnet path must be explicit, guarded, documented separately, and harder to trigger than local simulation or simnet testing.
