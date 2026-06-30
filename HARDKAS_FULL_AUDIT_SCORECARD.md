# HARDKAS FULL AUDIT SCORECARD

| Area | Status | Notes |
|------|--------|-------|
| Core SDK | PASS | Robust, stable types |
| CLI | PASS | Maturity system active, commands work |
| Accounts/Keystore | PASS | Strong tamper detection, encryption works |
| Tx lifecycle | PASS | Simulation and plan execution works |
| Artifact registry | PASS | Verification hashes match |
| Query Store | DEGRADED | Contains dynamic boundary legacy code |
| Localnet/Toccata | DEGRADED | Simulation only, alpha maturity |
| ZK boundary | FAIL / NOT_PROVEN | Fixture verification only. No on-chain ZK. |
| vProgs boundary | NOT_PROVEN | Inspect-only. No runtime. |
| SilverScript | DEGRADED | Lacks full compiler access. |
| Money safety | PASS | HardKAS is a local tool, properly isolates plans |
| Dev server security | PASS | Proper API boundaries |
| Packaging | PASS | TSup/Turbo builds succeed |
| Deep-10 foundation | DEGRADED | Promising but incomplete |
| Builder templates | DEGRADED | Some are just scaffolds |
| Stablecoin toolkit | NOT_PROVEN | Simulated only |
| Verifiers | PASS | Audit logs show verifiers catching tamper attempts |
| Reports | DEGRADED | Some reports claim 0.11.1 readiness prematurely |
| Claims safety | FAIL | Found 'trustlessExit' hardcoded to false but some docs suggest otherwise |
| Multi-user | DEGRADED | Local file-based isolation only |
