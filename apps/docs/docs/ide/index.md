---
title: HardKAS IDE
description: The HardKAS IDE is a desktop workbench for HardKAS projects on Kaspa L1. What each part does, what it needs and where to start.
sidebar_label: HardKAS IDE
---

# HardKAS IDE

A desktop app for HardKAS projects: editor, SilverScript compiler, Deploy & Run, local node, accounts, artifacts, tests, terminals and an assistant, in one window. It has its own releases on [KasLabDevs/HardKasIDE](https://github.com/KasLabDevs/HardKasIDE). These pages describe version 0.3.0.

![The HardKAS IDE with a SilverScript contract open](/img/ide/workbench.png)

## How it works

- **It runs the HardKAS CLI.** Every button is a `hardkas` command. The [Console](./console-and-terminal.md) shows each one, and the records are the CLI's own artifacts under `.hardkas/`.
- **A project is a normal folder** with `hardkas.config.ts` and `.hardkas/`. Open it from a terminal or another editor whenever you like.
- **It runs on your machine.** The app starts a small server at `http://127.0.0.1:7421` that only answers the machine itself.

## Environments

Pick one in the environment bar at the top:

| Environment | What it is | Needs |
| --- | --- | --- |
| **Simulator (in-memory)** | HardKAS' synthetic simulator. Instant, no node. | Nothing |
| **Local node (Docker, simnet)** | HardKAS' own rusty-kaspa node on a private simnet. | Docker Desktop |
| **Public testnet (RPC)** | Kaspa testnet-10. | Network, testnet coins |

They are separate worlds: what exists in one does not exist in the others, and a result on the simulator or the local node says nothing about testnet.

The IDE starts on **Local node**. It works with one local node, HardKAS' own; the **Cluster** of extra nodes from earlier versions was removed in 0.3.0.

## What it needs

- **Node.js 24.22.1 with npm** on the `PATH`.
- **Docker Desktop** for the local node (not for the simulator).
- **Internet** to create projects, and for testnet, the assistant, update checks and extensions.

The IDE uses the project's own `hardkas` CLI when there is one, otherwise `npx @hardkas/cli`. The status bar shows the version and turns amber if it is not the one the IDE was tested with.

## Pages

| | Page | What it covers |
| --- | --- | --- |
| | [Install and first start](./install.md) | Installers, unsigned-installer warnings |
| <img src="/docs/img/ide/icons/explorer.png" alt="" width="20" height="20" /> | [Projects and workbench](./projects-and-workbench.md) | Home, new project, layout, palette, search |
| <img src="/docs/img/ide/icons/compiler.png" alt="" width="20" height="20" /> | [Editor and compiler](./editor-and-compiler.md) | SilverScript support, compiling |
| <img src="/docs/img/ide/icons/deploy-run.png" alt="" width="20" height="20" /> | [Deploy & Run](./deploy-and-run.md) | Payments, deploys, entry calls |
| <img src="/docs/img/ide/icons/servers.png" alt="" width="20" height="20" /> | [Local node and accounts](./local-node-and-accounts.md) | Node, miner, explorer, accounts |
| <img src="/docs/img/ide/icons/index.png" alt="" width="20" height="20" /> | [Artifacts, history and index](./artifacts-and-index.md) | Artifacts, run history, lineage, SQL |
| <img src="/docs/img/ide/icons/covenant-graph.png" alt="" width="20" height="20" /> | [Covenant graph](./covenant-graph.md) | A contract's deploys and spends |
| <img src="/docs/img/ide/icons/tests.png" alt="" width="20" height="20" /> | [Tests and debugging](./tests-and-debugging.md) | vitest and the debugger |
| | [Console and terminal](./console-and-terminal.md) | Command log and real shells |
| <img src="/docs/img/ide/icons/assistant.png" alt="" width="20" height="20" /> | [Assistant](./assistant.md) | OpenCode, Chat and Agent, API keys |
| <img src="/docs/img/ide/icons/plugins.png" alt="" width="20" height="20" /> | [Plugins and extensions](./plugins-and-vsx.md) | Plugins, Open VSX themes |
| <img src="/docs/img/ide/icons/settings.png" alt="" width="20" height="20" /> | [Settings and updates](./settings-and-updates.md) | Settings view, update checker |

## From another AI agent

The IDE ships an MCP server that its assistant uses. Other MCP clients (Claude Code, Cursor…) can use it too, to compile, deploy and query the open project; it never returns private keys. Setting it up needs a source checkout: see [docs/mcp.md](https://github.com/KasLabDevs/HardKasIDE/blob/main/docs/mcp.md).
