---
title: DAG Simulation
description: The simulator's light-model DAG commands and query views, research tooling that is not rusty-kaspa consensus.
---

# DAG Simulation

The DAG commands and query views are research and development tooling. They help to look at conflicts, selected-path
movement and local scenarios, but they model a light DAG of the HardKAS simulator: they are not GHOSTDAG and claim no
parity with rusty-kaspa consensus. For a real node's DAG, use `hardkas rpc dag`.

```bash
hardkas dag status
hardkas dag simulate-reorg --depth 1
```

- `dag status` shows the simulator's DAG (mode, sink, blocks, selected path, accepted and displaced transactions) from
  `.hardkas/localnet.json`. It writes nothing: without that file, or without a DAG in it, it says so.
- `dag simulate-reorg --depth <n>` (a whole number of blocks, 0 or more; default 1) adds a side block `n` blocks back on
  the selected path and moves the sink to it. It keeps its DAG in `.hardkas/localnet.json` (creating the light model
  there on first use), with no transactions in it.

The `hardkas query dag` views (`conflicts`, `sink-path`, `displaced`, `history <txId>`, `anomalies`) read a light-model
DAG from `.hardkas/state.json`. No HardKAS command writes that file, so today each view fails with
`DAG_DATA_UNAVAILABLE` (exit 1; `status: "NO_DATA"` in `--json`) instead of answering "no conflicts" without data.
