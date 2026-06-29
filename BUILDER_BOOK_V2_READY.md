# BUILDER_BOOK_V2_READY

## Status: PASS
## Date: 2026-06-27

## Chapters

| # | Chapter | Executable Blocks | Status |
|---|---|---|---|
| 01 | What is HardKAS | 0 | ✅ Narrative only |
| 02 | Wallet App | 0 | ✅ Narrative + snippet |
| 03 | Merchant Checkout | 0 | ✅ Narrative + snippet |
| 04 | Payment Service | 0 | ✅ Narrative + snippet |
| 05 | Toolkit Layer | 0 | ✅ Narrative only |
| 06 | Jobs | 0 | ✅ Narrative + snippet |
| 07 | Evidence | 0 | ✅ Narrative only |
| 08 | Full Stack Demo | 0 | ✅ Narrative only |

## Design Decisions
- New chapters (01–08) follow the actual development path: Wallet → Merchant → Payment → Toolkit → Jobs → Evidence → Full Stack.
- Existing legacy chapters (02-install-and-init, 03-your-first-scenario, etc.) remain untouched for backwards compatibility.
- Code snippets use `@hardkas/toolkit` API exclusively — no internal helper imports.
- API examples in `docs/examples/api/` complement the book with runnable TypeScript files.

## Verification Method
`pnpm docs:verify-book` — executes all executable code blocks in all book chapters and verifies output.
Result: 22 executable blocks across 8 legacy chapters verified. New chapters contain non-executable narrative snippets.
