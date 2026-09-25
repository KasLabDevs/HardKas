# PSKT (Portable Signing Sessions)

Welcome to the HardKAS PSKT documentation.

PSKT (Partially Signed Kaspa Transactions) is the upstream Kaspa protocol for coordinating distributed cryptographic authority.

* **[What is PSKT?](./what-is-pskt.md):** Understand the difference between PSKT (a transport container) and Multisig (a spending condition).
* **[The Lifecycle](./lifecycle.md):** Map the exact boundaries between Partial Signatures, Combination, Finalization, and Extraction.
* **[Security & Privacy](./security.md):** Learn why PSKTs are not perfectly secret and why signers must trust their inspection tools.

## Upstream vs HardKAS Evidence

HardKAS acts as an orchestration wrapper around the native Kaspa Rust implementation.

| Capability | Upstream Kaspa Primitive | HardKAS Wrapper | Status |
| :--- | :--- | :--- | :--- |
| **Inspect** | `psktInspect` | `hardkas pskt inspect` | IMPLEMENTED |
| **Sign** | `psktSign` | `hardkas pskt sign` | IMPLEMENTED |
| **Combine** | `psktCombine` | `hardkas pskt merge` | IMPLEMENTED |
| **Finalize** | `psktFinalize` | `hardkas pskt finalize` | IMPLEMENTED |
| **Extract** | `psktExtract` | `hardkas pskt extract` | IMPLEMENTED |

## PSKT vs Normal Signing

| Concept | Normal Local Signing | PSKT |
| :--- | :--- | :--- |
| **Authority** | Available locally and synchronously. | Deferred, offline, or distributed. |
| **Network** | HardKAS requires node RPC to plan & submit. | Signer requires zero network access. |
| **Output** | Raw `SignedTxArtifact` ready for broadcast. | Intermediate binary envelope requiring extraction. |

To see the workflows in action, review the [Create & Inspect](../../guides/pskt/create-and-inspect.md) and [Offline Signing](../../guides/pskt/offline-signing.md) guides.
