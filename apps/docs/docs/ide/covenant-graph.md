---
title: Covenant graph
description: The IDE's Covenant graph draws a compiled SilverScript contract, its deploys, entries and spends from HardKAS records, checked against the local node.
sidebar_label: Covenant graph
sidebar_position: 7
---

# <img src="/docs/img/ide/icons/covenant-graph.png" alt="" width="28" height="28" /> Covenant graph

![The Covenant graph of an escrow contract](/img/ide/covenant-graph.png)

The life of one compiled SilverScript contract: its **deploys** (left), the **covenant** (the P2SH output, centre), one node per **entry**, and the **spends** that called each entry (right). Open it from the rail or right-click a `.sil` file → **Visualize in Covenant Graph**.

Everything comes from HardKAS records in `.hardkas/artifacts/silver` (compile, deploy and spend records). What has not happened is not drawn.

Click a node to see its values in the **inspector** (address, locking script, constructor, entries) with copy buttons and a link to its record.

## Checking against the node

Records say what the CLI did, not what the chain holds. On **Local node**, **Check on node** asks the node what is still at the contract's address:

| Badge | Meaning |
| --- | --- |
| **on chain** | The deploy's coins are still there. |
| **spent** | A spend record used them. |
| **spent on chain** | Gone from the node, but no spend record says so (spent elsewhere, or the CLI stopped waiting). |
| **live** | Records only; the node was not asked. |

Coins at the address with no deploy record appear as a dashed node, "Without a record". Usually a deploy whose block came after the CLI stopped waiting ([When nothing confirms](./deploy-and-run.md#when-nothing-confirms)): the coins are locked, but Deploy & Run cannot spend them without the record.
