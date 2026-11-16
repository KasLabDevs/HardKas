---
title: hardkas history
---

# `hardkas history`

## `hardkas history`

### Synopsis (Generated)

**Purpose:** The history of an address over a bounded window of a Kaspa node's selected chain: every transaction accepted in it that pays the address or spends an output of it, with its depth; this workspace's own records merged in. The result says what the window covered and what it did not. Read-only; mainnet is refused

#### Arguments

- `&lt;address&gt;` (Required): 

#### Options

- `--since &lt;blockOrDaa&gt;`: Start of the window: a chain block hash (64 hex: the transactions accepted after it) or a DAA score (the transactions accepted at or above it). Default: the last --lookback chain blocks. Never before the node's pruning point
- `--lookback &lt;chainBlocks&gt;`: Default window: chain blocks back from the node's sink (default 1000, at most 100000)
- `--max-blocks &lt;n&gt;`: Chain blocks this call may walk back to the start, and read forward from it (default 10000 each, at most 200000); the rest is the result's continueFrom
- `--limit &lt;n&gt;`: Entries per page (default 100, at most 1000)
- `--cursor &lt;cursor&gt;`: The next page of the same window (page.nextCursor of a previous result)
- `--timeout &lt;seconds&gt;`: Deadline for the whole read (default 60, at most 600): a window cut short by it says so
- `--network &lt;name&gt;`: Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet)
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint
- `--no-workspace-records`: Do not merge this workspace's own records (submissions, receipts) into the history
- `--json` (Default: `false`): Output as JSON

---

