---
title: CLI reference
---

The CLI reference is generated from the Commander command tree; nothing in it is written by hand:

- **By command group:** the pages under [CLI Reference](./cli/index.md), built by `apps/docs/scripts/build-cli-reference.ts` from `docs-data/cli-command-inventory.json` (written by `packages/cli/scripts/extract-cli.ts`).
- **On one page:** `docs/reference/cli.md` and `docs/reference/cli.generated.json` in the repository, written by `pnpm docs:generate-cli`. `pnpm docs:check-cli` fails when they no longer match the command tree.

Hidden commands (internal, unavailable or disabled ones) are not listed: hidden means not documented as usable.
