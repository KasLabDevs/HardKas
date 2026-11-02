# HardKAS — Technical Project Discovery & Capability Audit

**Document Version:** 1.0.0  
**Baseline Release:** HardKAS `0.12.0-rc.29` (`hardened-alpha`, proof `repro-v0`, hash version `5`)  
**Repository:** [KasLabDevs/HardKas](https://github.com/KasLabDevs/HardKas)  
**Website:** [https://hardkas.dev](https://hardkas.dev)  
**Author / Auditor:** Antigravity Autonomous Engineering & Growth Team  
**Audit Date:** October 28, 2026  
**Claims Policy:** Strictly code-backed and evidence-tested. No speculative or marketing-inflated claims.

---

## 1. Architectural & Technology Stack Audit

| Dimension | Implementation Reality in Codebase | Source Reference |
|---|---|---|
| **Repository Model** | Monorepo managed with `pnpm@9.15.4` and Turborepo `v2.3.3`. Strictly partitioned into Level 0 (Foundations), Level 1 (Primitives), Level 2 (SDK Composition), Level 3 (Extensions), Level 4 (Presentation & Labs). | `pnpm-workspace.yaml`, `turbo.json`, `package.json` |
| **Node.js Runtime** | Node.js `>=22.5.0` (CI strictly pinned to Node `24.22.1` across Linux, Windows, macOS). | `package.json:engines`, `.github/workflows/ci.yml:18` |
| **Frontend Frameworks** | **1. Marketing Site (`site/index.html`):** Single-file vanilla semantic HTML5/CSS (~2,769 lines) with responsive inline JS. Zero external JavaScript bundle dependencies. Custom Kaspa teal/dark theme with IBM Plex Sans/Mono.<br>**2. Visual Developer Console / IDE (`apps/dashboard`):** React 19 + TypeScript + Vite 6.0 + Tailwind CSS v4 + React Flow (`@xyflow/react`) + TanStack Query.<br>**3. Documentation App (`apps/docs`):** Docusaurus 3.10.2 + React 18 + MDX + Prism React Renderer + TypeDoc. | `site/index.html`, `apps/dashboard/package.json`, `apps/docs/package.json` |
| **Backend Architecture** | **1. HTTP/SSE Dev-Server (`packages/dev-server`):** Hono v4 on `@hono/node-server` with Bearer auth, token rotation, and rate-limiting middleware.<br>**2. Storage (`packages/storage-sqlite`):** SQLite (`better-sqlite3`) embedded database for projection stores and artifacts metadata.<br>**3. Core Primitives (`packages/core`, `packages/accounts`, `packages/tx-builder`):** Deterministic BIP32/44 key derivation, Schnorr BIP340, canonical serialization (BLAKE2b/SHA-256), and Consensual Kaspa Mass engine.<br>**4. Local Execution (`packages/simulator`, `packages/localnet`):** In-memory synchronous DAG simulator and Docker orchestration of `rusty-kaspad` v2.0.0 on Kaspa `simnet` with CPU miner companion (`kaspanet/cpuminer`). | `packages/dev-server/src/server.ts`, `packages/simulator/src/`, `packages/localnet/src/` |
| **Routing System** | **Marketing:** Single-page anchor routing (`#overview`, `#execution-contract`, `#artifacts`, `#replay`, `#toccata`, `#quickstart`, `#ide`).<br>**Documentation:** Docusaurus file-based routing (`/concepts/*`, `/guides/*`, `/reference/*`).<br>**Planned Architecture:** Information Architecture Map (`site/seo-ia-map.md`) defining 17 canonical URLs. | `site/index.html`, `apps/docs/docusaurus.config.ts`, `site/seo-ia-map.md` |
| **Build & Packaging System** | Turborepo pipeline (`pnpm build`, `pnpm typecheck`, `pnpm lint`). Packaging smoke gate (`scripts/check-packaging-smoke.mjs`) verifying 32 tarballs for zero workspace leaks and strictly whitelisted `"files"`. | `turbo.json`, `scripts/check-packaging-smoke.mjs` |
| **Hosting Configuration** | Static hosting targeted for `https://hardkas.dev`. CNAME / DNS root points to static deployment. | `apps/docs/docusaurus.config.ts:7`, `site/index.html:8` |

---

## 2. SEO, GEO & Developer Discoverability Baseline

### Current Metadata & Asset Status

| Component | Current State in Repository | Evaluation & Defect Identification |
|---|---|---|
| **Title Tags** | `HardKAS: Execution-safe development for Kaspa` | Generic. Does not mention "Kaspa L1 Development Framework", "IDE", or "SilverScript". Missing primary developer keyword hooks. |
| **Meta Description** | `Plan, sign, send and verify Kaspa transactions with explicit targets, verifiable artifacts and strict compatibility guards.` (126 chars) | Accurate to technical invariants, but lacks clear categorization (e.g., "Kaspa smart contract testing, localnet, SilverScript covenants"). |
| **Canonical URLs** | `<link rel="canonical" href="https://hardkas.dev/"/>` in `site/index.html:500`. Docusaurus docs use standard canonical URLs. | Functional on root, but `site/index.html` contains malformed placement (inserted immediately after an unclosed `</script>` tag before `</head>`). |
| **Open Graph (OG)** | Only `og:title` is present. Missing `og:description`, `og:image`, `og:url`, `og:type`, `og:site_name`. | Broken social/chat preview across Twitter, Discord, Telegram, LinkedIn, and GitHub discussions. |
| **Twitter / X Cards** | Only `<meta name="twitter:card" content="summary_large_image"/>` present. Missing `twitter:title`, `twitter:description`, `twitter:image`. | Incomplete. Previews will render empty cards or fallback to page title only. |
| **robots.txt** | **MISSING** at repository root and in `site/`. | Search crawlers and AI bots (Googlebot, Bingbot, ClaudeBot, GPTBot) receive default unguided crawl behavior without sitemap reference. |
| **sitemap.xml** | Present in Docusaurus build output (`apps/docs/build/sitemap.xml`), but **MISSING** for the primary domain root and `site/`. | Search engines cannot efficiently discover all IA routes. |
| **Structured Data (JSON-LD)** | Basic schema defined in `site/index.html` with `@type: "WebSite"` and `@type: "SoftwareApplication"`. | Incomplete: missing `SoftwareSourceCode`, repository URL, license, operating systems, `TechArticle`, and breadcrumbs. |
| **Machine-Readable AI Index (`llms.txt`)** | **MISSING** in `site/` and repository root. | Answer engines (Perplexity, ChatGPT Search, Gemini) have no structured markdown overview to cite without crawling heavy HTML. |
| **Internal Linking & IA Coverage** | `site/seo-ia-map.md` defines 17 canonical URLs. When audited via `scripts/check-site-map.mjs`, **0/17 URLs are backed by front matter** in `docs/` (70 docs are currently marked pending). | Critical content disconnect: rich markdown documentation exists in `docs/`, but does not declare public URL mappings. |

---

## 3. GitHub Presence & Discoverability Audit

- **Repository:** `https://github.com/KasLabDevs/HardKas`
- **Default Branch:** `main`
- **License:** MIT
- **Release:** `0.12.0-rc.29`
- **Current README Assessment:**
  - *Strengths:* Highly rigorous, honest, and technically accurate. Explains the Execution Contract, invariants, artifact lifecycle, and explicit non-claims.
  - *Weaknesses for Developer Onboarding:*
    1. **High barrier to entry:** Jumps straight into internal mathematical/philosophical contract definitions (`tuple of (mode, domain, network)`) without answering the immediate questions: *"What is HardKAS?"*, *"Can I use it like Hardhat for Kaspa?"*, and *"How do I install and run a test in 60 seconds?"*.
    2. **Missing Quick Installation:** The top of the README lacks simple `npm install -g @hardkas/cli` or `npx @hardkas/cli init` instructions.
    3. **Missing Comparison Table:** Does not offer a clear comparison matrix between HardKAS, Ethereum Hardhat/Foundry, and raw Kaspa RPC.
    4. **Missing GitHub Topics Recommendation:** Needs explicit tags (`kaspa`, `kaspa-l1`, `silverscript`, `covenants`, `smart-contracts`, `developer-tools`, `blockchain-development`, `localnet`, `testing-framework`).

---

## 4. Code-Backed Capability Matrix

Every feature is classified into one of five strict categories based on real evidence in tests and source code:

1. **Implemented & Tested:** Full test suite passes, code active in production packages.
2. **Implemented but Experimental:** Code exists and runs in dedicated tests/labs, but marked experimental or not certified for mainnet.
3. **Partially Implemented:** Functional subset exists, but specific capabilities are explicitly unsupported or blocked.
4. **Planned:** Documented in IA or roadmaps, but no executable code exists in the current release.
5. **Unsupported / Blocked by Policy:** Explicitly rejected by code, security guards, or release claims.

### Capability Verification Table

| Category | Capability / Feature | Status | Evidence / Source File Reference |
|---|---|---|---|
| **Local Development** | In-Memory Deterministic Transaction Simulator | **IMPLEMENTED & TESTED** | `packages/simulator/src/simulator.ts`, `packages/simulator/test/` |
| **Local Development** | Localnet Docker Orchestration (`rusty-kaspad` v2.0.0 on `simnet` + CPU Miner) | **IMPLEMENTED & TESTED** | `packages/localnet/src/manager.ts`, `packages/localnet/test/` |
| **Artifacts & Replay** | Deterministic Artifacts (TxPlan, SignedTx, TxReceipt) with Canonical Hashing | **IMPLEMENTED & TESTED** | `packages/artifacts/src/hasher.ts`, `packages/artifacts/src/schemas/` |
| **Artifacts & Replay** | Offline Workflow Replay & State Reconstruction at DAA Score | **IMPLEMENTED & TESTED** | `packages/sdk/src/replay.ts`, `packages/cli/src/commands/replay.ts` |
| **Transaction Engine** | UTXO Coin Selection & Consensual Kaspa Mass Calculation | **IMPLEMENTED & TESTED** | `packages/tx-builder/src/mass.ts`, `packages/tx-builder/src/service.ts` |
| **Transaction Engine** | Partially Signed Kaspa Transactions (PSKT) Native Rust NAPI Binding | **IMPLEMENTED & TESTED** | `packages/pskt-native/src/lib.rs`, `packages/pskt-native/index.js` |
| **Key Management** | BIP32 / BIP44 Key Derivation & Schnorr BIP340 Signatures | **IMPLEMENTED & TESTED** | `packages/core/src/crypto.ts`, `packages/accounts/src/` |
| **Key Management** | Argon2id + AES-256-GCM Secure Keystore Encryption | **IMPLEMENTED & TESTED** | `packages/accounts/src/keystore.ts` |
| **RPC & Network** | Kaspa wRPC WebSocket Client with Reorg Filter & DAA Consensus Medians | **IMPLEMENTED & TESTED** | `packages/kaspa-rpc/src/client.ts`, `packages/kaspa-rpc/test/` |
| **Observability** | SQLite Query Store Projection Engine with Drift Detection | **IMPLEMENTED & TESTED** | `packages/query-store/src/store.ts`, `packages/query-store/test/` |
| **IDE & Dashboard** | Visual Web Dashboard / IDE with React Flow Graph & SSE Telemetry | **IMPLEMENTED & TESTED** | `apps/dashboard/src/App.tsx`, `packages/dev-server/src/server.ts` |
| **Dev Server Security** | Dev-Server Bearer Auth, Rate Limiting, Proxy Allowlist, & 2-Step Logout | **IMPLEMENTED & TESTED** | `packages/dev-server/src/rate-limit.ts`, `packages/dev-server/test/` |
| **Smart Contracts** | Managed `silverc` Compiler Toolchain Installation & Verification | **IMPLEMENTED & TESTED** | `packages/cli/src/commands/toolchain.ts`, `packages/cli/src/commands/silver.ts` |
| **Smart Contracts** | SilverScript P2SH Deploy & Spend Lifecycle on Real Localnet Node | **IMPLEMENTED & TESTED** | `fixtures/toccata-v2/silver/`, `scripts/toccata-gauntlet.mjs` |
| **Smart Contracts** | SilverScript Relative Timelock Verification | **IMPLEMENTED & TESTED** | `fixtures/toccata-v2/silver/p2sh-timelock.json` |
| **Covenants (Toccata)** | Toccata 1:1 Auth-Bound Covenant Transition | **IMPLEMENTED & TESTED** | `fixtures/toccata-v2/silver/covenant-1to1.json` |
| **Covenants (Toccata)** | General Covenants (Leader/Cov-Bound, N:M, Derived State, Metering) | **UNSUPPORTED / NOT CLAIMED** | `packages/sdk/src/programmability.ts:nonClaims()` |
| **ZK & Verifiable Progs** | Groth16 / RISC0 Proof Fixture Inspection & Coherence Verification | **EXPERIMENTAL** | `packages/sdk/src/zk.ts`, `packages/cli/src/commands/zk.ts` |
| **ZK & Verifiable Progs** | On-Chain ZK Proof Verification on Kaspa L1 | **UNSUPPORTED / NOT CLAIMED** | `packages/sdk/src/programmability.ts:nonClaims()` |
| **Verifiable Programs** | vProgs Artifact Inspection Surface | **EXPERIMENTAL** | `packages/sdk/src/vprogs.ts`, `packages/cli/src/commands/vprogs.ts` |
| **Verifiable Programs** | vProgs Full Consensus Runtime & Stable API | **UNSUPPORTED / NOT CLAIMED** | `packages/sdk/src/programmability.ts:nonClaims()` |
| **EVM / Layer 2** | Igra L2 JSON-RPC tooling (`@hardkas/l2`; CLI group opt-in) | **EXPERIMENTAL** | `packages/l2/src/` (`trustlessExit: false`; default profile `local`; L2 mainnet writes need explicit authorization) |
| **EVM / Layer 2** | Trustless Bridge or L2 Native Rollup Execution | **UNSUPPORTED / NOT CLAIMED** | `packages/sdk/src/programmability.ts:nonClaims()` |
| **Consensus & Network** | Full Kaspa Consensus Validation / Kaspa VM Simulation in JS | **UNSUPPORTED / NOT CLAIMED** | `docs/status/claims.generated.md:27` |
| **Network Policy** | Kaspa L1 Mainnet Transaction Broadcast | **BLOCKED BY POLICY** | `packages/sdk/src/capabilities.ts`, `packages/core/src/policy.ts` |
| **Network Policy** | Public Testnet Unbounded Broadcast | **BLOCKED BY POLICY** | `docs/status/claims.generated.md:21` |
| **Production Use** | Production Mainnet Deployment Readiness | **NOT CLAIMED** | `docs/status/claims.generated.md:20` (`LOCAL_FIRST_DEVELOPER_RUNTIME_HARDENED`) |

---

## 5. Architectural Non-Negotiables for Marketing & Discovery

1. **Kaspa L1 is NOT EVM-Compatible:** Kaspa is a Proof-of-Work GHOSTDAG/BlockDAG network executing Kaspa Script and covenants (via Toccata). Any marketing claiming "Kaspa EVM" or "EVM on L1" is technically false and damages project credibility.
2. **HardKAS is "Hardhat-Inspired", NOT Hardhat:** HardKAS translates the developer ergonomics of Hardhat/Foundry (local node, scriptable tasks, instant simulator, deterministic accounts, test runners) to the UTXO BlockDAG architecture of Kaspa.
3. **Honesty as a Growth Strategy:** Developer adoption in crypto relies entirely on trust. Stating clearly what is ready (`simulator`, `localnet`, `silverc`, artifacts, replay) and what is not claimed (mainnet, on-chain ZK, general covenants) positions HardKAS as an honest engineering framework for Kaspa builders.
