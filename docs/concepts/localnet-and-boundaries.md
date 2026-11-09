# Chapter 8: Localnet and Boundaries

HardKAS enforces strict boundaries between local experimentation and public network usage to protect developers from deploying untested smart contracts or leaking funds.

```bash execute
hardkas init boundary-project
cd boundary-project
```

By default, HardKAS runs its tests on the in-memory simulator (`network: "simulated"`). `simnet` is not a simulation: it is a real Kaspa network run by a local `rusty-kaspad` node in Docker, either the managed localnet or a node of your own ([Run your own simnet node](../start/simnet-node.md)). Public testnets need an explicit opt-in in `hardkas.config.ts`, and mainnet signing and broadcast are refused in this release: no flag or policy lifts that.

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
