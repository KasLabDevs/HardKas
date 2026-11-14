---
title: Covenant graph
description: The IDE's Covenant graph draws a compiled SilverScript contract, its deploys, entries and spends from HardKAS records, checked against the local node.
sidebar_label: Covenant graph
sidebar_position: 7
---

# Covenant graph

The **Covenant Graph** draws the life of one compiled SilverScript contract:

```text
deploy records ──► covenant (the P2SH output) ──► one node per entry ──► spend records
```

Open it from the rail, **View → Covenant graph**, the command palette, or right-click a `.sil` file → **Visualize in Covenant Graph**.

## Where the picture comes from

Everything drawn comes from HardKAS records under `.hardkas/artifacts/silver`:

- the **covenant** and its **entries** (name, dispatch tag, argument types, constructor parameters, address, locking script) from the compile record (`silverCompile-*.json`);
- each **deploy** from a deploy record (`silverDeploy-*.json`) that points at that compile record;
- each **spend** from a spend record (`silverSpend-*.json`), placed under the entry it called.

What has not happened is not drawn. A contract that was never deployed shows the covenant and its entries, and says so. With no compile record at all, the view says "Nothing to draw yet" and offers **Open the compiler**.

The contract picker appears when there are two or more contracts: the ones compiled in this session and every contract with a deploy record.

The toolbar has **Source** (open the `.sil` file), **Compile record**, the node check and **Deploy & Run**.

## Checking the records against the node

Records are what the CLI wrote, not what the chain holds. With the environment on **Local node** and the node running, **Check on node** asks the node what it holds at the covenant address (`hardkas rpc utxos <address>`). It asks again after every deploy or spend made from the IDE, and when you click **Check again**.

| Badge | Meaning |
| --- | --- |
| **on chain** | The deploy's output is still unspent on the node. |
| **spent** | A spend record consumed it. |
| **spent on chain** | The node no longer holds it, but no spend record names it: spent outside the IDE, or the CLI stopped waiting before the spend confirmed. |
| **live** | Records only (the node was not asked): the deploy was accepted and no spend record consumed it. |

Coins at the address that **no deploy record describes** appear as one dashed node, "Without a record", with their outpoints and total. The usual cause is a deploy whose block came after the CLI stopped waiting (see [When nothing confirms](./deploy-and-run.md#when-nothing-confirms)). The coins are locked by the covenant all the same, but Deploy & Run needs a deploy record to build a spend.

The legend at the bottom left says what the node check found and when.

## The inspector

Click a node to see its values, with copy buttons for the address, locking script, content hash, transaction and outpoint, and a button to open the record's JSON. A deploy can open its compile record, and an entry lists its spends. The inspector is hidden when the window is narrow.

## Watch out

- For a contract compiled in this session but never deployed from that compile, the graph also shows earlier deploys of any contract with the same name.
- The node check only works on the local node. On the simulator or testnet the badges come from the records alone.
