# Philosophy: Deterministic Replay

At the core of the HardKAS architecture is the principle of **Deterministic Replay**.

## The Guarantee of Determinism

In a decentralized system, you must be able to guarantee that if you execute the exact same transaction against the exact same initial state, you will get the exact same resulting state. If this guarantee is violated, consensus breaks.

Yet, most local development tools don't aggressively enforce or test determinism.

HardKAS makes determinism a first-class citizen. Every transaction workflow culminates in a `ReplayReport` artifact.

## How Replay Works

1. **Capture**: When you execute a transaction, HardKAS captures the `TransactionPlan` and the final `Receipt`.
2. **Isolate**: HardKAS spins up an isolated, sandboxed execution environment.
3. **Execute**: It feeds the `TransactionPlan` into the sandbox.
4. **Assert**: It compares the state output of the sandbox against the actual `Receipt`.

If there is a single byte of divergence—if a timestamp was read incorrectly, if a random number generator was used non-deterministically, or if the underlying network node lied—the replay **fails**.

## Quarantine

HardKAS does not tolerate non-determinism. If a replay fails, the resulting artifact is immediately marked as `QUARANTINED`.

Quarantined artifacts are completely isolated. They will not be projected into the Query Store, and they will not be used as parents for future transactions. This strict quarantine ensures that a single non-deterministic bug cannot invisibly corrupt the rest of your local testing state.
