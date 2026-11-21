# Chapter 8: Localnet and Boundaries

HardKAS enforces strict boundaries between local experimentation and public network usage to protect developers from deploying untested smart contracts or leaking funds.

Create a project folder, initialize it, and run every command of the chapter from inside it:

```bash
mkdir boundary-project
cd boundary-project
```

```bash execute
hardkas init
```

By default, HardKAS runs its tests on the simulated ledger (`network: "simulated"`): a local UTXO ledger kept in `.hardkas/localnet.json` (`@hardkas/localnet`, not `@hardkas/simulator`), with no node and no script execution. `simnet` is not a simulation: it is a real Kaspa network run by a local `rusty-kaspad` node in Docker, either the managed localnet or a node of your own ([Run your own simnet node](../start/simnet-node.md)). Public testnets need an explicit opt-in in `hardkas.config.ts` (`network.allowPublic: true` with `experimental: true`), and mainnet is locked down in this release: no connection (reads included), no signing, no broadcast; no flag or policy lifts that.

If you attempt to write a test scenario that enforces a capability it doesn't possess, it will fail predictably.

(Optional) To spin up the managed localnet (a `rusty-kaspad` simnet node in Docker), you can run:

```bash docker-execute
hardkas localnet start --toccata
```

For basic verification, ensure your HardKAS environment is responsive:

```bash execute
hardkas status
```
