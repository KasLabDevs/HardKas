---
title: "hardkas watch command"
sidebar_label: "hardkas watch"
description: "Reference for the hardkas watch command, with its arguments, options and defaults."
---

# `hardkas watch`

## `hardkas watch`

### Synopsis (Generated)

**Purpose:** Watch an address's UTXOs on a Kaspa node: one line per event (outputs added, removed, matured; a resync after every reconnect; errors), covenant outputs labelled. Read-only; mainnet is refused

#### Arguments

- `&lt;address&gt;` (Required): 

#### Options

- `--network &lt;name&gt;`: Network from the workspace config: its declared endpoint, and the node must prove it serves that network (default: the workspace's network; outside a workspace, the --url or the canonical localnet)
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint
- `--timeout &lt;seconds&gt;`: Stop after this many seconds (default: until interrupted)
- `--until &lt;n&gt;`: Stop after n events (added, removed, matured or resync)
- `--json` (Default: `false`): JSON lines: one compact JSON document per event (snapshot first, end last)

---

