---
title: Deploy & Run
description: Send payments with plan, sign and send, deploy SilverScript contracts, call their entries and run covenant transitions from the HardKAS IDE.
sidebar_label: Deploy & Run
sidebar_position: 4
---

# Deploy & Run

**Deploy & Run** (rail icon, or **Run → Open Deploy & Run**) is a form over HardKAS' transaction and contract commands. Each button runs a `hardkas` command that you can follow in the Console, and every result is a HardKAS artifact under `.hardkas/artifacts`.

While the local node is starting, stopping or resetting, the view is covered until the node is ready.

## The top of the view

- **Environment**: Simulator (`simulated`), Local node (`simnet`) or Public testnet (`testnet-10`). It is the same choice as in the environment bar.
- **Run history** opens the [history of payments, deploys and contract calls](./artifacts-and-index.md#run-history).
- **Fund `<account>`** gives the selected **From** account 100 KAS on the local node (`hardkas localnet fund <account> --amount 100`). It always funds on the local node, whichever environment is selected, so on testnet you need testnet coins from elsewhere.
- Three tabs: **All**, **Covenants** and **Transfers**.

## Payments (Transfers)

| Field | Meaning |
| --- | --- |
| From | The paying account. |
| To | An account, or any address typed in. |
| Amount (KAS) | 10 by default. |

**Plan → Sign → Send** runs the three steps in a row. **Plan**, **Sign** and **Send** run one step at a time, so you can look at each artifact first:

1. **Plan**: `hardkas tx plan --from <a> --to <b> --amount <kas>` for the chosen environment. The card shows the plan id, the amount and the estimated fee.
2. **Sign**: `hardkas tx sign <plan> --account <from>`. The card shows the signed id and the transaction id.
3. **Send**: `hardkas tx send <signed>`. The card shows the submission or receipt: status, fee and mass, network, and the blue score or DAA score it was accepted at.

Each card has **open** to show its JSON. **Check status on the node** runs `hardkas tx status <txId>` and shows the state and the confirmations.

**Watch out:** there is no confirmation dialog. On **Public testnet**, **Send** sends the transaction at once.

## Contracts

Contracts are deployed and called on the **local node**. On another environment the view says "Contracts deploy on Local node (rusty-kaspad)." and offers **Switch to Local Node**: switch before you deploy. The simulator does not run contract scripts, so it cannot tell you whether a contract works.

### Deploy

**Compiled contract** shows the last contract you compiled in the [compiler](./editor-and-compiler.md): its name, entries, state fields and P2SH address.

1. Fill the **constructor arguments**. A public-key parameter can take an account: the IDE puts that account's key in.
2. Pick **Fund from** (the paying account) and **Value (KAS)** (5 by default): the amount locked in the contract.
3. Click **Deploy `<Name>`**. The IDE compiles again with those arguments, then runs `hardkas silver deploy <compile record> --from <account> --amount <kas> --wait --timeout 600`.

For a covenant contract, **Genesis `<Name>`** creates the covenant instead (`hardkas silver covenant genesis … --wait --timeout 600`).

**SDK** writes TypeScript bindings for the contract to `contracts/<Name>.ts` and opens the file. It replaces that file if it already exists.

### Call an entry (spend)

**Deployed contracts · N** lists the deploys of the contract; tick **show spent** to see the spent ones too. Each deploy has a **record** link to its JSON and one form per entry:

- one input per argument: a signature is made with the account you choose, a `bool` is a choice, other values are typed as hex or numbers;
- **to**: who receives the output (`bob` by default);
- **sequence**: optional.

**`<entry>` → spend `<value>`** runs `hardkas silver spend <deploy record> --entry <entry> --to <account> --args <file> --wait --timeout 600`. The arguments file is kept under `.hardkas/ide/spend-args/`.

### Covenant transitions

**Toccata Covenants (v1) · N** lists the covenant chains, each with its covenant id, its head record and its lineage. For every policy there is a form with the next state; **Advanced** adds the state map, constructor arguments, compute budget and fee. **Transition · `<policy>`** runs `hardkas silver covenant transition …` and says "Transition confirmed" when it lands.

## When nothing confirms

On the local node, blocks only exist while the miner runs (see [The miner](./local-node-and-accounts.md#the-miner)). When the miner is not running, Deploy & Run shows a small miner box with **Mine a burst** and **Start miner** or **Stop miner**.

A deploy, spend or transition waits for its block for up to 600 seconds ("Deploying…", "Spending…"). If no block comes in that time, the CLI gives up and the IDE shows an error. The transaction may still be in the node's mempool and confirm later, but **no record is written**. Without a deploy record, Deploy & Run cannot build a spend for it. The [Covenant graph](./covenant-graph.md) shows such coins as "Without a record". Start the miner before you deploy to avoid this.
