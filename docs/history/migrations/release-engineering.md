# HardKAS Release Engineering

This document outlines the standards for producing clean, verifiable, and hardened release artifacts for HardKAS.

## 1. The Clean State Principle

HardKAS releases must never include ambient developer state, local caches, or sensitive material. The following directories and files are **STRICTLY FORBIDDEN** in any release artifact:

- **Git Metadata**: `.git/`, `.gitignore`, `.github/`
- **Developer State**: `.hardkas/` (Artifacts, Events, Store), `.env`
- **Caches**: `node_modules/`, `.turbo/`, `dist/` (unless specifically pre-built for a binary release)
- **Local Databases**: `store.db`, `store.db-wal`, `store.db-shm`
- **Secrets**: `keystore/`, `*.key`, `*.pem`

## 2. Automated Release Packaging

To ensure a clean release, use the automated packaging script:

```bash
pnpm pack-release
```

### What this script does:
1.  **Validation**: Ensures there are no uncommitted changes (optional but recommended).
2.  **Exclusion**: Uses `git archive` or a disciplined exclusion list to ignore forbidden files.
3.  **Audit Integrity**: Generates a SHA-256 manifest of all included files.
4.  **Reproducibility**: Packages the code in a way that is bit-for-bit identical when run from the same commit.

## 3. Manual Audit ZIPs (Caveat)

There is exactly ONE exception to the "No .hardkas" rule: **Audit Evidence Bundles**.

If you are providing a ZIP to a security auditor or for diagnostic support, you may include a sanitized `.hardkas` directory. 
- **CRITICAL**: You MUST run `hardkas lock clear --all` before zipping to ensure no stale locks are included.
- **CRITICAL**: You MUST NOT include the `keystore/` directory.

## 4. Release Checklist

Before marking a release as stable:
- [ ] `pnpm check` passes (Types, Lint, Docs).
- [ ] `pnpm test` passes (100% coverage on core invariants).
- [ ] `pnpm docs:check-cli` confirms no drift.
- [ ] `pnpm pack-release --dry-run` shows zero forbidden files.

---

> [!IMPORTANT]
> Any release found to contain `.hardkas/` artifacts or `node_modules` is considered **MALFORMED** and must be retracted immediately.
