# First Steps in HardKAS

Welcome to HardKAS! Here is a 5-minute practical guide to _feel_ the deterministic mental model.

### 1. Run a local transaction

```bash
pnpm transfer
```

This will run a simulated transfer and generate an **Artifact**.
_Notice the output narrating the causal execution._

### 2. Open the dashboard

```bash
hardkas dashboard
```

This boots the runtime UI. You will see the event timeline and the state projections.

### 3. Inspect the artifact

Navigate to the "Provenance" tab in the dashboard to see how your transaction artifact relates to the genesis state.

### 4. Run `hardkas explain`

In your terminal, copy the Artifact ID from step 1 and run:

```bash
hardkas explain <artifact_id>
```

This provides a deep, narrative explanation of the artifact's causality without needing the UI.

### 5. Break an artifact intentionally

Go into `.hardkas/artifacts/`, find the transaction JSON, and manually change the `amountSompi` value.

### 6. Run the consistency doctor

```bash
pnpm doctor --strict
```

Watch HardKAS detect the causal violation, mark the artifact as corrupted, and explain exactly which deterministic invariant failed.
