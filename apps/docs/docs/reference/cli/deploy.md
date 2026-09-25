---
title: hardkas deploy
---

# `hardkas deploy`

## `hardkas deploy init`

### Synopsis (Generated)

**Purpose:** Generate deployment profiles (Docker Compose, Dockerfile, .env.example) alpha

---

## `hardkas deploy track`

### Synopsis (Generated)

**Purpose:** Create a deployment record for a transaction stable

#### Arguments

- `&lt;label&gt;` (Required): 

#### Options

- `--network &lt;name&gt;`: Network where deployed
- `--tx-id &lt;txId&gt;`: Transaction ID
- `--plan &lt;artifactId&gt;`: Reference to plan artifact
- `--receipt &lt;artifactId&gt;`: Reference to receipt artifact
- `--status &lt;status&gt;` (Default: `sent`): Deployment status
- `--notes &lt;text&gt;`: Notes about this deployment
- `--json` (Default: `false`): Output as JSON

---

## `hardkas deploy list`

### Synopsis (Generated)

**Purpose:** List all tracked deployments stable

#### Options

- `--network &lt;name&gt;`: Filter by network
- `--status &lt;status&gt;`: Filter by status
- `--json` (Default: `false`): Output as JSON

---

## `hardkas deploy inspect`

### Synopsis (Generated)

**Purpose:** Show full details of a deployment stable

#### Arguments

- `&lt;label&gt;` (Required): 

#### Options

- `--network &lt;name&gt;`: Network
- `--json` (Default: `false`): Output as JSON

---

## `hardkas deploy status`

### Synopsis (Generated)

**Purpose:** Check deployment status (query RPC if available) stable

#### Arguments

- `&lt;label&gt;` (Required): 

#### Options

- `--network &lt;name&gt;`: Network
- `--verify` (Default: `false`): Verify against RPC node
- `--json` (Default: `false`): Output as JSON

---

## `hardkas deploy history`

### Synopsis (Generated)

**Purpose:** Show deployment history across all networks stable

#### Options

- `--json` (Default: `false`): Output as JSON

---

