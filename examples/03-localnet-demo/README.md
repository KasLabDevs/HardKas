# Example 03: Localnet Demo

This example showcases the full HardKAS developer experience on a local development environment.

## What it demonstrates

1.  **Environment Bootstrapping**: Ensuring the HardKAS runtime is up and reachable.
2.  **Network Diagnostics**: Printing detailed info about the local node and blockDAG state.
3.  **Identity & Balance Tracking**: Verifying the state of pre-funded localnet accounts.
4.  **Automated Workflow**: Running a complete transaction cycle (Plan -> Sign -> Send -> Confirm) with visual progress.
5.  **Runtime Integration**: Demonstrating how receipts are persisted for future explorer/query layer consumption.

## How to run

1.  Ensure your environment is ready:
    ```bash
    hardkas up
    ```

2.  Run the demo:
    ```bash
    pnpm example:localnet
    ```

## Terminal UX

The demo uses a structured, visual output to guide you through the process, making the complex blockDAG semantics feel intuitive and manageable.

```text
╔══════════════════════════════╗
║         HardKAS              ║
║      Localnet Demo           ║
╚══════════════════════════════╝

# Environment Diagnostics
------------------------
Network:    simulated
RPC Target: ws://127.0.0.1:18210
Status:     connected
...
```
