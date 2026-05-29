# Philosophy: The Living Runtime

HardKAS refers to its core execution environment as a **Living Runtime**. This isn't just marketing terminology; it reflects a profound shift in how the developer interacts with the blockchain.

## Static vs. Living

In traditional environments, a local testnet is static. You start it, it waits for input, and if it crashes, it dies. The developer is completely responsible for feeding it state and keeping it alive.

A **Living Runtime**, conversely, continuously interacts with its environment:

- It actively watches your filesystem for new transaction artifacts.
- It automatically projects new events into a queryable database.
- It actively verifies the lineage of incoming data, ensuring causal integrity.
- It quarantines bad artifacts before they can corrupt your workflow.

## Instant Feedback Loop

Because the runtime is living, the feedback loop is instantaneous.

When you run a command like `hardkas dev tx send`, the CLI creates an artifact on disk. The Living Runtime (running in the background via `hardkas dev`) instantly detects this file creation via filesystem events, validates it, and updates the local projection.

This is what allows the HardKAS Dashboard to update in real-time without polling. The Living Runtime pushes Server-Sent Events (SSE) to the dashboard the millisecond a new artifact is verified.

You are no longer interacting with a static database; you are observing a living organism processing deterministic causal events.
