---
title: Artifacts, history and index
description: Browse HardKAS artifacts in the IDE, follow payments and contract calls in Run history, trace lineage, and query the index with read-only SQL.
sidebar_label: Artifacts, history and index
sidebar_position: 6
---

# Artifacts, history and index

Everything HardKAS does leaves an artifact under `.hardkas/artifacts`: plans, signed transactions, receipts, SilverScript records, traces. The IDE has four ways to look at them. None of them edits an artifact.

## The dev-server

The **Artifacts** panel and the **Lineage** view are live when HardKAS' dev-server runs (`hardkas dev`, on `http://127.0.0.1:7420`). Without it they show a snapshot read from disk and offer **Start dev-server**, which runs `hardkas dev --headless` in the Console. You can also start it with **Terminal → Start HardKas dev-server (headless)**.

The **Replay verify** buttons need the dev-server. Without it they fail with a message that asks you to start it.

## Artifacts panel

**Artifacts** (rail icon, **View → Artifacts**) lists the artifacts, newest first: kind, id, transaction id, mode, network, integrity and time. When the dev-server is off, a "Snapshot (dev-server off)" strip says so.

- The filter shows all kinds, or only plans, signed transactions, receipts or SilverScript records.
- **Open JSON** opens the artifact file in the editor.
- **Replay verify** (shield icon) asks the dev-server to replay the artifact and writes the verdict to the Console.

The list reloads after each transaction made from Deploy & Run; use the refresh button otherwise.

## Run history

**Run history** (button in Deploy & Run, rail icon, **View → Run history**) is a readable log of what you did: payments, contract deploys and entry calls. It reads the receipts and SilverScript records; it runs no command.

- Tabs: **All activity**, **Payments**, and one tab per deployed contract (with a lock icon while it holds coins).
- Totals: calls, KAS moved, fees paid, and coins still locked or accounts involved, plus each account's balance now.
- Each row: time, call, from → to, amount, fee, change or contract balance, and status. Row buttons copy the transaction id or open the artifact.

## Lineage

**Lineage** (rail icon, **View → Lineage graph**, or the Explorer's right-click menu) draws how artifacts derive from each other: a plan leads to a signed transaction, then to a receipt, and so on.

- **Timeline** (the default) is one row per artifact, newest on top, with colored lanes for the derivation. The filter box fades the rows that do not match.
- **Flow** is a graph you can pan and zoom, one row per flow.
- Select an artifact to see its id, transaction, mode and network, integrity, parent and replay state. **Open JSON** opens the file. **Replay verify** works for plans, signed transactions, receipts and submissions, and needs the dev-server. The verdict (passed, diverged, missing dependency, unsupported or error) shows on the node and in the Console.

New artifacts pulse for a few seconds when they arrive.

## Index view

HardKAS keeps an index of its artifacts, events, lineage links and workflow traces in `.hardkas/store.db`. The **Index** view (rail icon, **View → Index (artifacts, events, SQL)**) reads it. The IDE only reads that database. Anything that changes it goes through the CLI.

| Tab | What it shows |
| --- | --- |
| **Overview** | Whether the index is current, its counts and size, and breakdowns by kind, mode, network, event and trace status. Click a kind, mode or network bar to filter the Artifacts tab. Buttons: **Sync** (`hardkas query store sync`), **Rebuild** (`hardkas query store rebuild`, asks first), **Doctor** (`hardkas query store doctor`, answer in the Console) and **Check for problems**. A project with no index gets **Build the index**. |
| **Artifacts** | A table of everything indexed, 50 rows per page, with search (id, hash, transaction id, file, kind) and filters. Select a row for its JSON, its lineage and a field-by-field comparison with another artifact. |
| **Transactions** | Paste or pick a transaction id to see its artifacts in order (plan, signed, submission or receipt, trace), their key facts and their events. **Explain** runs `hardkas explain --tx` in the Console. |
| **SQL** | A read-only SQL console: one `SELECT`, `WITH`, `EXPLAIN`, `VALUES` or `PRAGMA` query at a time, at most 500 rows, stopped after 6 seconds. Ctrl+Enter runs it. It has the list of tables and columns, examples, a history of the last 20 queries and **Copy as CSV**. |
| **Problems** | **Run all checks** runs every HardKAS integrity check and lists what it finds: `hardkas doctor`, whether the index is current, `hardkas verify`, broken lineage links (`query lineage orphans`), receipts that differ from their replay (`query replay divergences`) and unfinished workflow traces. Click an item to open it. |

Good to know:

- When the index is behind the files on disk, the view says so and Overview offers **Sync now**.
- The counts are the index's. A few files under `.hardkas/artifacts` are not indexed on purpose, so a file count on disk will not match.
- **Doctor** can report problems even when the index is current: it also counts artifacts that fail verification, which **Problems** lists one by one.
