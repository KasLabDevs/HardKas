# Testing & Audits

HardKAS makes strict security claims. To back them up, the 0.8.x alpha branch has been rigorously tested against specific execution scenarios and adversarial boundaries.

## 1. Local Cryptographic Audit (13/13 Suites Passed)
The 0.8.15-alpha release passed a comprehensive 13-suite Local Cryptographic Audit. This test specifically validated:
- **Tamper Detection**: Malicious mutation of an artifact's amount or recipient is 100% caught dynamically by the verification engine.
- **Serialization Poison**: Successfully mitigates type-confusion and Unicode normalizations.
- **Signature Boundaries**: Enforces strict identity verification during transaction planning.
- **Hash Determinism**: 100 identical inputs generate the exact same canonical hash output.

## 2. CLI Command Coverage
HardKAS contains over 120 CLI commands. A massive coverage runner executes these commands sequentially to guarantee that standard operation commands (tx, query, workflow) do not silently fail or produce stack traces on valid inputs.

## 3. Torture Matrix
HardKAS workflows are pushed to their limit using a concurrency torture matrix. We validated that spinning up multiple local node adapters and executing rapid transactions in parallel resolves cleanly without memory corruption or false positives.

## 4. SDK Gauntlet
The core SDK was validated against multiple specific business patterns to ensure APIs resolve correctly in realistic usage, passing 18 out of 20 target apps during the integration test suite.
