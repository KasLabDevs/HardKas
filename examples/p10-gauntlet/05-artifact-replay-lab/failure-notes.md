# Predicted Friction Points

- `sdk.replay.verify()` on `TxPlan` and `SignedTx` might fail if deterministic hash rules are too strict or assume certain default values.
- `sdk.artifacts.read()` might not do on-read validation of content hashes, allowing corrupted data into the SDK runtime until explicitly verified.
