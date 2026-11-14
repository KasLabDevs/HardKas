---
title: HardKAS IDE
description: The HardKAS IDE is a desktop workbench for HardKAS projects on Kaspa L1. What each part does, what it needs and where to start.
sidebar_label: HardKAS IDE
---

# HardKAS IDE

The HardKAS IDE is a desktop app for HardKAS projects. One window holds a code editor with SilverScript support, the compiler, Deploy & Run, the local node, accounts, artifacts, tests, terminals and an assistant.

It is a separate app from the `hardkas` CLI, with its own releases on [KasLabDevs/HardKasIDE](https://github.com/KasLabDevs/HardKasIDE). These pages describe version 0.3.0.

## How it works

- **It runs the HardKAS CLI.** Everything the IDE does to your project is a `hardkas` command: compiling, deploying, funding, starting the node. The [Console](./console-and-terminal.md) shows each command and its output, and the records it writes are the CLI's own artifacts under `.hardkas/`.
- **A project is a normal folder.** It holds `hardkas.config.ts` and `.hardkas/`. You can work on the same folder from a terminal or another editor at any time.
- **It runs on your machine.** The desktop app starts a small server at `http://127.0.0.1:7421` and shows the IDE from it. It only answers requests from the machine itself.

## Environments

You pick one of three HardKAS environments in the environment bar, in Deploy & Run, in the Servers view or under **Run → Environment**:

| Environment | What it is | What it needs |
| --- | --- | --- |
| **Simulator (in-memory)** | HardKAS' synthetic simulator (network `simulated`). Instant, no node. | Nothing extra |
| **Local node (Docker, simnet)** | HardKAS' own rusty-kaspa node in Docker, on a private simnet. | Docker Desktop |
| **Public testnet (RPC)** | Kaspa testnet-10, through an RPC endpoint. | Network access and testnet coins |

These are separate worlds. A balance, a transaction or a deployed contract in one of them does not exist in the others. A result on the simulator or on the local simnet node tells you nothing about testnet.

The IDE starts on **Local node**. If Docker is missing and you never picked an environment, it switches to the simulator once and says so in the Console.

The IDE works with a single local node, HardKAS' own. Earlier versions had a **Cluster** card that started extra simnet nodes; version 0.3.0 removed it.

## What it needs

- **Node.js 24.22.1 with npm** on the `PATH`. The IDE creates projects with npm and runs the `hardkas` CLI, which requires that Node release.
- **Docker Desktop** for the local node. The simulator needs neither Docker nor a node.
- **Internet access** to create projects (npm install), and for testnet, the assistant, the update check and Open VSX extensions.

The IDE runs the project's own CLI (`node_modules/.bin/hardkas`) when the project has one, then the `HARDKAS_BIN` environment variable when set, and otherwise `npx @hardkas/cli` at the version the IDE was tested with. The status bar shows the CLI version in use and turns amber when it differs from the tested one.

## The parts

| Page | What it covers |
| --- | --- |
| [Install and first start](./install.md) | Installers, unsigned-installer warnings, the first start |
| [Projects and workbench](./projects-and-workbench.md) | Home, new project, open folder, layout, command palette, search |
| [Editor and compiler](./editor-and-compiler.md) | The editor, SilverScript support, the compiler panel |
| [Deploy & Run](./deploy-and-run.md) | Payments, deploying contracts, calling entries, covenant transitions |
| [Local node and accounts](./local-node-and-accounts.md) | Servers view, start/stop/reset, the miner, the explorer, accounts, KasWare |
| [Artifacts, history and index](./artifacts-and-index.md) | Artifacts, run history, lineage, the Index view |
| [Covenant graph](./covenant-graph.md) | A contract's deploys, entries and spends, checked against the node |
| [Tests and debugging](./tests-and-debugging.md) | Running vitest tests and the test debugger |
| [Console and terminal](./console-and-terminal.md) | The HardKAS console and real terminals |
| [Assistant](./assistant.md) | OpenCode, Chat and Agent, permissions, API keys |
| [Plugins and extensions](./plugins-and-vsx.md) | IDE plugins and Open VSX themes and grammars |
| [Settings and updates](./settings-and-updates.md) | The Settings view and the update checker |

## Using the IDE from another AI agent

The IDE ships an MCP server, which its own assistant uses to reach the open project. You can also connect an MCP client (Claude Code, Cursor and others) to it to compile SilverScript, control the local node, move test coins, deploy contracts and query the index through the IDE. It never returns private keys and cannot wipe the local chain. Setting it up for your own client needs a source checkout of the IDE: see [docs/mcp.md](https://github.com/KasLabDevs/HardKasIDE/blob/main/docs/mcp.md) in the IDE repository.
