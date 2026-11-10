---
title: hardkas programmability
---

# `hardkas programmability`

## `hardkas programmability capabilities`

### Synopsis (Generated)

**Purpose:** Show local programmability capabilities

#### Options

- `--json` (Default: `false`): Output as JSON (always: this command only prints JSON; the flag changes nothing)

---

## `hardkas programmability audit`

### Synopsis (Generated)

**Purpose:** Print the fixed list of what this build's programmability layers do not do (on-chain ZK verification, vProgs runtime, L2 bridge and exit, real stable-asset issuer): a static statement that inspects and runs nothing

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas programmability inspect`

### Synopsis (Generated)

**Purpose:** Inspect a Silver, ZK, or vProgs artifact: its schema and content hash. It never establishes node evidence for the artifact (artifactEvidence.realNodeEvidence: NOT_ESTABLISHED); the product's claims are in 'programmability capabilities'

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--kind &lt;kind&gt;`: Artifact kind: silver, zk, or vprog
- `--json` (Default: `false`): Output as JSON (always: this command only prints JSON; the flag changes nothing)

---

## `hardkas programmability verify`

### Synopsis (Generated)

**Purpose:** Verify a local programmability artifact's integrity. It never establishes node evidence for the artifact (artifactEvidence.realNodeEvidence: NOT_ESTABLISHED)

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--kind &lt;kind&gt;`: Artifact kind: silver, zk, or vprog
- `--json` (Default: `false`): Output as JSON (always: this command only prints JSON; the flag changes nothing)

---

## `hardkas programmability corpus verify`

### Synopsis (Generated)

**Purpose:** Verify the root Toccata programmability corpus

#### Arguments

- `&lt;path&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON (always: this command only prints JSON; the flag changes nothing)

---

## `hardkas programmability app plan`

### Synopsis (Generated)

**Purpose:** Return a local app plan for a programmable HardKAS app

#### Options

- `--kind &lt;kind&gt;` (Default: `full-lab`): silver, zk, vprog, or full-lab
- `--template &lt;path&gt;`: Template path
- `--json` (Default: `false`): Output as JSON (always: this command only prints JSON; the flag changes nothing)

---

