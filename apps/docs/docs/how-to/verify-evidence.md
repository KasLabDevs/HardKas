---
title: Verifying & Explaining Evidence
---

import QualificationContext from '@site/src/components/QualificationContext';

When HardKAS operates, it leaves a trail of evidence in the `.hardkas/artifacts/` Canonical Store. The CLI provides tools to interrogate this evidence interactively.

## 1. Verify Workspace Integrity

```bash
hardkas verify
```

**What it does:**
- Scans all JSON artifacts in `.hardkas/artifacts/`.
- Validates each payload against its official schema.
- Recomputes the `contentHash` and ensures it matches the payload perfectly.
- Ensures the `parentArtifactId` and `rootArtifactId` links are unbroken (i.e., no missing causal dependencies).

**Contract:** `verify` only checks cryptographic and schema integrity of the files on disk. It does **not** validate transactions against a live Kaspa node. When verifying a single artifact, it will attempt a deterministic replay audit if supported by the environment, but in recursive workspace mode it strictly verifies DAG continuity and semantic integrity.

## 2. Explain an Artifact

```bash
hardkas explain <artifactId | path>
```

**What it does:**
Produces a human-readable, deterministic explanation of a specific event. HardKAS reads the artifact, identifies its schema, traverses its lineage backward, and prints out the causal story.

**Resolution Contract:**
You must provide either the exact 64-hex `artifactId` (the Canonical Identity) or the workspace-relative path to the `.json` file. You **cannot** use a `txId` or `contentHash` here, due to strict namespace separation.

## 3. Why did this happen? (Lineage Graph)

```bash
hardkas why <artifactId | path>
```

**What it does:**
Similar to `explain`, but focuses purely on the causal graph. It walks the `parentArtifactId` references all the way to the root of the workflow (the initial Intent/Plan) and prints the unbroken chain of events that resulted in this artifact.

<QualificationContext capabilityId="artifacts" />
