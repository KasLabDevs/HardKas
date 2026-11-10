---
title: Security Boundaries
---

### Policy Gates

Mainnet is locked down in this release: HardKAS makes no connection to a mainnet node (reads included, even to an endpoint you declare), signs nothing for it and broadcasts nothing to it. These are constants, not settings: no flag, option, environment variable or configuration enables them (`MAINNET_CONNECTION_DISABLED`, `MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`).

### Infrastructure, not Custody

HardKAS is developer infrastructure, not a custody or consensus-security layer.

**Main rule.** If a feature is not in the capability report (the SDK's `capabilities.get()`, derived from the checks the features themselves use), agents and docs should not imply that it exists.
