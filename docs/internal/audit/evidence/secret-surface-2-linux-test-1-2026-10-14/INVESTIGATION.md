# SECRET-SURFACE-2-LINUX-TEST-1 (2026-10-14)

CI (Linux, GitHub Actions) on the published `8f381739d` failed one test:

`packages/cli/test/secret-surface-2.test.ts` › "the .key files of dev accounts are not searched (their permissions are
checked instead)" — `SECURITY_AUDIT_FAILED: Key permission != 0600 for alice.key (got 0644)`.

## Cause (a test fixture, not the product)

- The case plants `.hardkas/dev-accounts/keys/alice.key` with `fs.writeFileSync(p, content)`, which sets no mode, so the
  process umask decides; under Linux's usual 022 the file gets `0644`. It then expects the audit to pass.
- `security audit` (`packages/cli/src/commands/security.ts:105`) requires dev keys to be `0600` outside Windows. On
  Windows modes do not carry that information, so the check is relaxed there. The audit is right to report `0644`; the
  fixture is wrong.
- The test and `security.ts` were last changed in `3b0651e7f` (SECRET-SURFACE-2). Neither SECURITY-INTEGRATION-1
  (`b2a137878`) nor TASK-EVIDENCE-UNBOUND-1 (`8f381739d`) touches them.
- Limit: the GitHub Actions history could not be read here (no `gh`). The code shows the defect predates both waves; it
  does not show that CI failed continuously since 10-oct.

## Reproduction on Linux (no network)

No Linux distribution in WSL, so a local Linux image that ships Node was used (`verdaccio/verdaccio:latest`, Node
v24.15.0, `--network none`, nothing downloaded):
- the isolated tree is mounted read-only;
- pnpm's Windows junctions appear there as links to the Docker Desktop host path, so that single path is recreated in the
  container as a link to the mount and the exact pnpm layout resolves (`scripts/linux-audit.mjs`);
- the built CLI (`0.12.0-rc.27`, tree `1cb80d8e`) runs `security audit` on the test's fixture, umask 022.

Results (`logs/linux-audit-before.json`):

| Fixture | Key mode | Result |
|---|---|---|
| as the test writes it today (no mode) | 0644 | exit 1, `SECURITY_AUDIT_FAILED`, «Key permission != 0600 for alice.key (got 0644)»: **the CI failure** |
| corrected (0600) | 0600 | exit 0, «Security audit passed» |
| new negative (0644) | 0644 | exit 1, the specific permission finding; the key's value never printed |

The vitest file itself cannot run in that container offline: the pnpm store holds only the win32 esbuild binaries. The
Linux evidence is the product's own CLI on the test's exact fixtures.

## Fix (test only; `security.ts` unchanged)

- `plant(rel, content, mode?)` sets an explicit mode with `chmodSync` after writing, so the umask cannot change it.
- The case plants the dev key `0600`, the way a dev key must be.
- New case, skipped on Windows (`it.skipIf(process.platform === "win32")`): a `0644` dev key gives exit 1 and
  `SECURITY_AUDIT_FAILED`. It asserts the specific finding `Key permission != 0600 for alice.key (got 0644)`, not just
  the exit code, and that the key's value is never printed.

## Results

| Run | Result |
|---|---|
| Windows, BEFORE (the published file, `teu2` tree = same content) `ssl-before-windows` | 48/48: Windows cannot see the defect |
| Windows, AFTER `ssl-after-windows` | 48 passed, 1 skipped (the new Linux-only case), 0 failed: no Windows regression |
| Linux (CLI on the fixtures) | today's fixture reproduces the CI failure; the corrected one passes; the negative one is reported specifically |

`secret-surface-2.test.ts` is the only test that runs `security audit`.
