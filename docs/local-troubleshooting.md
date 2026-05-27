# Local Troubleshooting Guide

HardKAS operates entirely as a local, deterministic runtime. If things break, they break locally, and they can be fixed locally.

## What to do if `hardkas dev doctor` fails

`hardkas dev doctor` is your first line of defense. It validates workspace health, Node.js environment, and artifact integrity. 

When it fails, it will provide a specific `code` and `suggestion`:

### Common Codes & Fixes

* **`WORKSPACE_INVALID`**
  * **Cause:** The current directory is not a HardKAS workspace (missing `hardkas.config.ts`).
  * **Fix:** Run `hardkas dev init` in the root of your project.

* **`APPEND_CORRUPTION`**
  * **Cause:** The local append-only ledger (`.hardkas/artifacts/events.jsonl`) suffered a partial write (e.g., due to a hard crash or power loss).
  * **Fix:** Run `hardkas repair --tail`. This will safely truncate the corrupted bytes back to the last valid transaction boundary.

* **`ARTIFACT_CORRUPTION`**
  * **Cause:** One or more JSON artifacts in `.hardkas/artifacts/` have been manually modified or corrupted.
  * **Fix:** Run `hardkas artifact verify --strict`. This will identify the corrupted artifacts. You can then delete them (and their children) to repair the lineage, or let HardKAS quarantine them automatically.

* **`BROWSER_NODE_POLYFILLS`**
  * **Cause:** Your bundler (e.g., Vite/Webpack) is injecting Node core modules into browser packages.
  * **Fix:** Ensure you are using `@hardkas/react` for UI integration, and that your Vite config excludes `node:` imports from the client bundle.

## How to repair the local ledger

Because HardKAS is an append-only event ledger locally, it is highly resilient. 

If you encounter state divergence or ledger corruption:

1. **Verify State:** `hardkas artifact verify --strict`
2. **Truncate Corrupted Tails:** `hardkas repair --tail`
3. **Rebuild Projections:** `hardkas dev server --rebuild` (This will safely reconstruct SQLite projections from your valid artifacts).

> [!IMPORTANT]
> Never manually edit `events.jsonl`. Artifacts are cryptographically hashed; manual edits will invalidate the canonical hash and break lineage.
