# AUDIT MASTER BUG TRIAGE

## BLOCKER
- ZK/vProgs boundaries are missing actual execution runtimes. Must be explicitly labeled EXPERIMENTAL in all docs.
- Version mismatch (0.11.0-alpha vs 0.11.0-alpha).

## CRITICAL
- Some documentation implies trustless L2 bridges; capability matrix explicitly says `trustlessExit: false`.

## MAJOR
- Query Store relies on a dynamic boundary which is deprecated.
- Builder templates lack deep end-to-end tests (some are scaffolds).

## MINOR
- Inconsistent maturity tags in CLI (alpha/beta vs stable/preview).
