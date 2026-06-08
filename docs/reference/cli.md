# CLI Reference

## `tx`
- `tx plan`: Generates a transaction plan. Flags: `--from`, `--to`, `--amount`.
- `tx sign`: Signs a plan. Flags: `--account`.
- `tx send`: Broadcasts to the network.
- `tx simulate`: Broadcasts to the local mock state.

## `artifact`
- `artifact inspect`: Decodes an artifact payload.
- `artifact verify`: Validates cryptographic hashes.

## `accounts`
- `accounts list`: Lists available HardKAS accounts.
- `accounts real init`: Persistent dev account store (L1).
- `accounts balance <id>`: Show account balance.
- `accounts fund <id>`: Fund an account.
- `accounts consolidate <account>`: Sweeps UTXO dust. Flags: `--dry-run`, `--execute`, `--yes`.

## `dev`
- `dev fixture generate`: Creates mock localnet state.
