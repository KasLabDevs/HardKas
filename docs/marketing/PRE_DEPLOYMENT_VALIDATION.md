# HardKAS 0.12.0-rc.29 — Pre-Deployment SEO/GEO & Discovery Validation Gate

> **Document Type:** Pre-Deployment Verification & Architecture Audit  
> **Target Release:** HardKAS `0.12.0-rc.29`  
> **Audience:** Core Maintainers, DevRel, Security & Release Engineering  
> **Date:** October 28, 2026  
> **Status:** **VALIDATION COMPLETE — READY FOR REVIEW / PENDING DEPLOYMENT ARCHITECTURE DECISION**

---

## 1. Executive Summary & Deployment Verdict

| Audit Dimension | Target Checked | Result | Status |
|---|---|---|---|
| **CLI Docs Drift Gate (`check:docs`)** | Monorepo Markdown (`README.md`, `docs/**`) | **PASS (0 drifts / 319 commands)** | 🟢 RESOLVED |
| **CLI Generated Docs (`docs:check-cli`)** | `docs/reference/cli.md` vs CLI Tree | **PASS (240 commands synced)** | 🟢 RESOLVED |
| **Documentation Site Map (`docs:check-site`)** | `site/seo-ia-map.md` vs `docs/` | **PASS (0 contradictions)** | 🟢 RESOLVED |
| **Claims Verification (`docs:check-claims`)** | Code vs `docs/status/claims.generated.md` | **PASS (0.12.0-rc.29 verified)** | 🟢 RESOLVED |
| **Clean Quickstart Simulation** | 6-step flow in clean temp workspace | **PASS (6/6 steps verified)** | 🟢 RESOLVED |
| **Deterministic Replay Lineage** | Simulator execution & receipt replay | **PASS (3 artifacts replayed, PASS)** | 🟢 RESOLVED |
| **Structured Data (JSON-LD)** | `site/index.html` Schema.org markup | **PASS (100% code-backed)** | 🟢 VERIFIED |
| **Production Deployment Architecture** | `hardkas.dev` serving: `site/` vs `apps/docs` | **ACTION REQUIRED** | 🟡 PENDING DECISION |

### Final Verdict: `CONDITIONAL GO`
- **Code & Documentation Integrity:** **100% READY.** All automated doc gates pass cleanly (`Exit code: 0`), CLI reference is generated, zero drift detected across 319 commands, and the 60-second quickstart has been executed step-by-step in an isolated clean directory with 100% success.
- **Production Web Deployment:** **REQUIRES MANUAL DEVOPS DECISION.** The repository currently contains two separate web directories (`site/` and `apps/docs/build/`) without an automated GitHub Actions deployment script. Deploying `site/` alone would cause 404 errors on the 17 documentation URLs listed in `site/sitemap.xml`. Maintainers must choose between the unified merge strategy or subdomain separation before pushing live to `hardkas.dev`.

---

## 2. Investigation of `pnpm check:docs` (Root Cause & Resolution)

### 2.1 Why did `pnpm check:docs` fail twice with Exit Code 1?

When running `pnpm check:docs` (`pnpm --filter @hardkas/cli test:docs`), the test script executes `packages/cli/test/docs-drift.node.ts`.

#### Failure 1: Mixed Drift (Pre-existing + Local Edit)
- **Pre-existing Issue:** `packages/cli/test/docs-drift.node.ts` previously collected all markdown files in `docs/` using `getAllFiles(path.join(WORKSPACE_ROOT, "docs"), ".md").filter((f) => !f.includes("history"))`.
- **The Catch:** It recursively traversed `docs/internal/audit/evidence/`, which contains 11 historical audit ledger markdown files from late September / early October 2026 (release candidates `rc.23` and `rc.24`). In those private logs, developers used shorthand syntax (such as `rpc info|dag|utxos|mempool` and `pskt export|sign|finalize|extract`) that are not literal executable CLI commands.
- **Local Edit Issue:** During initial README formatting, `dev-server start --port 7420` was added. Because `dev-server` is not a registered subcommand in `packages/cli/src/program.ts` (the command is `hardkas dev`), the detector flagged 12 total drifts (11 pre-existing historical + 1 in `README.md`).

#### Failure 2: Historical Drift Persistence
- We corrected `README.md` to `hardkas dev`.
- Running `pnpm check:docs` verified that `README.md` had **0 drifts**.
- However, the script still exited with code `1` because the 11 drifts inside `docs/internal/audit/evidence/` remained unexcluded.

### 2.2 Proof that Historical Evidence is Intended to be Excluded
In `scripts/check-site-map.mjs`, line 33-34 explicitly establishes repository architectural policy:
```javascript
// Not published: audit evidence and historical records.
const EXCLUDED_DIRS = new Set(["internal"]);
```
The drift detector in `packages/cli/test/docs-drift.node.ts` had simply omitted `internal` from its filter.

### 2.3 The Fix Applied
In [packages/cli/test/docs-drift.node.ts](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/packages/cli/test/docs-drift.node.ts#L136-L140):
```diff
- ].filter((f) => !f.includes("history"));
+ ].filter((f) => !f.includes("history") && !f.includes("internal"));
```

### 2.4 Verification Output
```bash
> pnpm check:docs
> @hardkas/cli@0.12.0-rc.29 test:docs
> tsx test/docs-drift.node.ts

--- HardKAS Docs Drift Detector ---
📄 README.md:
📄 docs\concepts\accounts.md:
📄 docs\concepts\security-model.md:
📄 docs\guides\debugging.md:
📄 docs\guides\troubleshooting.md:
📄 docs\guides\your-first-test.md:
📄 docs\marketing\KEYWORD_STRATEGY.md:
📄 docs\migrations\0.11-to-0.12.md:
📄 docs\migrations\0.12.md:
📄 docs\reference\cli.md:
📄 docs\reference\error-recovery.md:
📄 docs\reference\errors.md:
📄 docs\start\installation.md:
📄 docs\start\quickstart.md:
📄 docs\status\claims.generated.md:
📄 docs\status\covenants-status.md:
📄 docs\status\multinode-read.md:
📄 docs\status\programmability-surface.md:
📄 docs\status\release-claims.md:
📄 docs\status\send-routes-security.md:
📄 docs\tutorials\wallet-app.md:

Summary: 319 commands checked, 0 drifts found.
No drift detected. Documentation is aligned with CLI program.
Exit code: 0
```

---

## 3. Clean-Environment Quickstart Verification (Step-by-Step)

To guarantee that a developer installing HardKAS for the first time experiences zero friction, all quickstart commands were executed sequentially inside a freshly created directory (`tmp/quickstart-test-runner`).

### 3.1 Step 1: Workspace Initialization
```bash
npx @hardkas/cli init my-kaspa-app --skip-toolchain
```
- **Result:** `PASS (Exit Code: 0)`
- **Files Created:**
  - `my-kaspa-app/package.json` (pinned to `0.12.0-rc.29`)
  - `my-kaspa-app/hardkas.config.ts` (default target: simulator)
  - `my-kaspa-app/vitest.config.ts`
  - `my-kaspa-app/test/payment.test.ts`
  - `my-kaspa-app/.gitignore`
  - `my-kaspa-app/.hardkas/localnet.json` (5 synthetic accounts funded with 1,000 KAS each)

### 3.2 Step 2: In-Memory Transaction Planning
```bash
hardkas tx plan --from alice --to bob --amount 10 --network simulated --out tx-plan.json
```
- **Result:** `PASS (Exit Code: 0)`
- **Output Artifact:** `tx-plan.json`
- **Canonical Plan ID:** `plan-214ed2e27b13f891`
- **Lineage Hash:** `214ed2e27b13f89174a3a104d7c48a946d0cccae24078e64ac9592ae20e573d0`
- **Economic Invariants:** 1 input (1,000 KAS), 1 output (10 KAS), Fee: 0.002036 KAS, Mass: 2036.

### 3.3 Step 3: Strict Artifact Schema & Lineage Verification
```bash
hardkas artifact verify tx-plan.json --strict
```
- **Result:** `PASS (Exit Code: 0)`
- **Verification:** Economic and lineage invariants strictly verified against `HardkasSchemas.TxPlanV2`.

### 3.4 Step 4: Transaction Signing
```bash
hardkas tx sign tx-plan.json --account alice --out tx-signed.json
```
- **Result:** `PASS (Exit Code: 0)`
- **Output Artifact:** `tx-signed.json`
- **Signed ID:** `signed-92775e323f026f53`
- **Status:** `SIGNED` (synthetic-authorization for simulator target)

### 3.5 Step 5: Simulation Execution & Receipt Generation
```bash
hardkas tx send tx-signed.json --network simulated --yes
```
- **Result:** `PASS (Exit Code: 0)`
- **Receipt Written:** `.hardkas/artifacts/receipts/txReceipt-dbe59f724104a193880ab9136da9825d4d175736fa45925a7ecb065cdad524a2.json`
- **Artifact ID Printed:** `dbe59f724104a193880ab9136da9825d4d175736fa45925a7ecb065cdad524a2`

### 3.6 Step 6: Replay Determinism Verification
During our initial test, running `hardkas replay verify` without arguments failed with:
`✗ [REPLAY_MISSING_DEPENDENCY] No receipt ID provided for replay verification`.

As documented in `packages/cli/src/commands/replay.ts`, `replay verify [artifact]` requires either the receipt artifact ID or the path to the receipt file.

Running the command with the generated receipt ID:
```bash
hardkas replay verify dbe59f724104a193880ab9136da9825d4d175736fa45925a7ecb065cdad524a2
```
- **Result:** `PASS (Exit Code: 0)`
- **Replay Summary:**
  - Artifacts Replayed: `3` (Plan -> SignedTx -> Receipt)
  - Lineage Integrity: `valid`
  - Deterministic Execution: `verified`
  - Network Contamination: `clean`
  - Final Verdict: **`PASS`**

### 3.7 Documentation Refinement
[README.md](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/README.md#L55-L63) was updated to explicitly document `hardkas artifact verify tx-plan.json --strict` and `hardkas replay verify <receipt-id>`, completely eliminating user friction.

---

## 4. Public Deployment Architecture & Sitemap Risk Analysis

### 4.1 Monorepo Reality: Two Web Targets
The repository contains two distinct web targets with different structures and outputs:

```
HardKas-repo/
├── site/                     <-- Static Landing Page & IA Spec
│   ├── index.html            (152 KB standalone landing page with in-page anchors)
│   ├── robots.txt            (Directs crawlers to https://hardkas.dev/sitemap.xml)
│   ├── sitemap.xml           (Curated index of 18 high-priority canonical URLs)
│   ├── llms.txt              (Machine-readable context for AI crawlers)
│   └── seo-ia-map.md         (Specification defining 17 public URLs)
│
└── apps/docs/                <-- Full Docusaurus v3 Documentation Engine
    ├── docusaurus.config.ts  (url: 'https://hardkas.dev', baseUrl: '/', routeBasePath: '/')
    ├── static/
    │   ├── robots.txt        (Mirrored bot policy)
    │   └── llms.txt          (Mirrored LLM context)
    └── build/                (Generated static HTML tree: 918 markdown pages)
        ├── sitemap.xml       (139 KB XML sitemap indexing all generated docs)
        ├── getting-started/  (index.html, installation.html, quickstart.html)
        ├── concepts/         (execution-contract.html, replay.html, etc.)
        └── reference/        (cli.html, sdk.html, etc.)
```

### 4.2 Critical Pre-Deployment Risk: The Routing Mismatch
1. **Current Absence of CI/CD Deployment:**
   There are no automated deployment workflows in `.github/workflows/` (only `ci.yml` and `hardkas-examples.yml`). Deployment to `hardkas.dev` is configured outside GitHub Actions or managed manually.
2. **The 404 Danger:**
   - If a hosting provider (such as GitHub Pages or Cloudflare Pages) is pointed solely at `site/`, only `site/index.html` exists at the apex domain.
   - Any crawler or developer visiting URLs listed in `site/sitemap.xml` (e.g. `https://hardkas.dev/getting-started/quickstart`) would receive an **HTTP 404** because the directory `site/getting-started/` does not exist on disk in `site/`.
3. **The Docusaurus Overwrite Danger:**
   - If the hosting provider is pointed at `apps/docs/build/`, Docusaurus serves its own generated `index.html` at the apex, which replaces `site/index.html`.

### 4.3 Recommended Deployment Strategies

#### Option 1: Unified Static Build (Recommended for Apex Domain)
Configure the deployment build command to:
1. Build Docusaurus: `pnpm --filter @hardkas/docs build`.
2. Copy `site/index.html` to `apps/docs/build/landing.html` OR replace Docusaurus's homepage with `site/index.html`.
3. Merge `site/robots.txt` and `site/llms.txt` into the root of `apps/docs/build/`.
4. Result: `hardkas.dev/` serves the high-converting landing page, while `hardkas.dev/getting-started/...` and `hardkas.dev/concepts/...` serve real Docusaurus documentation pages with zero 404s.

#### Option 2: Subdomain / Subpath Architecture
- Serve `site/index.html` at `https://hardkas.dev/`.
- Serve Docusaurus at `https://hardkas.dev/docs/` or `https://docs.hardkas.dev/`.
- In this model, `site/sitemap.xml` and all documentation links must use the `/docs/` prefix.

---

## 5. Structured Data (JSON-LD) Verification Audit

The Schema.org structured data embedded in [site/index.html](file:///c:/Users/jrodr/Documents/kaslabdevs/GitHub/HardKas-repo/site/index.html#L658-L697) was audited against codebase evidence:

| Schema Property | Claimed Value in JSON-LD | Monorepo Codebase Evidence | Audit Verdict |
|---|---|---|---|
| `@type: WebSite.name` | `HardKAS` | Matches project branding | ✅ PASS |
| `@type: WebSite.url` | `https://hardkas.dev/` | Matches canonical URL | ✅ PASS |
| `@type: SoftwareApplication.softwareVersion` | `0.12.0-rc.29` | `package.json` line 3: `"0.12.0-rc.29"` | ✅ PASS |
| `@type: SoftwareApplication.license` | `https://opensource.org/licenses/MIT` | Root `LICENSE` file is MIT | ✅ PASS |
| `@type: SoftwareApplication.operatingSystem` | `Linux, macOS, Windows` | Validated by `.github/workflows/ci.yml` matrix (`ubuntu-latest`, `windows-latest`, `macos-latest`) | ✅ PASS |
| `@type: SoftwareSourceCode.programmingLanguage` | `["TypeScript", "Rust"]` | TypeScript monorepo packages + Rust toolchain (`rusty-kaspad`) | ✅ PASS |
| `@type: SoftwareSourceCode.runtimePlatform` | `Node.js >= 22.5.0` | `package.json` engines field: `"node": ">=22.5.0"` | ✅ PASS |
| `@type: SoftwareSourceCode.codeRepository` | `https://github.com/KasLabDevs/HardKas` | Matches git remote origin URL | ✅ PASS |

**Result:** Zero speculative claims, zero EVM conflation, and 100% compliance with `AI_CHANGE_POLICY.md`.

---

## 6. Inventory of Modified & Created Files

### 6.1 Documentation & Marketing (New Assets)
- `docs/marketing/PROJECT_AUDIT.md` — Initial SEO/GEO and discovery gap analysis.
- `docs/marketing/KEYWORD_STRATEGY.md` — High-intent developer keyword matrix.
- `docs/marketing/PRE_DEPLOYMENT_VALIDATION.md` — This validation gate document.

### 6.2 Public Site & SEO Assets
- `site/index.html` — Fixed syntax error, canonical URL, OG/Twitter tags, validated JSON-LD.
- `site/robots.txt` — Crawler directives for Googlebot, Bingbot, ClaudeBot, GPTBot, PerplexityBot.
- `site/sitemap.xml` — Canonical URL map for the apex domain.
- `site/llms.txt` — Machine-readable LLM training & inference context file.
- `apps/docs/static/robots.txt` — Mirrored crawler policy for Docusaurus static build.
- `apps/docs/static/llms.txt` — Mirrored LLM context file for Docusaurus static build.

### 6.3 Monorepo & CLI Synchronizations
- `README.md` — Value proposition, honest Hardhat comparison table, verified 60-second quickstart.
- `packages/cli/test/docs-drift.node.ts` — Excluded unpublished `internal/` audit logs from doc drift tests.
- `docs/reference/cli.md` & `docs/reference/cli.generated.json` — Synchronized via `pnpm docs:generate-cli` (including new `escrow rescue-v1` commands).

---

## 7. Pre-Deployment Action Checklist

Before triggering production release or deployment:

- [x] **1. Verify `pnpm check:docs`:** Exits with code 0 (319 commands, 0 drifts).
- [x] **2. Verify `pnpm docs:check-cli`:** Exits with code 0 (CLI reference up to date).
- [x] **3. Verify `pnpm docs:check-claims`:** Exits with code 0 (Claims match rc.29).
- [x] **4. Verify `pnpm docs:check-site`:** Exits with code 0 (IA map has no contradictions).
- [x] **5. Test Quickstart from scratch:** All 6 steps pass with verified replay.
- [ ] **6. Manual Action (DevOps):** Define the deployment architecture for `hardkas.dev` (Unified build vs separate subdomain).
- [ ] **7. Manual Action (GitHub):** Add GitHub Topics to `KasLabDevs/HardKas` repository (`kaspa`, `kaspa-l1`, `utxo`, `blockdag`, `transaction-simulator`, `toccata`, `silverscript`, `developer-tools`).
- [ ] **8. Manual Action (Maintainer):** Review and merge the prepared documentation changes.
