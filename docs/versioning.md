# Version Guarantees

HardKAS is currently in the `0.8.x-alpha` release cycle. While we are in alpha, we maintain strict guarantees over certain system boundaries while leaving others open for rapid iteration.

## 0.8.x Alpha Guarantees

### ✅ Stable
The following systems have been formally audited and their APIs/outputs are considered stable. Breaking changes to these will only occur on minor version bumps (e.g., `0.9.0`):
- **Artifact Schema**: The JSON structure of `TxPlanArtifact`, `SignedTxArtifact`, and `TxReceiptArtifact`.
- **Hashing Rules**: The cryptographic normalization and deterministic sorting logic used to generate `contentHash`.
- **Replay Semantics**: The rules and mathematical proofs the Replay Engine uses to determine state equivalence.

### ⚠️ Experimental
The following systems are under active development and their APIs may change without warning in patch versions:
- **Network Adapters**: Integrations with Kaspa mainnet RPC nodes, testnet sync logic, and L2 node clients.
- **Advanced CLI Workflows**: Commands under the `workflow` and `chaos` namespaces.
- **Future Integrations**: Third-party framework plugins (like Next.js/React hooks wrapper).
