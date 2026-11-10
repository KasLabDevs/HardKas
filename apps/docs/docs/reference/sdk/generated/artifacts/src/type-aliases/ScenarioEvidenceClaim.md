[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [artifacts/src](../README.md) / ScenarioEvidenceClaim

# Type Alias: ScenarioEvidenceClaim

> **ScenarioEvidenceClaim** = \{ `kind`: `"none"`; \} \| \{ `kind`: `"artifacts"`; \} \| \{ `kind`: `"payment"`; `payments`: `object`[]; \}

Defined in: [packages/artifacts/src/scenario-result.ts:23](https://github.com/KasLabDevs/HardKas/blob/7bbdee0c1ac0aa0959d14402d59daa0c3e101af8/packages/artifacts/src/scenario-result.ts#L23)

TASK-EVIDENCE-UNBOUND-1 (D-TEU-1/D-TEU-2): what a package of this run may be presented as, sealed with the verdict.
`none` — the run wrote nothing (an explicitly empty package); `artifacts` — it wrote artifacts and claims no payment;
`payment` — it broadcast these payments, each named by its submission (the verifier then requires each payment's
lineage — plan ← signed ← submission — to close inside the package). A claim is never a proof of chain inclusion.
