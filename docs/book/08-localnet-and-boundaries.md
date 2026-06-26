# Chapter 8: Localnet and Boundaries

HardKAS enforces strict boundaries between local experimentation and public network usage to protect developers from deploying untested smart contracts or leaking funds.

```bash execute
hardkas init boundary-project
cd boundary-project
```

By default, HardKAS runs its tests on `simnet` (a fully simulated memory graph) or a local Dockerized network (`localnet`). HardKAS prevents mainnet interaction unless explicitly overridden or allowed via policies.

If you attempt to write a test scenario that enforces a capability it doesn't possess, it will fail predictably.

(Optional) To spin up a local node with Docker, you can run:

```bash docker-execute
hardkas node start
```

For basic verification, ensure your HardKAS environment is responsive:

```bash execute
cd boundary-project
hardkas status
```
