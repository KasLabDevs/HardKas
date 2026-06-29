# SILVER_TOOLKIT_CLAIMS

The `SilverToolkit` in `@hardkas/toolkit` intentionally blocks any implicit assumption that its output is ready for Mainnet Kaspa or functionally identical to the real consensus engine.

Every operation that models the Kaspa Script VM (`build`, `simulate`, `artifact`, `evidence`) MUST strictly embed the following constraints in its returned payload:

```json
{
  "claims": {
    "realSilverCompiler": false,
    "vmConsensusEquivalence": false,
    "mainnetReady": false,
    "productionSafe": false,
    "simulatedOnly": true
  }
}
```

## Why this is required?
Kaspa script (Silver) is heavily constrained and still evolving. Providing an abstraction over it without a real integrated VM simulator might mislead developers into deploying unsafe scripts.

Until HardKAS integrates a full WASM/Rust Kaspa Consensus VM capable of byte-for-byte execution matching the node, all Silver interactions are explicitly mocked and simulated.
