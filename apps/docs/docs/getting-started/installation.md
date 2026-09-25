---
title: Installation
sidebar_position: 1
---

# Installation

HardKAS is a Node.js framework and CLI tool distributed via npm. 

## Prerequisites

- **Node.js**: v24.0.0 or higher.
- **Package Manager**: We strongly recommend `pnpm` or `npm`.
- **OS**: Linux, macOS, or Windows (WSL2 recommended).

> **Note on Docker:** HardKAS uses a local deterministic Simulator by default. You do **not** need Docker installed unless you plan to boot a real local Kaspa node via `hardkas node start` (Localnet).

## Install the CLI

Install the `@hardkas/cli` package globally to make the `hardkas` command available in your terminal:

```bash
npm install -g @hardkas/cli
```

Verify the installation:

```bash
hardkas --version
```
*(Should output `0.12.0-rc.23` or higher)*

## Create a New Project

HardKAS projects are self-contained environments containing configuration, test scaffolding, and the `.hardkas/` workspace directory where artifacts and state are durably persisted.

To scaffold a new project:

```bash
hardkas init my-first-project
cd my-first-project
```

### What `init` does:
- Creates a `hardkas.config.ts` configured for the `simulator` environment.
- Provisions a `test/` directory with an example verification scenario.
- Bootstraps the local `.hardkas/` workspace and funds simulated development accounts (e.g., `alice`, `bob`) so you can begin testing immediately without dealing with faucets.

## Next Steps

Now that you have a workspace, jump right into the [Quickstart](./quickstart.md) to execute your first transaction, or read the deep dive in [First Transaction](./first-transaction.md).
