# Testing & Qualification

Welcome to the HardKAS Testing & Qualification documentation.

Because HardKAS is a determinism and evidence-oriented framework, **how we prove** a feature works is just as important as the feature itself.

This section defines the canonical vocabulary for capability tracking, evidence isolation, and test suite execution.

* **[Evidence Levels & Qualification Model](./evidence-levels.md):** Understand the difference between L2 (Simulator) and L3 (Localnet) evidence, and how `IMPLEMENTED` differs from `QUALIFIED`.
* **[Test Suites & Commands](./test-suites.md):** How to run the tests, where to place new tests, and how HardKAS enforces strict evidence isolation (no silent skipping if Docker is unavailable).

### Core Principle

> **Documentation communicates qualification; it does not manufacture it.**

A capability is only marked as `L3` if there is a `*.localnet.test.ts` (or equivalent automated run) proving it works against a real Kaspa node. An anecdotal run by a developer does not qualify as permanent L3 evidence.
