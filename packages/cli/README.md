# `@hardkas/cli`

The HardKAS command line: create a Kaspa project, plan a transaction, sign it, send it, follow its state and verify the evidence of every step — on a local simulator or against a real `rusty-kaspad` node in Docker.

> **Release scope.** This release supports the Golden Core shown on this page, on the simulator and on a local node you control. It is not qualified for testnet-10 or mainnet. Other commands listed by `hardkas --help` are experimental.

## Install

Requirements: Node.js 22.5 or newer and npm. Docker only for the local node.

```bash
mkdir my-kaspa-app && cd my-kaspa-app
npx @hardkas/cli@rc init .
npm install --save-dev @hardkas/cli@rc
```

`init` writes a `package.json` (an ES module project, with `@hardkas/sdk` and `@hardkas/testing` pinned to this CLI's version), `hardkas.config.ts`, a first test in `test/payment.test.ts` and a local simulator whose accounts (`alice`, `bob`, …) start with 1000 KAS each. Installing `@hardkas/cli` in the project makes `npx hardkas` run this CLI.

`init` also installs the Kaspa WASM SDK this release pins, `kaspa-wasm` 2.1.0 from the official rusty-kaspa release, into `~/.hardkas/toolchains/` (or `$HARDKAS_HOME`), and checks it against its pinned SHA-256. Signing, planning and the generated test use it. If that step fails, `init` stops with an error. `npx hardkas toolchain install kaspa-wasm` installs it by hand (add `--from-file <asset>` without a network connection), and `npx hardkas toolchain status` shows what is installed.

Install with the `rc` tag or an exact version.

## Quickstart

The simulator needs no node and no Docker.

```bash
npm test
npx hardkas accounts balance alice --network simulated
npx hardkas tx send --from alice --to bob --amount 25 --network simulated --yes
npx hardkas accounts balance bob --network simulated
```

## First transaction

The same payment, one step at a time. Every step writes an artifact you can verify.

```bash
npx hardkas tx plan --from alice --to bob --amount 10 --network simulated --out plan.json
npx hardkas tx sign plan.json --account alice --out signed.json
npx hardkas tx send signed.json --network simulated --yes
npx hardkas verify signed.json
npx hardkas why <receipt artifact id printed by tx send>
```

In the simulator HardKAS executes the payment itself; nothing is broadcast to a network.

### Against a local node

A real `rusty-kaspad` node in Docker, funded by mining. The keys below are development keys stored in plaintext in `.hardkas/`; use them only on this local node.

```bash
npx hardkas localnet start --toccata
npx hardkas accounts real generate --name miner --unsafe-plaintext --yes
npx hardkas accounts real generate --name ana --unsafe-plaintext --yes
npx hardkas localnet fund miner --keep-miner
npx hardkas tx plan --from miner --to ana --amount 10 --network simnet --out plan.json
npx hardkas tx sign plan.json --account miner --out signed.json
npx hardkas tx send signed.json --network simnet --yes
npx hardkas tx status <txId printed by tx send>
npx hardkas tx wait <txId> --until confirmed
npx hardkas accounts balance ana --network simnet
npx hardkas verify signed.json
npx hardkas localnet stop --toccata
```

`localnet fund` mines until the account has spendable coins. With `--keep-miner` the miner keeps running, so new blocks keep arriving and the transaction gets accepted and confirmed; without it the miner stops and the node stays still until you mine again. `localnet stop` stops the node, and the miner, which shares its network, stops with it.

`tx status` and `tx wait` report what the node has been observed to do with the transaction — `SUBMITTED`, `MEMPOOL_ACCEPTED`, `ACCEPTED`, then `CONFIRMED` once it has at least 100 blue-score confirmations. That threshold is a HardKAS default, not a Kaspa parameter. Once the state is reached, `tx wait` also waits, within the same `--timeout`, until the node's UTXO view lists the new outputs and no longer lists the spent inputs, so the balance you read next is current; if the view does not catch up in time it fails with `TX_WAIT_UTXO_VIEW_STALE`.

## Evidence

- `hardkas verify <artifact>` recomputes the artifact's hash and checks its schema and the lineage it declares; it fails if the artifact was altered.
- `hardkas why <artifact id>` walks an artifact's lineage back to its plan.
- `hardkas explain <artifact id>` describes an artifact; for network submissions it reports the state derived from recorded observations.

## Reference

The full command reference lives in the repository: [`docs/reference/cli.md`](https://github.com/KasLabDevs/HardKas/blob/main/docs/reference/cli.md).
