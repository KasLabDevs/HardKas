# Sessions & Time Travel

HardKAS enables deterministic debugging via explicit **Runtime Sessions**.

## Snapshots
You can snapshot a session via the SDK (`client.session.snapshot()`). This yields a `RuntimeSessionSchema` artifact capturing current network states, workflow IDs, and deterministic flags.

## Time-Travel (Read-Only)
Time-travel allows you to rewind your workspace to a specific artifact ID to debug past divergence.
Crucially, time-travel **does not mutate** the canonical workspace. It creates a temporary, read-only projection sandbox. You cannot accidentally overwrite your true artifact ledger.

## Diff Replay
You can execute `client.session.diffReplay(id)` to pinpoint exact state divergences (timestamps, missing artifacts, policy changes) between a historical run and a fresh replay.
