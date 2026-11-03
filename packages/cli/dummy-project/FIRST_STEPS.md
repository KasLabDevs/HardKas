# First Steps in HardKAS

Welcome to HardKAS! Here is a 5-minute practical guide to _feel_ the deterministic mental model.

### 1. Run a local transaction

```bash
pnpm transfer
```

This will run a simulated transfer and generate an **Artifact**.
_Notice the output narrating the causal execution._

### 2. Inspect workspace status

```bash
hardkas status
```

This queries the local dev environment and verifies the state projections.

### 3. Inspect the artifact

Run `hardkas artifact list` or `hardkas dev last --replay` to inspect how your transaction artifact relates to the genesis state.

### 4. Run `hardkas explain`

In your terminal, copy the Artifact ID from step 1 and run:

```bash
hardkas explain <artifact_id>
```

This provides a deep, narrative explanation of the artifact's causality without needing a separate UI.

### 5. Break an artifact intentionally

Go into `.hardkas/artifacts/`, find the transaction JSON, and manually change the `amountSompi` value.

### 6. Run the consistency doctor

```bash
pnpm doctor --strict
```

Watch HardKAS detect the causal violation, mark the artifact as corrupted, and explain exactly which deterministic invariant failed.
