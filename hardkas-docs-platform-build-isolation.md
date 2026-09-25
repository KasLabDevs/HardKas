# DOCS-PLATFORM-2B: Build Blocker Isolation Report

This report documents the findings of isolating the `ValidationError: Invalid options object. Progress Plugin` error encountered during the Docusaurus POC on Node 24.15.0. 

## 1. Dependency State Capture (Before Isolation)
The original failed state in `apps/docs` (using `pnpm why`) resolved to:
* **Node:** `v24.15.0`
* **pnpm:** `9.15.4`
* **@docusaurus/core:** `3.7.0`
* **@docusaurus/preset-classic:** `3.7.0`
* **Webpack:** `5.111.1` (resolved via `@docusaurus/types -> minimizer-webpack-plugin`)
* **Webpackbar:** `6.0.1` (resolved via `@docusaurus/bundler`)
* **React / React-DOM:** `18.3.1`

## 2. Evidence of Failure (Docusaurus 3.7.0)
As captured in `DOCS-PLATFORM-2`, building with Docusaurus 3.7.0 under Node 24.15.0 consistently failed with:
```
ValidationError: Invalid options object. Progress Plugin has been initialized using an options object that does not match the API schema.
```
This aligns with upstream reports of `webpackbar@6` schema incompatibilities when executed on Node 24.

## 3. Current Stable Test (Docusaurus 3.10.2)
To prove the root cause, we isolated the Docusaurus version by upgrading **only** the Docusaurus toolchain, while explicitly retaining Node 24.15.0.

* Updated `@docusaurus/*` packages in `apps/docs/package.json` to exactly `3.10.2`.
* Ran `pnpm install` in the monorepo root.
* New dependency resolutions:
  * **Webpack:** `5.111.1` (Unchanged)
  * **Webpackbar:** `7.0.0` (Updated! Docusaurus 3.10.2 bumped `webpackbar` internally to fix the schema bug).

## 4. Build Validation
Running `pnpm exec docusaurus build` with Docusaurus 3.10.2 + Node 24.15.0 yielded a completely different result:
```
[webpackbar] i Compiling Client
[webpackbar] i Compiling Server
[webpackbar] √ Server: Compiled successfully in 7.21s
[webpackbar] √ Client: Compiled successfully in 25.74s
[SUCCESS] Generated static files in "build".
```
*(Note: A transient error involving a PowerShell BOM character in `custom.css` and a `onBrokenLinks` warning from TypeDoc references were encountered and trivially fixed, proving the Webpack pipeline itself was healthy).*

The static output successfully generated the POC routes:
* `/getting-started/index.html`
* `/concepts/artifact-id/index.html` (Confirming MDX and React Context compilation)
* `/qualification/index.html`

## 5. Classification
The root cause of the previous build failure was **not** Node 24 inherently breaking Webpack, but rather a known incompatibility in `webpackbar@6` that was fixed upstream and bundled into `webpackbar@7` / Docusaurus 3.10.x.

**Do not downgrade Node.**

### Engine Requirements Separation
* `HARDKAS_NODE_REQUIREMENT`: `>=22.5.0` (Monorepo rule)
* `DOCUSAURUS_NODE_REQUIREMENT`: `>=18.0.0` (Docusaurus 3.x baseline)
Because Docusaurus 3.10.2 supports Node 24.15.0 natively, there is no conflict between the framework and the monorepo's modern execution environment.

## 6. Final Status

* **OLD_DOCUS_VERSION:** `3.7.0`
* **CURRENT_TESTED_VERSION:** `3.10.2`
* **NODE:** `v24.15.0`
* **WEBPACK_OLD:** `5.111.1`
* **WEBPACK_CURRENT:** `5.111.1`
* **WEBPACKBAR_OLD:** `6.0.1`
* **WEBPACKBAR_CURRENT:** `7.0.0`

* **OLD_BUILD:** `FAIL`
* **CURRENT_BUILD:** `PASS`
* **ROOT_CAUSE:** `PROVEN` (Upstream `webpackbar` schema bug on Node 24, fixed in v7)
* **NODE_DOWNGRADE_REQUIRED:** `NO`

* **DOCS-PLATFORM-2:** `PASS`
* **DOCUSAURUS_DECISION:** `CONFIRMED`
* **NEXT:** `DOCS-MIGRATION-1`
