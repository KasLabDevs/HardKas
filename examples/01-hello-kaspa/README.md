# Example 01: Hello Kaspa

This example demonstrates the foundational step for any HardKAS application: connecting to a network and fetching basic diagnostic information.

## Prerequisites

Ensure your local development network (simnet) is running:

```bash
hardkas up
```

## Running the example

You can run this example using the workspace script:

```bash
pnpm example:hello
```

Or directly using `tsx`:

```bash
npx tsx examples/01-hello-kaspa/main.ts
```

## What it does

1.  **Initializes Hardkas**: Uses `Hardkas.create()` to automatically load your project configuration.
2.  **Connects to RPC**: Establishes a connection to the default network (simnet).
3.  **Fetches Info**: Calls `rpc.getInfo()` to retrieve network state.
4.  **Prints Diagnostics**: Displays DAA score, blue score, and other native Kaspa metrics.
