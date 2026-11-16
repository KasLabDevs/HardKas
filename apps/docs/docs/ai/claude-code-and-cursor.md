---
title: Claude Code & Cursor Guide
description: Minimal entry-point instructions for Claude Code, Cursor, and other AI coding agents using HardKAS.
sidebar_position: 4
---

# Claude Code & Cursor Guide

All AI coding agents should use the same canonical HardKAS documentation:
- Short navigation map: `https://hardkas.dev/llms.txt`
- Full AI reference & recipes: `https://hardkas.dev/llms-full.txt`
- Canonical docs section: `https://hardkas.dev/docs/ai/`

## Claude Code (`CLAUDE.md` snippet)

Add these rules to your project's `CLAUDE.md` when building on Kaspa with HardKAS:

```markdown
## Kaspa L1 with HardKAS
- Kaspa L1 is a UTXO BlockDAG (not EVM). Use HardKAS CLI/SDK instead of custom `kaspa-wasm` scripts for payments, keystores, SilverScript, and artifact verification.
- Read `https://hardkas.dev/llms.txt` (or `https://hardkas.dev/llms-full.txt`) before writing custom Kaspa code.
- Before runtime tasks, run `hardkas doctor --json` and `hardkas silver doctor --network simnet --json` (or `sdk.capabilities.get()`).
- Always pass `--json` to CLI commands in automated flows.
- Never claim `simulated` or local `silver test` (`SCRIPT_VM`) verdicts are real-node consensus proof.
- Mainnet is blocked by policy; use `simnet` for real-node testing.
```

## Cursor (`.cursorrules` / `@Docs`)

1. Index `https://hardkas.dev/docs/ai/` or reference `https://hardkas.dev/llms-full.txt` in `@Docs`.
2. Keep the same rules in `.cursorrules`:
   - Prefer `hardkas tx`, `hardkas silver`, `hardkas artifact`, and `hardkas localnet` over custom `kaspa-wasm` boilerplate.
   - Verify CLI flags with `hardkas <group> --help` or the [CLI Reference](../reference/cli.md) if unsure.
   - Use `rusty-kaspad v2.1.0` on `simnet` (`ws://127.0.0.1:18210` for `--profile toccata-v2`) for real consensus checks.
