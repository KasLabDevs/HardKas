# Post-Release Findings For 0.9.7-alpha

Date: 2026-06-23T10:48:11.090Z

Status: `POST_RELEASE_BREAK_GAUNTLET_FINDINGS`

## Summary

- Release tested: `0.9.7-alpha`
- Apps generated: 20
- Apps build passed: 20
- Apps smoke passed: 12
- Mainnet bypasses: 0
- Artifact corruption detected: yes
- SDK gaps found: 0
- Bugs found: 0
- Docs/error-message gaps found: 0
- Resolved 0.9.7-alpha findings: 4
- Unresolved findings: 1

## Baseline

- PASS: pnpm build
- FAIL: pnpm test
- PASS: pnpm corpus:toccata
- PASS: pnpm gauntlet:toccata
- PASS: hardkas --version
- PASS: hardkas capabilities --json
- PASS: hardkas localnet status --json

## Priority Findings

- P1: CLI/SDK parity failed for corpus verify

## Resolved / Unresolved

Resolved:
- P1 SDK localnet status parity
- P1 SDK Silver high-level deploy planning/simulation/compare surface
- P2 SDK capabilities API
- P2 SDK corpus verify API

Unresolved:
- P1: CLI/SDK parity failed for corpus verify

## Failing Apps

- cli-sdk-01: build=PASS, smoke=FAIL
- cli-sdk-02: build=PASS, smoke=FAIL
- cli-sdk-03: build=PASS, smoke=FAIL
- cli-sdk-04: build=PASS, smoke=FAIL
- failure-mutation-01: build=PASS, smoke=FAIL
- failure-mutation-02: build=PASS, smoke=FAIL
- failure-mutation-03: build=PASS, smoke=FAIL
- failure-mutation-04: build=PASS, smoke=FAIL

## Failing Adversarial Cases

- None.

## CLI vs SDK Parity

- capabilities: CLI=PASS, SDK=PASS, parity=PARITY_PASS
- localnet status: CLI=PASS, SDK=PASS, parity=PARITY_PASS
- accounts list: CLI=PASS, SDK=PASS, parity=PARITY_PASS
- corpus verify: CLI=FAIL, SDK=PASS, parity=PARITY_FAIL
- silver compile/deploy/spend: CLI=PASS, SDK=PASS, parity=PARITY_PASS

## Recommended 0.9.7-alpha Backlog

- Fix CLI/SDK parity for `corpus verify`.

## Claims Kept

- artifactCoherence: `READY_MATCH`
- runtimeOutcome: `PARTIAL`
- vmConsensusEquivalence: `NOT_CLAIMED`
- mainnet: `BLOCKED_BY_POLICY`

No mainnet support, production custody, full VM simulation, consensus validation, or trustless bridge claim was made.
