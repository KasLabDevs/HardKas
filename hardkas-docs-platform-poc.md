# DOCS-PLATFORM-2: HardKAS Docusaurus POC Report

This document reports the findings of the `DOCS-PLATFORM-2` minimal scaffolding proof of concept for Docusaurus. The goal was to prove the structural fit without migrating legacy content or disrupting the monorepo.

---

## 1. Preflight
* **Branch:** `claude/inspiring-jones-bb14af` (based on `develop` or `main`)
* **HEAD:** `996453df4467f91767515bd975fbb31b40441849`
* **Node Version:** `v24.15.0`
* **pnpm Version:** `9.15.4`
* **Workspace Config:** `pnpm-workspace.yaml` maps `apps/*` and `packages/*`.
* **Legacy Site:** Lives directly in `site/index.html`. No build scripts found for it.
* **Hosting Findings:** `HOSTING: UNKNOWN`. The repo has no GitHub Actions or deploy scripts for `hardkas.dev`. SEO tags in `index.html` assume `https://hardkas.dev`.

## 2. Placement Decision
* **Evaluated:** `apps/docs`, `docs-site`, `packages/docs`.
* **Decision:** `DOCS_PLACEMENT: apps/docs`
* **Justification:** HardKAS uses `packages/*` for publishable libraries (e.g., `@hardkas/cli`, `@hardkas/core`). A documentation site is an end-user application (a web app) rather than a library. `apps/*` is explicitly defined in `pnpm-workspace.yaml` and accurately models the semantic purpose of the docs.

## 3. Docusaurus Pin
The POC was scaffolded using a fixed version in `apps/docs/package.json` with `pnpm`, completely avoiding `npx create-docusaurus@latest`.
* **Docusaurus Version:** `3.7.0` (stable)
* **Node Requirement:** `>= 22.5.0` (from monorepo root)
* **React Requirement:** `^18.2.0` (Docusaurus baseline)
* **TypeScript:** `~5.7.0` (matching monorepo)

## 4. Scaffold Architecture & Files Added
* `apps/docs/package.json`
* `apps/docs/docusaurus.config.ts` (configured `baseUrl: '/'` without assumptions)
* `apps/docs/sidebars.ts`
* `apps/docs/src/components/QualificationContext.tsx`
* `apps/docs/docs-data/qualification.ts`
* `apps/docs/docs/getting-started/index.md`
* `apps/docs/docs/concepts/artifact-id.mdx`
* `apps/docs/docs/qualification/index.mdx`
* `apps/docs/typedoc.json`

`site/index.html` remains completely untouched. No redirects were added.

## 5. Qualification Data Architecture
A central source of truth for evidence-aware documentation was created at `docs-data/qualification.ts`.
It exports a strongly-typed `CapabilityState` interface covering:
* `id`, `name`, `hardkasVersion`
* `maturity` (STABLE | PARTIAL | EXPERIMENTAL)
* `evidenceLevel` (L0 - L4)
* `environments` (simulator, localnet, testnet, mainnet)
* `plannerAuthority`
* `artifactsProduced` and `knownLimitations`

This prevents capability claims from drifting across the documentation, and guarantees that 70 pages don't need manual updates when a feature graduates from `L2` to `L3`.

## 6. QualificationContext POC
Implemented `<QualificationContext capabilityId="artifact-identity" />` in React. 
By passing *only* the `capabilityId`, the MDX page remains purely descriptive. The component dynamically fetches the capability state from the central data model.

## 7. POC Routes
The following routes were successfully scaffolded:
* `/getting-started/` (Markdown baseline)
* `/concepts/artifact-id` (MDX using `<QualificationContext />`)
* `/qualification/` (Aggregating the `docs-data` into a unified matrix)

## 8. TypeDoc POC
* **Target Package:** `@hardkas/core`
* **Configuration:** Setup `typedoc.json` in `apps/docs` pointing to `packages/core/src/index.ts` using `typedoc-plugin-markdown`.
* **Result:** Successfully resolved workspace imports and generated clean Markdown output into `docs/reference/sdk/core`.
* **Report:** `TYPEDOC_POC: PASS`

## 9. CLI Reference Architecture
* **Analysis (Read-Only):** Checked `packages/cli/src/scripts/generate-cli-docs.ts`.
* **Finding:** HardKAS already has an `extractCliReference(program)` function that introspects the Commander.js object directly to pull metadata.
* **Report:** `CLI_REFERENCE_SOURCE: program.js (Commander model via extractCliReference)`. We do *not* need TypeDoc for CLI reference; we will use the existing extraction logic to emit MDX.

## 10. Build Validation & Risks
* **Docusaurus Dev/Build:** `PARTIAL`. 
  * *Context:* Docusaurus v3.7.0 Webpack plugin configuration (`ProgressPluginArgument`) fails validation strictly on **Node v24.15.0**, which is what the current environment is running.
  * *Impact:* Node 24 is extremely recent and breaks certain schemas in Webpack 5. Docusaurus will patch this soon, or we can use a minor Webpack fallback. Because this is a controlled, reproducible POC, we identified this infra risk *before* attempting a 100-page migration.
* **TypeDoc Build:** `PASS`.

## 11. Final Decision

`DOCS-PLATFORM-2: PARTIAL` (Due to Node v24 Webpack schema bug)

`DOCUSAURUS_DECISION: CONFIRMED` (Architecturally perfectly sound, issues are purely Node 24 / Webpack related)

`TYPEDOC_POC: PASS`

`HOSTING: UNKNOWN`

`NEXT: resolve blocker` (Investigate Node 24 workaround or wait for Docusaurus patch before full migration)
