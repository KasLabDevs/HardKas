# HardKAS Quick Start

Welcome to HardKAS, the guided local blockchain experimentation laboratory.

HardKAS changes the way developers interact with blockchain runtimes. Instead of dealing with opaque nodes and hidden state, HardKAS provides a **living runtime** where every action leaves a deterministic, replayable artifact.

## 1. Installation

Ensure you have Node.js 20+ installed.

```bash
pnpm install
pnpm build
```

## 2. Launching the Sandbox

The best way to experience HardKAS is the Sandbox mode. Sandbox gives you an ephemeral workspace where you can freely experiment, break things, and learn without polluting your main repository.

```bash
hardkas sandbox --with-node
```

The sandbox provisions a temporary workspace, starts the HardKAS developer server, and opens the Observability Dashboard automatically.

## 3. Running Recipes

Inside the sandbox, you can run interactive recipes that automatically generate real transactions, artifacts, and demonstrate workflow capabilities.

```bash
hardkas sandbox --recipe transfer
```

This recipe will:

1. Generate a deterministic transaction plan.
2. Sign the transaction payload.
3. Submit the transaction and record the receipt.
4. Reflect all activity instantly in the Dashboard.

## 4. The Observability Dashboard

When the dashboard opens, you will see:

- **Cockpit**: Your control center, displaying connected accounts and the real-time activity stream.
- **Workflow Graph**: Visualizes the `Plan -> Signed -> Receipt -> Replay` causal chain.
- **Truth Status**: Shows the canonical artifact lattice acting as the ground truth of your workspace.

## 5. Next Steps

- Proceed to the [Sandbox Tutorial](./sandbox-tutorial.md) to explore failure injection and recovery.
- Check out the [Replay Verification Tutorial](./replay-tutorial.md) to understand deterministic testing.
