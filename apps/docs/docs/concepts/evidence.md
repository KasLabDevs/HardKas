---
title: Evidence Model
---

import QualificationContext from '@site/src/components/QualificationContext';

HardKAS enforces accountability through its **Evidence Model**. Every significant state mutation generates durable, verifiable proof in the form of **Artifacts**.

## The "Day After" Guarantee

The defining architectural question of HardKAS is:

> **If you close HardKAS, shut down your computer, return the next day, and only have the `.hardkas/` folder remaining... what can the system still prove?**

Because HardKAS explicitly separates runtime convenience from durable evidence, the answer is: **Everything.**

The `.hardkas/` directory acts as the **Canonical Store**. Even if all caches, local nodes, and temporary SQLite databases (`query-store`) are destroyed, HardKAS can perfectly reconstruct the entire causal history, verify the cryptographic integrity of every step, and explain exactly how a state transition occurred.

## The Evidence Model Map

```text
                     HARDKAS EVIDENCE MODEL

Runtime operation
       │
       ▼
    Artifact
       │
       ├── artifactId ───────► canonical identity
       │
       ├── contentHash ──────► integrity
       │
       ├── lineage ──────────► causal relationship
       │
       ├── provenance ───────► how/where it was produced
       │
       └── domain IDs
              │
              ├── txId
              └── planId [legacy compatibility only]

              Evidence DAG
                   │
          ┌────────┼────────┐
          ▼        ▼        ▼
        PLAN     SIGNED   RECEIPT
```

## Identity vs. Integrity Namespaces

A critical invariant of the HardKAS Evidence Model is the strict separation of identities.

### `artifactId`
The canonical identity of an artifact within the HardKAS developer workspace. It is used to locate, reference, and query the artifact. It uniquely identifies the *event* of the artifact's creation.

### `contentHash`
A deterministic cryptographic hash of the artifact's semantic payload. It provides **integrity**. If an artifact is tampered with on disk, its `contentHash` will no longer match its body.
> **Note:** `contentHash` is *never* used as a locator. Two identical transactions generated a second apart will have the same `contentHash` but distinct `artifactId`s.

### `txId`
The transaction identity as defined by the Kaspa protocol. HardKAS does not control this hash; it is the mathematical result of the Kaspa node hashing the final signed transaction bytes.

### `planId` (Legacy Compatibility)
In early versions of HardKAS, plans were tracked via `planId`. This identifier is preserved strictly for explicit legacy compatibility where supported by the artifact resolver (e.g., resolving historical plans). It is **not** an alias for `artifactId`.

## Lineage and Provenance

Artifacts are never isolated. They retain **provenance** (who created them, in what execution environment, under what runtime version) and **lineage** (what artifact directly preceded them). 

Because every artifact cryptographically links to its parent (`parentArtifactId`) and the start of the workflow (`rootArtifactId`), the entire history of a transaction forms a directed acyclic graph known as the **Evidence DAG**.

## Verification

Because of this strict separation, HardKAS can independently verify that:
1. The artifact found at `artifactId` has not been tampered with (via `contentHash`).
2. The transaction submitted to the node actually corresponds to the payload we signed (via `txId` correlation in the `TxReceiptArtifact`).
3. The entire execution sequence was unbroken (via the Evidence DAG).

<QualificationContext capabilityId="deterministicHashing" />
