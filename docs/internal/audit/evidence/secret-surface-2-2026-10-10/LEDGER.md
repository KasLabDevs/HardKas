# SECRET-SURFACE-2 · ledger (2026-10-10)

Isolated worktree `%TEMP%\hk-ra\wt`, detached at develop `6ebc5f330` (EVENT-LEDGER-2 published; tree `24e24974`). The
owner's checkout was not touched. No commit / push / bump.

Investigation and BEFORE: `before/INVESTIGATION.md`, `before/tests/*`, `before/logs/ss2-before-1.*` (8 red / 5 green
controls). Reviewer's decisions (2026-10-10, round 2): **GO limited** — D2 SECURITY-AUDIT-BLIND, D3 HARDKAS_DEV_TOKEN in
`env check`, D4 the ANSI bypass with a centralised redaction; **D1 `kaspa wallet create` in DESIGN HOLD** (contract
approved for every network: no private key or mnemonic printed by default, reveal by explicit opt-in; implementation
waits for the recoverability decision: `D1-WALLET-CREATE-RECOVERABILITY.md`); `DASHBOARD-TOKEN-EXPOSURE-1` registered
for a separate investigation (§5). §1–§6 are that round's record, as delivered. **Round 3 (the closing round: "GO D1/P1
+ FINAL QUALIFICATION") is §7–§8**: D2/D3/D4 accepted provisionally, P1 chosen for D1, the combined D2+D4 regression,
the full hermetic gate and the final manifest.

## 1 · The defects (from the investigation; each proven at runtime in `ss2-before-1`)

| # | Surface | Before | Cause |
| --- | --- | --- | --- |
| SS2-A | `security audit` | PASS with the plaintext key `localnet account create` writes to `.hardkas/accounts.real.json`, and with a planted mnemonic | `commands/security.ts:64`: `\\s` inside a regex literal is a backslash and an "s", not whitespace; the mnemonic branch could never match |
| SS2-B | `kaspa wallet create --network mainnet` | prints the private key (every network) | `runners/kaspa-wallet-runner.ts:42`; the key is `crypto.randomBytes(32)`, nothing is saved, no mnemonic exists — the printed line is the only copy (D1 HOLD) |
| SS2-C | `env check` | prints `HARDKAS_DEV_TOKEN` in clear, human and `--json` | `commands/env.ts:115` prints every known variable's value; no variable was marked secret |
| SS2-D | the CLI with colours on | `kaspa doctor --rpc-url http://user:pw@…` prints the password; a coloured 64-hex is not masked | the redactions anchor on `\b`; no word boundary after an escape sequence's final "m" (`core/src/security.ts`); `?token=` values were already safe (no `\b`) |

## 2 · Decisions and how each was implemented

| Decision | Verdict | Implementation |
| --- | --- | --- |
| **D2** audit detection | GO: HardKAS's real formats (JSON fields, hex private keys, mnemonics, account secret material, whitespace variants); **no automatic simnet / plaintext exemption**; any exemption expressly delimited and documented | `cli/src/commands/security.ts`: `findSecretMaterial(content)` (exported for tests) matches by **name + shape** — a 64-hex value is also every content hash and txId, so a bare one is never a finding: (1) a key-bearing field (`privateKey`, `privateKeyHex`, `privateKeyWif`, `secretKey`, `secret`) with optional quotes, `\s*` around `:` or `=`, followed by 64 hex; (2) a `.env`-style variable `*_PRIVATE_KEY` / `*PRIVKEY` / `*_SECRET_KEY` `= <64 hex>` (the line `kaspa wallet create` itself recommends); (3) a phrase-bearing field (`mnemonic`, `seedPhrase`, `seed`) followed by 12–24 lower-case words on one line; (4) a `*MNEMONIC` / `*SEED(_PHRASE)` variable with such a phrase; (5) an `xprv…` value anywhere. A finding names the file, the kind and the field or variable — **never the value**. The one exemption (`isExemptDevAccountConfig`): a dev-account config under `.hardkas/dev-accounts/*.json` that holds `privateKeyRef` and no key material of its own; a config that also carries a key is a finding. `.hardkas/accounts.real.json` is never exempt: a plaintext key there is reported whether `localnet account create` wrote it (no opt-in) or `--unsafe-plaintext` did (the store records no opt-in). The failure keeps `SECURITY_AUDIT_FAILED` (exit 1) and gains a `suggestion` (encrypted accounts: `accounts real generate --password-env <VAR>`, re-import with `accounts real import`). `.key` files stay out of the text search (their permissions are checked). Search paths unchanged (`.hardkas`, `logs`, `artifacts`, `query-store`, `reports`, `runs`, `--include` relative to the workspace); `.env` is still not searched — a decision left open in the investigation (§4). |
| **D3** `env check` | GO (mechanical): the value never appears, human or JSON; only "configured"; the reveal command and the configuration semantics untouched | `cli/src/commands/env.ts`: `HARDKAS_ENV_VARIABLES` entries may carry `secret: true` (only `HARDKAS_DEV_TOKEN` today); `checkEnvironment` reports such a variable with `value: "[REDACTED]"` (`ENV_SECRET_VALUE_MARKER`), `configured: true`, `secret: true`; the human line reads `✅ HARDKAS_DEV_TOKEN=[REDACTED]  (configured; <source>; dev server access token)`. Non-secret variables unchanged. Note for the record: the "explicit reveal" named in the investigation, `dev-server token`, is **not reachable** — `registerDevServerCommands` is imported in `program.ts` and never called (as `dashboard`); the token is readable from `.hardkas/dev-server-token` (mode 0600) and from the dashboard HTML (§5). |
| **D4** ANSI bypass | GO with a change of approach: not escape-tolerant regexes but **one centralised step that removes untrusted escapes before redacting**, so no later sink can rebuild the value | `core/src/security.ts`: `stripAnsi(text)` (exported) removes CSI (`ESC [ … final`), OSC (`ESC ] … BEL \| ST`), the other two-character escapes, the C1 CSI (U+009B) and the textual forms `\u001b[…` / `\x1b[…` that a serialised log carries; `redactPlainText(text, redact)` strips, redacts, and returns the text **as it came when nothing was redacted** (colours kept) or the **redacted, escape-free** text when a secret was found (no reconstruction possible). Both free-text redactions run through it: `redactUrlCredentialsInText` (used by the console guard `installConsoleRedaction`, `output.writeJson` / `writeLine`, `redactSecretFields`, the SDK's recorded RPC errors) and `maskSecrets` (used by `handleError`). No sink changed; the invariant holds for the sinks the investigation inventoried (`kaspa doctor`, `ui.ts` `Endpoint:`, `metamask`, the wizard) and for any future one. Plain text is redacted exactly as before (byte for byte, pinned). |
| **D1** `kaspa wallet create` | contract approved (all networks); **HOLD** until recoverability is settled | not implemented. `D1-WALLET-CREATE-RECOVERABILITY.md`: the key is random, nothing is saved, no mnemonic exists → the printed line is the only copy; proposal **P1** (refuse before generating without `--show-private-key`, pointing to `accounts real generate --password-env` as the encrypted, stored, recoverable path; the flag prints once under the warning; `--json` includes the key only with the flag) vs P2 (`--keystore-out`, not recommended: it duplicates `accounts real generate`). STOP for the reviewer. The BEFORE SS2-B stays red by design. |

Invariants added: **SS2-I1** `security audit` never passes over a plaintext private key, mnemonic or xprv in HardKAS's
own formats, and never echoes one; **SS2-I2** a secret-bearing environment variable is reported configured, never by
value; **SS2-I3** a secret is redacted independently of its presentation: escapes (hostile or not) are removed before
the redaction, and a line that held a secret is returned without them; **SS2-I4** (pending D1) no private key or
mnemonic is printed by default.

## 3 · Files changed

Product:
- `packages/core/src/security.ts` (D4: `stripAnsi`, `redactPlainText`, `maskSecrets` and `redactUrlCredentialsInText`
  through it);
- `packages/cli/src/commands/security.ts` (D2: `findSecretMaterial`, the delimited exemption, findings by name, the
  suggestion);
- `packages/cli/src/commands/env.ts` (D3: `secret` marker, `ENV_SECRET_VALUE_MARKER`, `configured` / `secret` in the
  report, the human line).

Tests:
- `packages/core/test/secret-surface-2.test.ts` — BEFORE (4: plain control, coloured URL, coloured query value, coloured
  key) + AFTER (16: six presentation forms × URL credentials and key shape — CSI, interleaved bold/colour, an escape after
  every character, OSC hyperlink, C1 CSI, the textual `\u001b` form; a coloured line without a secret byte for byte;
  plain text redacted exactly as before; a JSON document whose value carries a coloured URL redacted and still JSON; a
  secret split by escapes is one secret);
- `packages/cli/test/secret-surface-2.test.ts` — BEFORE (9: SS2-A ×4, SS2-B, SS2-C ×2, SS2-D ×2) + AFTER (24: D2 ten
  positives — the store's JSON, compact JSON, a TS object with single quotes, YAML-style `privateKeyHex`, the `.env`
  line in a log, a 12-word mnemonic field, a 24-word `seedPhrase`, a mnemonic variable line, an xprv, `--include`;
  seven negatives — content hashes and txIds, an encrypted keystore, `privateKeyEnv`, the `privateKeyRef` exemption,
  the dev server token file, twelve words of prose, a 63-hex; the exemption delimited; the simnet store not exempt,
  with the way out; `.key` files not searched; D3 the JSON shape, the `.env` source, the token file untouched; SS2-D
  `--json` with colours on).

## 4 · Runs (hermetic runner `before/logs/run-files-wt.ps1`; every run kept under `before/logs` or `after/logs`)

| Run | Files | Result |
| --- | --- | --- |
| `ss2-before-1` | the two test files, BEFORE blocks | **8 red / 5 green**, each red for its row in §1; 0 non-loopback (the doctor's two probes at `127.0.0.1:1`, refused) |
| `build-ss2-after-1` | core + cli (turbo) | 24/24 |
| `ss2-after-1` | the two test files, BEFORE + AFTER | 50/53: SS2-B red (D1 HOLD, by design) + two faults of my new AFTER cases — `--include` given as an absolute path (the option joins its argument onto the workspace root: relative paths only, as it always was; the case now uses a relative path) and a control on `dev-server token`, a command that is not registered (removed; recorded in §2 D3 and §5) |
| `ss2-after-2` | the same, corrected | **52/53**: every BEFORE of A, C and D green; all 40 AFTER cases green; **SS2-B red, by design** (D1 HOLD); 0 non-loopback |
| `ss2-related-1` | core `security`, `evidence-trust-secret-boundary`; artifacts `evidence-diff-redaction`; accounts `wave0-sec1-secret-boundary`, `accounts`; cli `mechanical-papercuts-2026-10-05` (env check), `surface-truth-1b-contract`, `surface-truth-1`, `demo-cut-aud21-no-secrets-in-json`, `accounts-secrets-wave`, `evidence-trust-1`, `evidence-trust-1-contract`, `kaspa-rpc-url`, `help-truth`; dev-server `evidence-trust-1`; sdk `evidence-trust-1` | **189 passed / 0 failed** (16 files, 185 s); 0 non-loopback (the loopback targets 7420 / 8545 / 9 are those tests' own servers and refused ports). Every pinned redaction, secret-boundary, `env check` and AUD-21 behaviour holds with the centralised redaction. |

No full gate was run (the reviewer's order: focused AFTER and related tests only, until D1 is decided). The
pre-existing test side effect (the artifacts suite rewrites `wave1-1-canonical-v5.test.ts.snap` with LF; content
identical) was restored before the manifest.

## 5 · Registered, not fixed here

- **DASHBOARD-TOKEN-EXPOSURE-1** (reviewer, separate security review): `dev-server/src/server.ts:236-249` serves the
  dashboard HTML on `/*` **without the token check**, with `window.__HARDKAS_DEV_TOKEN__ = "<token>"` injected; the
  `/api/*` middleware (`:140-153`) is what the token protects. To examine: who can GET `/` (binding: loopback by
  default, `--unsafe-external` binds 0.0.0.0; Host / Origin checks exist), what the token allows (every `/api/*`
  route, mutations included), the token's lifetime (`HARDKAS_DEV_TOKEN` or random per boot; the file
  `.hardkas/dev-server-token`, 0600 — a mode Windows ignores), and the fact that the CLI's `dev-server` group
  (`start`, `stop`, `token`) is imported and never registered, so there is no CLI reveal and no CLI stop.
- `security audit --include <path>`: relative to the workspace only (an absolute path is joined onto the root and
  silently not searched) — a papercut, not changed.
- `.env` is not searched by the audit although `kaspa wallet create` recommends it as the key's location: decision left
  open (investigation §4 D2).
- `runners/accounts-real-show-runner.ts` is dead code (its masked-by-default display was never wired to a command).
- D1 implementation, after the reviewer's decision (`D1-WALLET-CREATE-RECOVERABILITY.md`).

## 6 · Manifest and tree (partial: D2 + D3 + D4; D1 pending)

Computed from a temporary index (the worktree's own index untouched: `git diff --cached --quiet` = 0), base
**`6ebc5f330`** (develop, EVENT-LEDGER-2 published), code and tests **without this evidence folder** (this ledger cannot
hold the hash of a tree that contains itself; the full tree is reported with the hand-over once the wave closes).

**Code tree: `6ebbb1a992cc19488cc5089a27435cc1ee949563`** — 5 paths (3 modified, 2 added), +537 / −57; patch
`cut47-secret-surface-2/manifest-code-m1/secret-surface-2-partial.patch`, sha256
`3f66a8aa492d854b35b855879d434e579d49990e45c4ecc574877034c10b14e5`:

| Blob | Path |
| --- | --- |
| `5c5248b1` | M `packages/cli/src/commands/env.ts` |
| `80eb328e` | M `packages/cli/src/commands/security.ts` |
| `c1a7d5a6` | A `packages/cli/test/secret-surface-2.test.ts` |
| `1b1eabb5` | M `packages/core/src/security.ts` |
| `bcadb976` | A `packages/core/test/secret-surface-2.test.ts` |

Not touched: EVENT-LEDGER-2's files, `packages/cli/src/runners/kaspa-wallet-runner.ts` and `commands/kaspa.ts` (D1),
every published evidence folder, the owner's checkout, the demo's localnet.

## 7 · Closing round — D1 / P1 implemented, the combined D2+D4 regression, the alternative verified

Reviewer (2026-10-10, round 3): D2, D3, D4 accepted provisionally; **P1 for D1**, with the condition that the encrypted
alternative be verified as a real, registered CLI path producing recoverable material (STOP otherwise); the refusal
must have zero effects, a typed usage error, exit 2 and one error document in JSON mode; the reveal must warn that the
key is neither persisted nor recoverable, print it once, and send it to no telemetry or evidence; add BEFORE/AFTER
coverage for the refusal, the explicit opt-in and the absence of side effects; verify D2/D4 together against
whitespace- and ANSI-obfuscated secrets without echoing values, and that `maskSecrets` leaves normal output alone; then
focused + related tests, **one** full hermetic gate, the manifest, this ledger and the report. No P2, no new keystore
infrastructure, no dashboard changes, no published evidence, no main checkout, no demo, no commits, no versions.

### 7.1 · The condition first: the alternative is real and recoverable (verified before implementing)

Probe on the base build in a throwaway workspace with a hermetic `HARDKAS_HOME` (then the test "the way out the refusal
names is real and recoverable", green in every run of §7.4):

| Step | Result |
| --- | --- |
| `accounts real generate --name vault --network mainnet --password-env HK_SS2_PW --json` | exit 0; `storage: "encrypted-keystore"`, `keystore: ".hardkas/keystore/vault.json"`; the store `.hardkas/accounts.real.json` holds `keystoreRef` and the public key, **no private key** |
| the keystore file | `type: hardkas.encryptedKeystore.v2`, `version: 2.0.0`, `kdf: argon2id`, `cipher: aes-256-gcm`, `metadata.address` = the generated address |
| `accounts real session-open vault --password-env HK_SS2_PW` (registered: `accounts.ts:150`) | exit 0, "Access to account 'vault' verified" — the CLI decrypts it again with the password |
| the same with a wrong password | exit 1, "Invalid password or corrupted keystore." |
| `KeystoreManager.decryptEncryptedKeystore(keystore, password)` in the test, then `new PrivateKey(payload.privateKey).toKeypair().toAddress("mainnet")` (kaspa-wasm) | the payload's address is the generated one, and **the decrypted key derives that address** |
| the key in any output | never (AUD-21 holds: generate, session-open, the wrong-password refusal) |
| `security audit` on that workspace | PASS — the encrypted account is what the auditor accepts (D2) |

So "a stored, encrypted account" is a true description of `accounts real generate --password-env`, on mainnet too
(AUD-20 refuses only plaintext storage there). The refusal and the help may name it.

### 7.2 · D1 / P1 as implemented

`cli/src/commands/kaspa.ts` — `kaspa wallet create <name> [--network <id>] [--show-private-key] [--json]`; help:
"Generate a key pair and print its address and config snippet; the private key is printed once, only with
--show-private-key; nothing is saved. For a stored, encrypted account use 'accounts real generate'" (the `help-truth`
pin "nothing is saved" holds).

`cli/src/runners/kaspa-wallet-runner.ts`:
- `assertWalletKeyOutputChosen(name, {network, showPrivateKey})` runs **first**, before the accounts package is even
  imported: without the flag it throws `HardkasCliError("WALLET_KEY_OUTPUT_REQUIRED", …, { exitCode: USAGE_ERROR })`
  — "kaspa wallet create generates a private key that HardKAS does not store, so where it goes is decided before it is
  created. Nothing was generated." — with the suggestion naming both ways out (`… --show-private-key`, and
  `hardkas accounts real generate --name <name> --network <id> --password-env <VAR>`). No banner, no key, no file; in
  JSON mode the one envelope `{ ok: false, code: "WALLET_KEY_OUTPUT_REQUIRED", message, mode }` (the CLI's error
  envelope, as every typed error), exit 2. Every network; `--json` without the flag refuses the same way.
- With `--show-private-key`: the address, the `hardkas.config.ts` snippet, then the warning block ("The private key
  below is the ONLY copy: HardKAS stores nothing and cannot recover it. Keep it somewhere safe … For a stored, encrypted
  account use 'hardkas accounts real generate …'"), then the `.env` line `<NAME>_PRIVATE_KEY=<key>` — **once**, written
  by the runner only (never through `handleError`, no event is emitted, no evidence is written). With `--json`: the
  warning on stderr, stdout exactly one document `{ ok: true, command: "kaspa wallet create", mode: "cli", result: {
  name, network, address, publicKey, privateKeyEnv, privateKey, persisted: false } }` (the key because the flag asked
  for it: the `includeSecret` pattern of `metamask export`).
- Every print goes through `getOutput()` (human → stdout; JSON mode → stderr), so JSON stdout is exactly one document.
- Nothing else changed: the generator (`crypto.randomBytes(32)`, no mnemonic), the config snippet, the closing line.

Docs: `docs/reference/cli.md` + `cli.generated.json` regenerated (`pnpm docs:generate-cli`; `docs:check-cli` ✓; the
diff is the `wallet create` block only); `apps/docs/docs-data/cli-command-inventory.json` and
`apps/docs/docs/reference/cli/kaspa.md` edited by hand for the same entry, in the generators' own format, because
`apps/docs/scripts/extract-cli.ts` cannot run (§7.6); `docs/concepts/security-model.md` names the reveal flag.

### 7.3 · D2 + D4 together: the combined regression, and one fix it required

The reviewer's combined case — a secret with whitespace around its separator **and** escape sequences interleaved —
was pinned on both sides:
- `core/test/secret-surface-2.test.ts` ("combined"): `maskSecrets` / `redactUrlCredentialsInText` over a secret-named
  field with spaces and a tab around the colon and the value split by bold/colour; the `.env` line with spaces around
  `=` and an escape after every character; a URL with tabs and space runs and the password split; a mnemonic field
  with mixed whitespace and colours; a serialised document value in the textual `\u001b` form — every one redacted and
  escape-free; and **normal coloured output byte for byte** (an address with amounts, a public query `?page=2&limit=50`,
  a 63-hex). Green already in the BEFORE run (D4's strip-then-redact covers them); kept as the regression.
- `cli/test/secret-surface-2.test.ts` ("D2 + D4"): the same families **in files the auditor searches** — a captured
  coloured console line in `logs/`, the `.env` line with spaces and colours in `runs/`, a serialised log with the
  textual `\u001b` form around a mnemonic in `reports/`, a key with an escape after every character and tabs around the
  separator under `.hardkas/` — human and `--json`, each finding naming file and field, the value never echoed (nor any
  12-character fragment of it), no escape sequence in the report; and a coloured log **without** a secret (a txId under
  its name, an address, amounts) passing.
  **Red in the BEFORE run (`ss2-d1-before-1`): the auditor searched the raw file text**, so a coloured capture hid the
  material from D2's patterns exactly as it hid it from the redaction. Fix, in D4's own terms: `findSecretMaterial`
  searches `stripAnsi(content)` (`cli/src/commands/security.ts`; `stripAnsi` now exported from `@hardkas/core`), the
  one way every search for secrets sees a text. Findings still name file, kind and field only.

### 7.4 · Runs (hermetic runner; every run kept under `after/logs`)

| Run | Files | Result |
| --- | --- | --- |
| `ss2-d1-before-1` | the three SS-2 test files, against the D2/D3/D4 build (D1 not implemented) | **60 / 79, 19 red** — all expected: SS2-B (now pinning the P1 contract), the nine D1 AFTER cases (3 refusals, the JSON refusal, 3 opt-ins, the JSON opt-in, the help), the five unit cases of `secret-surface-2-wallet-create.test.ts`, and the four "finds" of D2 + D4 (§7.3). Green: the recoverability test (§7.1), the coloured no-secret control, the 26 core cases. 0 non-loopback |
| `build-ss2-after-2` | turbo `build` (core + cli; their dependents rebuilt too) | 24 / 24 |
| `ss2-after-3` | the three files, after D1 + the §7.3 fix | **76 / 79**: every D1 case green (process level and unit), SS2-B green, the recoverability test green; 3 red = the D2 + D4 "finds" cases **in `--json` mode only** — a fault of the test, not of the product: the report's quotes around the field name are escaped inside the JSON text (`field \"privateKey\"`), so the regex written for the human report did not match the raw envelope. Kept; the test now decodes the envelope's `message` before matching |
| `ss2-related-2` | the sixteen files of `ss2-related-1` (redaction, secret boundary, `env check`, AUD-21, surface truth incl. the docs generator, `help-truth`, accounts, evidence-trust CLI/SDK/dev-server) | **189 / 189**, gate-hermetic PASS; 0 non-loopback (loopback targets: those tests' own servers and refused ports — 7420, 8545, 9, and one ephemeral 49602 of the dev-server test) |
| `ss2-after-4` | the three files, corrected test | **79 / 79**, gate-hermetic PASS; 0 non-loopback (the doctor's `127.0.0.1:1` probes of SS2-D). Final focused state: BEFORE 14 (A ×4, B, C ×2, D ×3 — all green now), AFTER 34 in the CLI file (D2 ×20, D3 ×3, D1 ×10, D2+D4 ×5), 5 unit, 26 core |
| `ss2-gate-1` | the **one** full hermetic gate (`scripts/gate-hermetic.mjs`, private copy of the v2.1.0 home, Docker unreachable, non-loopback denied), on the final tree | **PASS — 2866 tests: 2838 passed, 0 failed, 28 skipped (the fixed skips); 454 test files (447 passed, 7 skipped); 1359 s; 0 non-loopback attempts** (loopback targets: the tests' own servers and refused ports — 7420, 8545, 9, three ephemeral). `C:\.hardkas` absent before and after. The published base's gate was 2785 / 2757 / 0 / 28: +81 tests, the 79 of this wave among them |

### 7.5 · Invariants (final)

SS2-I1 (audit never passes over plaintext key material in HardKAS's formats and never echoes it) now also holds for
material hidden behind escape sequences; SS2-I2 (secret-bearing environment variable reported configured, never by
value); SS2-I3 (redaction independent of presentation); **SS2-I4 — no private key or mnemonic is printed by default:
`kaspa wallet create` refuses before generating unless `--show-private-key` is given, and then prints the key once,
under the warning, to the terminal only.**

### 7.6 · Registered on the way (not fixed here)

- `apps/docs/scripts/extract-cli.ts` imports `../../packages/cli/src/program.js` (one `..` short from
  `apps/docs/scripts/`): it cannot run, so `apps/docs/docs-data/cli-command-inventory.json` is never regenerated by it;
  `build-cli-reference.ts`, run on the committed inventory, rewrites 20 pages of `apps/docs/docs/reference/cli/` (their
  curated semantics drifted) — restored here, untouched. Ticket to register: APPS-DOCS-CLI-EXTRACTOR-1.
- The CLI error envelope carries `code` and `message`, not the suggestion: a JSON consumer of the refusal gets the code
  and the exit status, the two ways out only in the human rendering (the envelope's contract since
  CLI-RUNTIME-CONTRACT-1; unchanged).
- §5's items stand: DASHBOARD-TOKEN-EXPOSURE-1, `--include` relative-only, `.env` not searched, the dead
  `accounts-real-show-runner.ts`; plus the unregistered `dev-server` / `dashboard` groups (recorded, not revived).
- The turbo build of the dependents rewrote the committed native binary
  `packages/pskt-native/hardkas-pskt-native.win32-x64-msvc.node` (same size; the build output is committed — a known
  repository debt): restored to HEAD before the manifest; not part of this wave.

### 7.7 · Hygiene of this folder's logs

The pre-fix command printed a private key, and a failing assertion quotes the command's output: the BEFORE logs of
rounds 1–3 (`before/logs/ss2-before-1.log`, `after/logs/ss2-after-1.log`, `after/logs/ss2-after-2.log`,
`closeout/logs/ss2-d1-before-1.{log,json}`) therefore carried 15 occurrences of throwaway keys — random, generated in
temporary workspaces, never funded, never used. In the copies kept here each such value is replaced by
`<64hex-redacted>` (file encodings preserved; nothing else changed; the scratch originals exist only on the machine
that ran them). The only 64-hex values left in this folder are the tests' fixed constants (`ab…`, `a1b2…`, `cd…`), the
patch digests and the content of this ledger. The product never printed one of them after the fix (§7.4).

## 8 · Final manifest and trees

Computed from a temporary index (the worktree's own index untouched: `git diff --cached --quiet` = 0), base
**`6ebc5f330`** (develop, HEAD tree `24e24974`). The native binary turbo rewrote (§7.6) was restored before this.

**Code tree (code, tests and docs — this evidence folder excluded): `7df761ad811754e5eb48e995db7fd8eda2f0f869`** —
14 paths (11 modified, 3 added), +1033 / −94; code-only patch
`cut47-secret-surface-2/manifest-code-m2/secret-surface-2-code.patch`, sha256
`b61c523f48ebd7f4d597880c6f9917b697c0e45448e1a80e4b3387973e340249` (the diff the reviewer reviews):

| Blob | Path |
| --- | --- |
| `de0ea622` | M `apps/docs/docs-data/cli-command-inventory.json` |
| `9cf0b1d5` | M `apps/docs/docs/reference/cli/kaspa.md` |
| `accfe141` | M `docs/concepts/security-model.md` |
| `2e7c879b` | M `docs/reference/cli.generated.json` |
| `9cf08690` | M `docs/reference/cli.md` |
| `5c5248b1` | M `packages/cli/src/commands/env.ts` (D3, unchanged since round 2) |
| `20f90f0c` | M `packages/cli/src/commands/kaspa.ts` (D1) |
| `3ceebda3` | M `packages/cli/src/commands/security.ts` (D2 + the §7.3 strip) |
| `82e2d296` | M `packages/cli/src/runners/kaspa-wallet-runner.ts` (D1) |
| `f1a97df0` | A `packages/cli/test/secret-surface-2-wallet-create.test.ts` |
| `2570d5d0` | A `packages/cli/test/secret-surface-2.test.ts` |
| `63644413` | M `packages/core/src/index.ts` (`stripAnsi` exported) |
| `1b1eabb5` | M `packages/core/src/security.ts` (D4, unchanged since round 2) |
| `7d3817bc` | A `packages/core/test/secret-surface-2.test.ts` |

**Full tree** (everything: code, tests, docs, this folder with its `MANIFEST.sha256`): this ledger cannot hold the
hash of a tree that contains itself, so the full tree hash, the full patch
(`cut47-secret-surface-2/manifest-final-m2/secret-surface-2.patch`, applied with `git apply --binary`) and its sha256
are reported in the hand-over and in `manifest-final-m2/tree.txt`; `MANIFEST.sha256` lists every file of this folder
but itself (raw sha256 as written here; under `core.autocrlf` a checkout may show CRLF differences in text files — the
git blobs are what the trees compare).

Not touched: EVENT-LEDGER-2's files, the dashboard and dev-server packages, every published evidence folder, the
owner's checkout, the demo's localnet, versions. No commit, no push.
