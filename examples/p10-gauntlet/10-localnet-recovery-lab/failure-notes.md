# Predicted Friction Points

- `localnet.start()` might require Docker to be running, which could throw an unhandled error if it's not.
- Corrupting `localnet.json` while the localnet is running in the background might leave zombie Docker containers if `stop()` relies on `localnet.json` to find the container ID.

## Actual Friction Encounters

1. **State File Confusion**: The simulated localnet (`profile: "simulated"`) does not create a `localnet.json` state file at all. It runs entirely in-memory within the SDK runtime.
2. **Missing Stop Method**: `sdk.localnet.stop()` is not implemented in the SDK facade. The SDK only supports `start()`, `status()`, and `fund()`. Developers must rely on process exit to tear down the simulated localnet, or use the CLI for Toccata Docker localnets.
