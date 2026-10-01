# DOCS-EDITORIAL-2: Getting Started & First Transaction

## 1. CLI Surfaces Inspected
- `packages/cli/src/program.ts`
- `hardkas init --help`
- `hardkas tx plan --help`
- `hardkas tx sign --help`
- `hardkas tx send --help`
- `hardkas explain --help`
- `hardkas verify --help`

## 2. Environment Chosen: Simulator
I chose the **Simulator** for the Quickstart because:
- **Reproducible & Deterministic**: 100% stable execution without external side effects.
- **Minimal Prerequisites**: Requires zero external tooling (no Docker, no kaspad syncing, no waiting for faucets).
- **Time to Success**: Allows a developer to initialize a project and see the HardKAS intent &rarr; artifact &rarr; evidence workflow in under 5 minutes.
- **Evidence Honesty**: Localnet provides a real-node workflow, but Simulator provides the most accessible *conceptual* onboarding. Localnet workflows will be detailed in the Operator/Advanced sections.

## 3. Pages Created/Rewritten
1. `/docs/index.md` (Introduction / System Landing)
2. `/docs/getting-started/installation.md`
3. `/docs/getting-started/quickstart.md`
4. `/docs/getting-started/first-transaction.md`
5. `/docs/getting-started/understanding-the-result.md`
6. `/docs/getting-started/next-steps.md`

## 4. Full First Transaction Workflow
Documented exactly as it behaves today:
1. `hardkas init my-first-project`
2. `hardkas tx plan --from alice --to bob --amount 10 --out plan.json`
3. `hardkas tx sign plan.json --account alice --out signed.json`
4. `hardkas tx send signed.json`
5. `hardkas explain .hardkas/artifacts/receipts/txReceipt-<hash>.json`
6. `hardkas verify`

## 5. Command Verification Evidence
- **Execution Proof**: I literally ran the entire workflow in a temporary `my-test-project` folder in the workspace.
- **Bug Caught**: `hardkas tx send` outputs a suggestion `Next Steps: > hardkas explain simulated-plan-<id>-tx`. This fails because `hardkas explain` expects a 64-hex `artifactId` (e.g., `txReceipt-<hash>`), not the `txId`.
- **Honesty Applied**: I did NOT invent a future UX where `tx send` prints the perfect command. The Quickstart documents the *actual* requirement to grab the `Artifact Written` hash path and pass it to `explain`.

## 6. Artifact/Evidence Flow
- **Intent**: Evaluated against the simulator via `tx plan`.
- **Plan**: `TxPlanArtifact` written to `plan.json` containing exact geometric bounds.
- **Sign**: `SignedTxArtifact` written to `signed.json`, cryptographically linked to the plan.
- **Submit**: Evaluated by Simulator, writing `TxReceiptArtifact` to `.hardkas/artifacts/receipts/`.

## 7. Planner Wording
Removed internal future-state references. Replaced with: "In this Simulator workflow, HardKAS constructs the transaction plan locally. Planner implementation and provenance depend on the execution path; where planner authority is recorded, inspect the generated artifact for that evidence."

## 8. Replay Wording
Replay is explicitly restricted to Simulator flows. I added a strict invariant callout in `understanding-the-result.md`: "If you attempt to replay a real-node receipt, HardKAS will fail-closed and return a `REPLAY_MODE_UNSUPPORTED` error, because historical state reconstruction is unavailable."

## 9. Legacy Content Recovered
Migrated and updated legacy knowledge from `quickstart.md` and `motivation.md`. Replaced the outdated `hardkas simulator fund` step, as `hardkas init` natively scaffolds and funds synthetic accounts.

## 10. Legacy Stale Claims Rejected
- Removed the old `index.md`'s disorganized bullet list of capabilities.
- Prevented using `contentHash` as a generic locator.
- Removed claims that implied `hardkas verify` performed consensus validation.

## 11. Qualification Data Changes
Integrated the `<QualificationContext capabilityId="artifacts" />` component on `understanding-the-result.md`. 

## 12. Build Result
`BUILD: PASS`
- Docusaurus compiled successfully.
- Broken link checking (`onBrokenLinks: 'throw'`) passed with 0 errors.

## 13. Remaining Questions
- **CLI UX Fix**: Should we fix `tx-send-runner.ts` to output the exact `artifactId` command for `hardkas explain` so the Quickstart can be even cleaner? This would be a tiny code change but greatly improve DX.

---

### Final Status
- **GETTING_STARTED**: `ESTABLISHED`
- **FIRST_TRANSACTION**: `VERIFIED`
- **QUICKSTART_EXECUTION**: `L2_VERIFIED` (Actually executed successfully)
- **PLANNER_CLAIMS**: `CURRENT`
- **REPLAY_BOUNDARY**: `PASS`
- **MIGRATION_KNOWLEDGE_INTEGRITY**: `PARTIAL`
- **BUILD**: `PASS`
- **DOCS-EDITORIAL-2**: `PASS`
- **NEXT**: `DOCS-EDITORIAL-3`
