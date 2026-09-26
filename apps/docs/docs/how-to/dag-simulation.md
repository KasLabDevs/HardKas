---
title: DAG simulation
---

DAG commands and query views are research/dev tooling. They are useful to inspect conflicts, selected-path movement and local scenarios, but they are not rusty-kaspa validated consensus parity.

`hardkas dag status`View current local simulator DAG status.

`hardkas dag simulate-reorg --depth 1`Simulate a local DAG reorg.

`hardkas query dag conflicts --why`Explain local double-spend conflict analysis.

`hardkas query dag sink-path`Show selected path from genesis to sink.

`hardkas query dag displaced`Show displaced transactions.

`hardkas query dag history <txId> --why`Trace simulator DAG lifecycle for a transaction.
