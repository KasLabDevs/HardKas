# Post-Release Findings For 0.12.0-rc.20

Date: 2026-09-08T21:54:27.299Z

Status: `POST_RELEASE_BREAK_GAUNTLET_FINDINGS`

## Summary

- Release tested: `0.12.0-rc.20`
- Apps generated: 20
- Apps build passed: 20
- Apps smoke passed: 16
- Mainnet bypasses: 1
- Artifact corruption detected: yes
- SDK gaps found: 3
- Bugs found: 0
- Docs/error-message gaps found: 2
- Resolved 0.12.0-rc.20 findings: 4
- Unresolved findings: 8

## Baseline

- PASS: pnpm build
- FAIL: pnpm test
- PASS: pnpm corpus:toccata
- FAIL: pnpm gauntlet:toccata
- PASS: hardkas --version
- PASS: hardkas capabilities --json
- PASS: hardkas localnet status --json

## Priority Findings

- P2: SDK gap for capabilities - CLI flow passed but SDK parity failed: instance.capabilities is not a function
- P2: SDK gap for corpus verify - CLI flow passed but SDK parity failed: Cannot read properties of undefined (reading 'verify')
- P2: SDK gap for silver compile/deploy/spend - CLI flow passed but SDK parity failed: Cannot read properties of undefined (reading 'deployPlan')
- P2: mainnet silver deploy-plan attempt failed with unclear or unexpected error (mainnet-silver-deploy-plan-attempt)
- P2: compiler nonexistent failed with unclear or unexpected error (compiler-nonexistent)
- P1: CLI/SDK parity failed for capabilities
- P1: CLI/SDK parity failed for corpus verify
- P1: CLI/SDK parity failed for silver compile/deploy/spend

## Resolved / Unresolved

Resolved:
- P1 SDK localnet status parity
- P1 SDK Silver high-level deploy planning/simulation/compare surface
- P2 SDK capabilities API
- P2 SDK corpus verify API

Unresolved:
- P2: capabilities
- P2: corpus verify
- P2: silver compile/deploy/spend
- P2: mainnet silver deploy-plan attempt failed with unclear or unexpected error
- P2: compiler nonexistent failed with unclear or unexpected error
- P1: CLI/SDK parity failed for capabilities
- P1: CLI/SDK parity failed for corpus verify
- P1: CLI/SDK parity failed for silver compile/deploy/spend

## Failing Apps

- failure-mutation-01: build=PASS, smoke=FAIL
- failure-mutation-02: build=PASS, smoke=FAIL
- failure-mutation-03: build=PASS, smoke=FAIL
- failure-mutation-04: build=PASS, smoke=FAIL

## Failing Adversarial Cases

- mainnet silver deploy-plan attempt: wrong_error - error: unknown command 'silver'

Usage: hardkas [options] [command]

HardKAS: Kaspa-native developer operating environment

Options:
  -V, --version                       output the version number
  -h, --help                          display help for command

Commands:
  init [options] [name]               Initialize a new HardKAS project stable
  up [options]                        Boot or validate the HardKAS developer
                                      runtime environment stable
  create [options] <template> <dest>  Scaffold a new HardKAS project from a
                                      template stable
  tx                                  L1 Transaction commands
  artifact|artifacts                  Manage HardKAS artifacts
  replay                              Manage HardKAS t
- compiler nonexistent: wrong_error - error: unknown command 'silver'

Usage: hardkas [options] [command]

HardKAS: Kaspa-native developer operating environment

Options:
  -V, --version                       output the version number
  -h, --help                          display help for command

Commands:
  init [options] [name]               Initialize a new HardKAS project stable
  up [options]                        Boot or validate the HardKAS developer
                                      runtime environment stable
  create [options] <template> <dest>  Scaffold a new HardKAS project from a
                                      template stable
  tx                                  L1 Transaction commands
  artifact|artifacts                  Manage HardKAS artifacts
  replay                              Manage HardKAS t

## CLI vs SDK Parity

- capabilities: CLI=PASS, SDK=FAIL, parity=PARITY_FAIL
- localnet status: CLI=PASS, SDK=PASS, parity=PARITY_PASS
- accounts list: CLI=PASS, SDK=PASS, parity=PARITY_PASS
- corpus verify: CLI=PASS, SDK=FAIL, parity=PARITY_FAIL
- silver compile/deploy/spend: CLI=PASS, SDK=FAIL, parity=PARITY_FAIL

## Recommended 0.12.0-rc.20 Backlog

- Add or document SDK parity for `capabilities`.
- Add or document SDK parity for `corpus verify`.
- Add or document SDK parity for `silver compile/deploy/spend`.
- Fix CLI/SDK parity for `capabilities`.
- Fix CLI/SDK parity for `corpus verify`.
- Fix CLI/SDK parity for `silver compile/deploy/spend`.
- Improve error/docs for mainnet silver deploy-plan attempt failed with unclear or unexpected error.
- Improve error/docs for compiler nonexistent failed with unclear or unexpected error.

## Claims Kept

- artifactCoherence: `READY_MATCH`
- runtimeOutcome: `PARTIAL`
- vmConsensusEquivalence: `NOT_CLAIMED`
- mainnet: `BLOCKED_BY_POLICY`

No mainnet support, production custody, full VM simulation, consensus validation, or trustless bridge claim was made.
