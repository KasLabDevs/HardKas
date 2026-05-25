# Anti-Pattern: L1/L2 Confusion

As HardKAS expands to support both Kaspa (L1) and Igra (L2), a common pitfall is treating them as a single, uniform protocol. This is **L1/L2 Confusion**.

## The Confusion

Assuming that because Igra is "built on Kaspa," it shares the same rules, address formats, or security guarantees.

### ❌ Pattern: "Protocol Parity" Assumption
- Assuming `kaspa:address` works as an EVM `0xaddress`.
- Assuming L1 UTXOs can be spent directly in L2 Smart Contracts.
- Assuming L2 transactions have "BlockDAG" properties (like parallel inclusion).

### ❌ Pattern: "Security Model" Leakage
- Assuming L2 transactions are "final" as soon as they are accepted by an Igra sequencer.
- Assuming L1 is as programmable as L2.

---

## The Reality Check

| Feature | Kaspa (L1) | Igra (L2) |
| :--- | :--- | :--- |
| **Model** | UTXO | Account-based |
| **VM** | Script (Limited) | EVM (Full Solidity) |
| **Address** | `kaspa:q...` | `0x...` |
| **Finality** | GHOSTDAG (Probabilistic) | Sequencer Batch + L1 Settlement |

## How to Avoid Confusion

1. **Explicit Schema Validation**: Always check the `schema` field in your artifacts. A `hardkas.txPlan.v2` is L1; a `hardkas.igraTxPlan.v1` is L2.
2. **Context-Aware RPCs**: Use separate RPC clients for L1 (`JsonWrpcKaspaClient`) and L2 (`JsonRpcEVMClient`). Do not attempt to send L2 payloads to L1 nodes.
3. **Artifact-First Workflow**: By using artifacts, you are forced to define the `networkId` (e.g., `simnet` for L1, `igra-dev` for L2), which makes the boundary explicit.

**Conclusion**: Treat Igra as a separate sovereign execution layer that settles on Kaspa. They are siblings, not twins.
