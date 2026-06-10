# Building Apps on HardKAS

HardKAS is designed for complex, multi-actor integration scenarios. During our SDK integration gauntlet, HardKAS successfully validated 18 out of 20 target integration patterns.

These are not final production applications out-of-the-box, but rather **validated integration scenarios** proving that the HardKAS state machine handles complex workflows correctly.

## Validated Patterns

### ✓ Wallet Backend

Handling concurrent local planning, signature validation, and UTXO balance verification for a simulated wallet RPC backend.
_See: [examples/react-wallet](../../examples/react-wallet)_

### ✓ Payroll Automation

Scripting scheduled, deterministic batch transactions from a single treasury to multiple employees without nonce/UTXO collisions.
_See: [examples/sdk-payroll](../../examples/sdk-payroll)_

### ✓ DAO Multisig Flow

Coordinating a multi-step signature pipeline. A `TxPlanArtifact` is passed between stakeholders, partially signed, and ultimately verified via the Zero-Trust Validator before simulation.
_See: [examples/dapp-artifact-workflow](../../examples/dapp-artifact-workflow)_

### ✓ CI Artifact Verification

Running the HardKAS CLI in a headless CI environment to mathematically prove that a deployed contract or workflow artifact maintains semantic equivalence with a local snapshot.
_See: [examples/10-ci-workflow](../../examples/10-ci-workflow)_

### ✓ Game Backend Simulation

Using the Igra L2 local adapter to process high-frequency micro-transactions in a simulated localnet without hitting rate limits or consuming real Kaspa.
_See: [examples/sdk-game-backend](../../examples/sdk-game-backend)_
