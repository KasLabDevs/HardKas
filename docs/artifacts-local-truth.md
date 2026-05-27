# Artifacts: The Local Canonical Truth

In HardKAS, your local filesystem is the ultimate authority.

## The Ledger
Every transaction, policy check, and signed intent is written to an append-only ledger (`events.jsonl`) inside your `.hardkas/artifacts/` directory.

- **SQLite is a facade:** Do not rely on SQLite for canonical state.
- **The File is Law:** If the dev-server disagrees with the filesystem, the dev-server is wrong.
- **Rebuilds:** You can always rebuild your entire dev environment from scratch as long as your `events.jsonl` ledger is intact.

## Append Safety
The `AppendCoordinator` is hardened against crashes. It uses atomic file locking and backward newline scanning to ensure that even if a process dies mid-write, corrupted tails are safely truncated and valid JSONL lines up to 64KB are preserved.
