---
title: CLI reference
---

The CLI reference is generated from the Commander command tree; nothing in it is written by hand:

- **By command group:** the pages under [CLI Reference](./cli/index.md), written with `docs-data/cli-command-inventory.json` by `pnpm docs:generate-apps-cli` (`apps/docs/scripts/cli-reference.mts`). `pnpm docs:check-apps-cli` fails when they no longer match the command tree.
- **On one page:** `docs/reference/cli.md` and `docs/reference/cli.generated.json` in the repository, written by `pnpm docs:generate-cli`. `pnpm docs:check-cli` fails when they no longer match the command tree.

Hidden commands (internal, unavailable or disabled ones) are not listed: hidden means not documented as usable.
