# Post-Release Findings For 0.12.0-rc.20

Date: 2026-09-14T11:49:14.086Z

Status: `POST_RELEASE_BREAK_GAUNTLET_FINDINGS`

## Summary

- Release tested: `0.12.0-rc.20`
- Apps generated: 20
- Apps build passed: 20
- Apps smoke passed: 16
- Mainnet bypasses: 0
- Artifact corruption detected: no
- SDK gaps found: 1
- Bugs found: 0
- Docs/error-message gaps found: 1
- Resolved 0.12.0-rc.20 findings: 4
- Unresolved findings: 3

## Baseline

- PASS: pnpm build
- PASS: pnpm test
- PASS: pnpm corpus:toccata
- PASS: pnpm gauntlet:toccata
- PASS: hardkas --version
- PASS: hardkas capabilities --json
- PASS: hardkas localnet status --json

## Priority Findings

- P2: SDK gap for capabilities - CLI flow passed but SDK parity failed: instance.capabilities is not a function
- P2: artifact hash corrupt failed with unclear or unexpected error (artifact-hash-corrupt)
- P1: CLI/SDK parity failed for capabilities

## Resolved / Unresolved

Resolved:
- P1 SDK localnet status parity
- P1 SDK Silver v1 compile surface (managed silverc, no simulated path)
- P2 SDK capabilities API
- P2 SDK corpus verify API

Unresolved:
- P2: capabilities
- P2: artifact hash corrupt failed with unclear or unexpected error
- P1: CLI/SDK parity failed for capabilities

## Failing Apps

- failure-mutation-01: build=PASS, smoke=FAIL
- failure-mutation-02: build=PASS, smoke=FAIL
- failure-mutation-03: build=PASS, smoke=FAIL
- failure-mutation-04: build=PASS, smoke=FAIL

## Failing Adversarial Cases

- artifact hash corrupt: wrong_error - 
  ═══ Artifact Verification: wrong-network-artifact.json ═══
  Type:    hardkas.postReleaseProbe
  Expected Hash: bbaa40b8f7f305e177694feec4fad4032a82bb0dd3da5ac236ffe2cfaa2f9245
  Actual Hash:   N/A

Issues:
- ERROR:    [ARTIFACT_SCHEMA_MISSING] Missing version or schema (Artifact might be v1 or legacy)
- ERROR:    [MISSING_LINEAGE] Artifact has no lineage metadata
- ERROR:    [MISSING_WORKFLOW_ID] Strict mode requires workflowId
- ERROR:    [MISSING_ASSUMPTION_LEVEL] Strict mode requires assumptionLevel
- ERROR:    [MISSING_EXECUTION_MODE] Strict mode requires executionMode
- WARNING:  [REPLAY_UNSUPPORTED_CHECK] Replay verification (full consensus simulation) is currently unsupported in this build.

  ✗ Error:
    VERIFICATION FAILED

  ✗ [VERIFICATION_FAILED] Artifact verification fail

## CLI vs SDK Parity

- capabilities: CLI=PASS, SDK=FAIL, parity=PARITY_FAIL
- localnet status: CLI=PASS, SDK=PASS, parity=PARITY_PASS
- accounts list: CLI=PASS, SDK=PASS, parity=PARITY_PASS
- corpus verify: CLI=PASS, SDK=PASS, parity=PARITY_PASS
- silver compile: CLI=PASS, SDK=PASS, parity=PARITY_PASS

## Recommended 0.12.0-rc.20 Backlog

- Add or document SDK parity for `capabilities`.
- Fix CLI/SDK parity for `capabilities`.
- Improve error/docs for artifact hash corrupt failed with unclear or unexpected error.

## Claims Kept

- artifactCoherence: `READY_MATCH`
- runtimeOutcome: `PARTIAL`
- vmConsensusEquivalence: `NOT_CLAIMED`
- mainnet: `BLOCKED_BY_POLICY`

No mainnet support, production custody, full VM simulation, consensus validation, or trustless bridge claim was made.
