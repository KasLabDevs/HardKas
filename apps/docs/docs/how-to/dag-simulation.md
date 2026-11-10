---
title: DAG simulation
---

DAG commands and query views are research/dev tooling. They are useful to inspect conflicts, selected-path movement and local scenarios, but they are not rusty-kaspa validated consensus parity.

`hardkas dag status`View current local simulator DAG status.

`hardkas dag simulate-reorg --depth 1`Simulate a local DAG reorg.

The `query dag` views (`conflicts`, `sink-path`, `displaced`, `history <txId>`, `anomalies`) read a light-model DAG from `.hardkas/state.json`. No HardKAS command writes that file (`dag simulate-reorg` keeps its DAG in `.hardkas/localnet.json`, with no transactions in it), so today each view fails with `DAG_DATA_UNAVAILABLE` (exit 1; `status: "NO_DATA"` in `--json`) instead of answering "no conflicts" without data. For a real node's DAG, use `hardkas rpc dag`.
