---
title: hardkas doctor
---

# `hardkas doctor`

## `hardkas doctor`

### Synopsis (Generated)

**Purpose:** Perform a full system diagnostic and health report: local configuration, then the workspace's node (connectivity, network identity, sync, capability for a flow); mainnet is never contacted stable

#### Arguments

- `&lt;module&gt;` (Optional): 

#### Options

- `--json` (Default: `false`): Output results as stable JSON schema
- `--network &lt;name&gt;`: Check the node of this network of hardkas.config.ts (default: the workspace's network; mainnet is refused, a public testnet needs the payments' opt-in)
- `--url &lt;url&gt;`: Check the node at this endpoint, as the node of --network (default: the workspace's network)
- `--flow &lt;flows&gt;`: Report the node's capability for these flows and fail when one is not ready: payment, silver, covenant (comma-separated)
- `--timeout &lt;ms&gt;`: Bound the node check: connect and answer within this many milliseconds (default 8000)
- `--capabilities` (Default: `false`): With 'doctor node': report the node's capabilities (RPC, network, DAA advance) as JSON
- `--consistency` (Default: `false`): Run advanced deterministic consistency checks
- `--strict` (Default: `false`): Run the consistency checks in strict mode and report DOCTOR_FAILED when a check fails (any failed check exits 1)
- `--release` (Default: `false`): With 'doctor workspace': also run the release checks (git, schemas, claims, raw appends, browser imports)

---

