# Post-Release Findings For 0.9.6-alpha

Date: 2026-06-11T13:55:38.475Z

Status: `POST_RELEASE_BREAK_GAUNTLET_FINDINGS`

## Summary

- Release tested: `0.9.6-alpha`
- Apps generated: 20
- Apps build passed: 20
- Apps smoke passed: 16
- Mainnet bypasses: 0
- Artifact corruption detected: yes
- SDK gaps found: 0
- Bugs found: 0
- Docs/error-message gaps found: 0
- Resolved 0.9.6-alpha findings: 4
- Unresolved findings: 0

## Baseline

- PASS: pnpm build
- PASS: pnpm test
- PASS: pnpm corpus:toccata
- PASS: pnpm gauntlet:toccata
- PASS: hardkas --version
- PASS: hardkas capabilities --json
- PASS: hardkas localnet status --json

## Priority Findings

- No P0/P1 product bugs found in this run.

## Resolved / Unresolved

Resolved:
- P1 SDK localnet status parity
- P1 SDK Silver high-level deploy planning/simulation/compare surface
- P2 SDK capabilities API
- P2 SDK corpus verify API

Unresolved:
- None.

## Failing Apps

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
- corpus verify: CLI=PASS, SDK=PASS, parity=PARITY_PASS
- silver compile/deploy/spend: CLI=PASS, SDK=PASS, parity=PARITY_PASS

## Recommended 0.9.6-alpha Backlog

- Keep running the break gauntlet after each release candidate.

## Claims Kept

- artifactCoherence: `READY_MATCH`
- runtimeOutcome: `PARTIAL`
- vmConsensusEquivalence: `NOT_CLAIMED`
- mainnet: `BLOCKED_BY_POLICY`

No mainnet support, production custody, full VM simulation, consensus validation, or trustless bridge claim was made.
