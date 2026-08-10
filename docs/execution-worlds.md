# Execution Worlds

HardKAS 0.12.0 introduces the concept of **Execution Worlds** to guarantee deterministic execution and strict isolation between synthetic (simulated) data and real Kaspa networks.

You must never conflate the Simulator with Localnet (Kaspa simnet). They are distinct execution environments with different backends, funding mechanisms, and states.

## Execution Modes Matrix

| Mode      | Backend             | Accounts      | Funding   | UTXOs      | PoW     | Receipts    |
| --------- | ------------------- | ------------- | --------- | ---------- | ------- | ----------- |
| Simulator | JS/in-memory        | synthetic     | synthetic | synthetic  | No      | simulated   |
| Localnet  | rusty-kaspad/Docker | kaspa simnet  | mining    | real local | Yes     | node-backed |
| RPC       | configured node     | network-valid | external  | real       | network | node-backed |

## Invariants
- **Identity Isolation**: A `synthetic` account can only sign transactions for the Simulator. It cannot be used on Localnet.
- **Cross-World Lineage**: An artifact generated in one execution world (e.g. `mode: "localnet"`) cannot be verified, signed, or replayed in a different world (e.g. `mode: "rpc"`). HardKAS enforces strict runtime guards (`assertExecutionCompatibility`) to prevent this.
- **No Implicit State**: You must resolve the `ExecutionTarget` before attempting to interact with the blockchain. Never infer execution mode from an account name or network string.
