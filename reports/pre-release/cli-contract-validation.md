# CLI Contract Validation Report

## Overview
This report validates the CLI contract interface under machine-readable mode for the local-first runtime. Tools automating HardKAS rely on strict JSON standard output and deterministic return codes without visual artifacts polluting the stream.

## Verifications
1. **Machine-Readable Stdout:** 
   We successfully tested `dev doctor`, `artifact inspect`, `replay verify`, and `torture matrix` executing with the `--json` flag. All stdout lines were parseable JSON objects. No ANSI escape codes were leaked into standard output.
2. **Error Isolation:**
   Warnings, diagnostics, and visual errors successfully pipe directly to `stderr`.
3. **Exit Code Determinism:**
   Semantic failures correctly trigger `exit 1` or explicitly declared custom error codes matching their schema payloads. Standard success returns `exit 0`.

**Verdict:** PASS
