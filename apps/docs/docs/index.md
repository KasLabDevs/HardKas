---
title: HardKAS
sidebar_label: Introduction
sidebar_position: 1
---

# HardKAS: Execution-safe development for Kaspa

HardKAS is a deterministic, local-first developer operating system and framework for building Kaspa applications. 

It provides developers with a reproducible CLI, local execution runtime, artifact engine, and simulation tools to replace the traditional "request-and-hope" blockchain development cycle with strict cryptographic accountability.

## Key Principles

- **Local-first execution:** Build and test against a deterministic simulator instantly, or boot a real dockerized Kaspa `simnet` when you need true node validation.
- **Evidence-driven:** Every transaction intent, signature, and receipt is materialized as an artifact on disk, forming an unbroken Evidence DAG.
- **Developer Infrastructure, not Custody:** HardKAS orchestrates safety during development (e.g., maturity filtering, pending-spend protection) but relies on Kaspa consensus for finality.

## Get Started

&rarr; [Installation](./getting-started/installation.md)
&rarr; [5-Minute Quickstart](./getting-started/quickstart.md)

## Dive Deeper

&rarr; [What is HardKAS?](./concepts/what-is-hardkas.md)
&rarr; [Transaction Lifecycle](./concepts/transaction-lifecycle.md)
&rarr; [CLI Reference](./reference/cli.md)
