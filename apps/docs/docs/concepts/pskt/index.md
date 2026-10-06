# PSKT (Portable Signing Sessions)

Welcome to the HardKAS PSKT documentation.

:::warning Unavailable in this build
No PSKT adapter implements an operation in this build: `hardkas pskt export`, `import`, `sign`, `merge`, `finalize` and `extract` refuse with a typed error, and `hardkas pskt capabilities` reports every operation as unavailable. `hardkas pskt inspect` shows a session file's metadata only: it does not decode the payload, so it shows no inputs, outputs, amounts or recipients and is no pre-signing check. These pages describe the upstream protocol, not something this build runs.
:::

PSKT (Partially Signed Kaspa Transactions) is the upstream Kaspa protocol for coordinating distributed cryptographic authority.

* **[What is PSKT?](./what-is-pskt.md):** Understand the difference between PSKT (a transport container) and Multisig (a spending condition).
* **[The Lifecycle](./lifecycle.md):** Map the exact boundaries between Partial Signatures, Combination, Finalization, and Extraction.
* **[Security & Privacy](./security.md):** Learn why PSKTs are not perfectly secret and why signers must trust their inspection tools.

## Upstream vs HardKAS Evidence

HardKAS would wrap the upstream implementation through an adapter; this build has none that works.

| Capability | Upstream Kaspa Primitive | HardKAS Command | Status in this build |
| :--- | :--- | :--- | :--- |
| **Inspect** | `psktInspect` | `hardkas pskt inspect` | session metadata only (the payload is not decoded) |
| **Sign** | `psktSign` | `hardkas pskt sign` | UNAVAILABLE (refuses) |
| **Combine** | `psktCombine` | `hardkas pskt merge` | UNAVAILABLE (refuses) |
| **Finalize** | `psktFinalize` | `hardkas pskt finalize` | UNAVAILABLE (refuses) |
| **Extract** | `psktExtract` | `hardkas pskt extract` | UNAVAILABLE (refuses) |

## PSKT vs Normal Signing

| Concept | Normal Local Signing | PSKT |
| :--- | :--- | :--- |
| **Authority** | Available locally and synchronously. | Deferred, offline, or distributed. |
| **Network** | HardKAS requires node RPC to plan & submit. | Signer requires zero network access. |
| **Output** | Raw `SignedTxArtifact` ready for broadcast. | Intermediate binary envelope requiring extraction. |

To see the workflows in action, review the [Create & Inspect](../../guides/pskt/create-and-inspect.md) and [Offline Signing](../../guides/pskt/offline-signing.md) guides.
