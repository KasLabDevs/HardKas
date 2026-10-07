---
title: Bridge local simulation
---

The local bridge simulation (`@hardkas/bridge-local`) belongs to the Igra L2 Lab, not to the HardKAS L1 core: the L1 CLI registers no `bridge` or `l2` command group, so there are no `hardkas bridge …` or `hardkas l2 …` commands to run.

The Lab models developer bridge-entry flows as deterministic local simulation utilities, never as a production bridge implementation. Its bridge model is pre-ZK:

Field

Expected meaning

`trustlessExit`

`false` in pre-ZK phase.

`l2BridgeCorrectness`

Unimplemented unless explicitly implemented in source.

`phase`

Used to distinguish current assumption model from future ZK exit.
