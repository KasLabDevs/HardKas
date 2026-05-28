# HardKAS Operator & Recovery Guide

> *HardKAS assumes the user, the filesystem, and the runtime environment will eventually fail.*

Welcome to the HardKAS operational manual. This guide is designed for operators running HardKAS in production, automation pipelines, or complex local network configurations.

If your dashboard is glowing anything other than GREEN, or if your CI pipeline failed with a HardKAS error, you are in the right place.

## The First Rule of Recovery
**Do not panic-delete the `.hardkas` directory.**
HardKAS is event-sourced. The system is designed to explain *why* it failed and offer precise, surgical recovery commands.

## Diagnostic Commands

### `hardkas doctor`
Run this first. It scans the entire persistence triad (SQLite, JSONL ledgers, locks, keystore, Docker RPC) and checks for structural soundness and consistency.
```bash
hardkas doctor --consistency
```
*Tip: Add `--strict` in your CI pipelines to fail the build if any anomaly is detected.*

### `hardkas inspect <path>`
If the doctor complains about a specific stream or artifact, inspect it directly without using `cat`. The inspector parses the schema natively and highlights exact byte-level corruption.
```bash
hardkas inspect .hardkas/telemetry/telemetry.jsonl
```

## Common Scenarios & Recovery

### 1. Dashboard is RED: "Stale Lock Detected"
This occurs if a process crashed abruptly (e.g., `SIGKILL`, power failure) without releasing its filesystem lock.
**Action**:
```bash
hardkas lock doctor
hardkas lock clear <lock-name> --if-dead
```
The `--if-dead` flag ensures you don't accidentally kill a lock belonging to a live process.

### 2. Dashboard is YELLOW: "Stream Corruption"
If a JSONL stream (`events.jsonl` or `telemetry.jsonl`) contains an incomplete trailing line (often caused by a crash during an `fsync`).
**Action**:
```bash
hardkas repair
```
The repair wizard will identify the exact line, explain the context, and ask for permission to truncate the garbage bytes. It will *never* delete the file.

### 3. Dashboard is RED: "SQLite Drift / Missing Projection"
This happens if `store.db` is manually deleted, or if an aggressive antivirus quarantined it.
**Action**:
```bash
hardkas rebuild --from-artifacts
```
Since the SQLite database is strictly observational, this command will replay all canonical `.json` artifacts and rebuild the database from scratch deterministically.

### 4. "Invariant Violation" / Raw Stack Trace
If you see a raw JavaScript stack trace, this is a bug in HardKAS.
**Action**:
Please report the stack trace to the maintainers. If it occurred during a chaos campaign, provide the `.hardkas-chaos/repro/run-XXXX.sh` script.

## Telemetry Rotation
Over time, `telemetry.jsonl` can grow large. The canonical `events.jsonl` is append-only, but telemetry can be safely rotated.
```bash
hardkas rotate
```
This moves the current telemetry into `.hardkas/telemetry/archive/` and starts a fresh stream.
