# SECRET-SURFACE-2 · investigation + BEFORE (2026-10-10)

**Base:** develop `6ebc5f330` (EVENT-LEDGER-2 published; tree `24e24974`), in the isolated worktree `%TEMP%\hk-ra\wt`
(detached, clean; its build matches the base). The owner's checkout was not touched.

**Mandate (reviewer, 2026-10-10):** investigation and BEFORE only. In scope: MAINNET-KEY-PRINT and SECURITY-AUDIT-BLIND
(the two 🟠 of MINI-REAUDIT-1 left in this family); reviewed without automatic scope growth: the escapes of
`HARDKAS_DEV_TOKEN` and URL credentials under ANSI sequences. Policy preference stated: private keys are not shown by
default; an explicit, controlled reveal / export; backups stay possible. **Nothing was implemented**: no product file
changed; the two test files and this folder are the only additions (untracked).

**Runtime:** hermetic runner (`before/logs/run-files-wt.ps1`: the gate's `HARDKAS_HOME` copy, Docker unreachable, no
network beyond loopback). `ss2-before-1`: **8 red / 5 green controls**, 0 non-loopback attempts; the only loopback
targets were the two probes of `kaspa doctor` at `127.0.0.1:1` (refused by the OS, as intended).

## 1 · Findings, each with its runtime evidence

| # | Surface | What happens today (runtime, `ss2-before-1`) | Cause (code) |
| --- | --- | --- | --- |
| **SS2-A** SECURITY-AUDIT-BLIND | `localnet account create bob` writes `"privateKey": "<64 hex>"` into `.hardkas/accounts.real.json`, with no opt-in, no confirmation and `securityModel: "localnet-plaintext"` in its output; `hardkas security audit` then answers **PASS, exit 0** ("Security audit passed"). A planted `.hardkas/notes.json` holding a 12-word `mnemonic` passes too. The create command itself prints no key (good). | `cli/src/commands/security.ts:64`: `/(?:privateKey\|mnemonic\|seed)["'\\s:=]+(…)/` is a regex **literal**, so `\\s` is a backslash followed by an "s", not whitespace: the class matches `"`, `'`, `\`, `s`, `:`, `=` and never a space. The format HardKAS writes (`"privateKey": "…"`, a space after the colon) never matches; the mnemonic branch `(?:[a-zA-Z]+\\s+){11}` needs a literal `\s` between words, so no real phrase matches. `xprv…` matching works. The store write: `runners/localnet-account-runners.ts:12-19` (`importRealDevAccount` with the plaintext key). |
| **SS2-B** MAINNET-KEY-PRINT | `kaspa wallet create vault --network mainnet` prints, on stdout, `VAULT_PRIVATE_KEY=<64 hex>` (exit 0). There is no `--json`, no flag, no confirmation; the help says "Generate a key pair and print it (…); nothing is saved". | `runners/kaspa-wallet-runner.ts:42` prints `wallet.privateKey` in clear (uncoloured, so the shape mask would not apply either: this line goes through `console.log` → the console guard, which only redacts URL credentials). `createLocalKaspaWallet` → `KaspaSdkKeyGenerator.generateAccount()` returns `{address, publicKey?, privateKey, mnemonic?}`; the optional mnemonic is neither shown nor offered as a backup. The 2026-10-07 decision ("a mainnet key is not printed by default") is not implemented. |
| **SS2-C** HARDKAS_DEV_TOKEN | `env check` with `HARDKAS_DEV_TOKEN` set prints the whole token, in human (`✅ HARDKAS_DEV_TOKEN=<token>`) and in `--json` (`result.known[].value`). | `cli/src/commands/env.ts:115` prints every known variable's value; `checkEnvironment` (`:69-74`) copies the raw value for all of them; the variable list (`:12-37`) carries no "secret" marker. The other token surfaces are by design or already guarded: startup never prints it (`up-runner.ts:101`, `dev-env-runner.ts:70`: `showToken:false`); `dev-server token` is the explicit reveal; the token file `.hardkas/dev-server-token` is written with mode 0600 (`dev-server-runner.ts:80`; Windows ignores the mode); the access log redacts `?token=` (ET-C5). |
| **SS2-D** ANSI bypass | With colours on — picocolors turns them on in **every win32 process** unless `NO_COLOR` is set — `kaspa doctor --rpc-url http://user:s3cretpw@127.0.0.1:1/` prints the password in the recommendation line. With `NO_COLOR` the same line is redacted (control, green). At unit level: `redactUrlCredentialsInText("\x1b[37mhttp://user:pw@h/\x1b[39m")` keeps `pw`; `maskSecrets("\x1b[37m<64 hex>\x1b[39m")` keeps the key. A coloured `?token=…` **is** redacted (green): that second pass has no `\b`. | `runners/kaspa-doctor-runner.ts:154` colours the URL (`pc.white(options.rpcUrl)`) before `console.log`; the console guard (`cli/src/output.ts:96-105`) redacts string arguments with `redactUrlCredentialsInText`, whose URL regex starts with `\b` (`core/src/security.ts:178`); there is no word boundary between the `m` that ends an escape sequence and the `h` of `http`, so the URL is not seen. `maskSecrets`' key mask (`core/src/security.ts:17`) is `\b[0-9a-fA-F]{64}\b`: same bypass. |

Every red fails for the reason its row states (`before/logs/ss2-before-1.json`). The five controls hold: a clean workspace passes
the audit; the documented `privateKeyRef` exemption of dev-account configs holds; `kaspa doctor` with colours off is
redacted; a plain URL and a plain key are redacted; a coloured secret-named query value is redacted.

## 2 · Inventory of the related sinks (read-only; nothing exercised beyond §1)

Coloured values that reach the console guard (the ANSI bypass applies to each, when the value is a URL with userinfo or
a 64-hex key):
- `cli/src/ui.ts:364` — `Endpoint: ${pc.white(ctx.endpoint)}` in `handleError`'s context block (a credentialed RPC URL
  in an error context would print its userinfo);
- `cli/src/runners/kaspa-doctor-runner.ts:154` (SS2-D, proven);
- `cli/src/runners/metamask-runner.ts:48` (`rpcUrls[0]`), `:164` (the key, under `--show-private-key`: an explicit
  reveal, by design);
- `cli/src/runners/dev-accounts-runners.ts:98`, `:170` (`dev accounts reveal` / `export kasware`: explicit reveals,
  simnet / simulated only, by design);
- `cli/src/runners/local-wizard-runner.ts:124` (prints a freshly generated EVM key for the Igra lab: the static finding
  of MINI-REAUDIT-1, not exercised).

Dev token surfaces: `dev-server/src/server.ts:78-79` (token from `HARDKAS_DEV_TOKEN` or 32 random bytes), `:140-153`
(`/api/*` requires it: bearer header or `?token=`), `:236-249` (**the dashboard HTML is served to any request on `/*`,
without the token check, with `window.__HARDKAS_DEV_TOKEN__ = "<token>"` injected**: the SPA's bootstrap, so anyone
who can GET `/` on the bound interface holds the token — loopback by default, Host/Origin checks exist; a design
observation, outside this wave's scope), `cli/src/runners/dev-server-runner.ts:77-80` (token file), `:221-232`
(`dev-server token`, the explicit reveal, human and `--json`).

Key-generating / key-handling commands and what each prints:
- `accounts real generate`: encrypted keystore by default (`--password-env` / `--password-stdin`); plaintext only with
  `--unsafe-plaintext` + confirmation or `--yes`; **AUD-20** refuses plaintext for mainnet (`PLAINTEXT_MAINNET_FORBIDDEN`,
  `accounts-real-generate-runner.ts:41-49`); **AUD-21**: human prints `Private: yes (masked)`, `--json` never the key
  (`cli/test/demo-cut-aud21-no-secrets-in-json.test.ts`).
- `localnet account create`: plaintext store, simnet keys, no opt-in (SS2-A's subject; MINI-REAUDIT-1 named the missing
  `--unsafe-plaintext` / confirmation as part of the finding).
- `kaspa wallet create`: prints the key, saves nothing (SS2-B).
- `kaspa wallet list --json`: `redactSecretFields(…, "drop")` (D9) — no key.
- `metamask export`: `--show-private-key` reveals; otherwise "Run with --show-private-key to reveal" (the one existing
  reveal flag of the CLI).
- `dev accounts reveal <alias>` / `dev accounts export kasware <alias>`: simnet / simulated only; otherwise typed
  refusals (`DEV_REVEAL_NOT_ALLOWED`, `DEV_EXPORT_NOT_ALLOWED`, exit POLICY_DENIED).
- `runners/accounts-real-show-runner.ts` masks the key by default (`showPrivate` option) — **dead code**: no command
  references it.

## 3 · What the audit would have to recognise (HardKAS's own formats)

- `.hardkas/accounts.real.json`: `"privateKey": "<64 hex>"` (plaintext accounts: `localnet account create`,
  `accounts real generate --unsafe-plaintext`, `accounts real import --unsafe-plaintext`).
- `.hardkas/dev-accounts/*.json`: `privateKeyRef` only (exempt) — a dev-account JSON that carries `"privateKey":` is a
  leak (the exemption already says so);
- `.hardkas/dev-accounts/keys/*.key` (ignored by extension; the permission check covers them).
- Mnemonics: 12 / 24 lower-case words, as a JSON string value or free text.
- `xprv…` (works today).
- `.env`-style `<NAME>_PRIVATE_KEY=<64 hex>`: the format `kaspa wallet create` itself tells the user to write into
  `.env` — **`.env` is not among the searched paths** (`.hardkas`, `logs`, `artifacts`, `query-store`, `reports`,
  `runs`, plus `--include`). Whether the designated `.env` location should be audited is a decision (below).

## 4 · Decisions for the reviewer (the contract), with options

**D1 · The reveal / export contract of `kaspa wallet create`** (SS2-B). Today the command's only output of the key is
the printed line, and it saves nothing; if the key is neither printed nor saved the wallet is unusable, so "not by
default" needs one explicit path. Options:
- **R1 (minimal, mainnet only — the 2026-10-07 decision as stated):** on `--network mainnet` the key is not printed;
  `--show-private-key` (the existing flag name of `metamask export`) prints it with the loud warning, and `--json`
  includes it only with that flag (the `includeSecret` pattern). simnet / testnet-10 keep printing by default.
- **R2 (consistent with AUD-21, all networks):** the same contract on every network: never printed by default,
  `--show-private-key` to reveal. A behaviour change for simnet users (the help "print it" changes; `help-truth`
  pins "nothing is saved", not the printing).
- **Backup, either option:** `--keystore-out <file> --password-env <VAR>` (or `--password-stdin`) writes an **encrypted**
  keystore through `KeystoreManager` — the export path that keeps a backup possible without plaintext; for mainnet,
  plaintext export is refused as AUD-20 already refuses plaintext storage. Optionally surface the generator's
  `mnemonic` under the same flag (today it is dropped). Recommendation: **R2 + backup**; R1 if the simnet
  convenience must stay.

**D2 · The audit** (SS2-A). Fix the regex to real whitespace and HardKAS's formats (§3), with a test per format, and:
- **A1:** plaintext keys anywhere in the searched paths fail the audit — including the designated plaintext store
  `.hardkas/accounts.real.json`. Consequence: every workspace with a `localnet account create` or an
  `--unsafe-plaintext` account fails `security audit` until those accounts are moved to a keystore. Simple, and it is
  what the BEFORE test SS2-A currently pins (**provisional**: adjust the expectation if A2 is chosen).
- **A2:** the audit distinguishes the designated store from a leak: a plaintext simnet account in
  `.hardkas/accounts.real.json` is reported as a **warning** ("plaintext dev account(s): bob — simnet only"), keys
  anywhere else (logs, artifacts, reports, a non-simnet address in the store) fail. Truthful and does not break the
  simnet workflow.
- Either way: should `.env` (the location `kaspa wallet create` recommends) be searched? Recommendation: report it
  separately ("a key in .env: make sure it is git-ignored") rather than fail, or leave it out and say so in the help.
- **`localnet account create` itself:** keep it plaintext-by-design for simnet (its output already says
  `localnet-plaintext`) **plus** a one-line warning, or require `--unsafe-plaintext` like `accounts real generate`.
  Recommendation: the warning only (simnet dev keys), and never for a non-simnet address (it is hard-wired to simnet
  today: `localnet-account-runners.ts:6-7`).

**D3 · `env check` and the token** (SS2-C). Mark the secret-bearing variables in `HARDKAS_ENV_VARIABLES` (today only
`HARDKAS_DEV_TOKEN`) and print them as set without the value: human `✅ HARDKAS_DEV_TOKEN=(set, hidden)`, JSON
`value: "[REDACTED]"` (the existing marker of `redactSecretFields`) or `secret: true` without `value`. The explicit
reveal stays `dev-server token`. Small; recommendation: do it in this wave.

**D4 · The ANSI bypass** (SS2-D). Three places share the cause (`\b` after an escape sequence): the URL regex of
`redactUrlCredentialsInText`, the key mask of `maskSecrets`, and — structurally — the console guard that feeds them
coloured strings. Options:
- **N1:** make the two regexes escape-aware: replace `\b` with `(?<![A-Za-z0-9])` lookbehinds that also accept the end
  of an escape sequence, i.e. anchor on `(?:^|[^A-Za-z0-9]|\x1b\[[0-9;]*m)`; Node supports lookbehind. Keeps the
  sinks as they are.
- **N2:** the console guard strips the escape sequences from each string argument, redacts, and re-applies nothing
  (loses colour on redacted lines only) — simpler, but changes output in the redaction case.
- **N3:** redact at the sinks before colouring (`pc.white(redactUrlCredentials(url))`) — needs every sink found
  (§2 lists them) and does not protect future ones.
  Recommendation: **N1** (one place, covers unknown sinks), plus a test with the coloured forms (the BEFORE tests
  already do). Note for the record: the `?token=` query redaction is already escape-proof.

**D5 · Out of scope, named so they are not lost:** the unauthenticated dashboard HTML with the embedded token (SPA
design); the local wizard's EVM key print; the REPL history in plaintext; the raw-error sinks of MINI-REAUDIT-1's
static map (workflow artifact, scenario results, dev-server error bodies, the non-CLI logger) — all conditional on a
credentialed RPC URL plus a failure, none exercised here.

## 5 · The BEFORE tests and what each pins

`packages/core/test/secret-surface-2.test.ts` (unit; 4 cases: 2 red, 2 green) and
`packages/cli/test/secret-surface-2.test.ts` (the built CLI in temporary workspaces; 9 cases: 6 red, 3 green). Copies
in `before/tests/`. Expectations pinned, and which are provisional:
- SS2-A: the audit **fails** on the plaintext key of `localnet account create`, naming the file, and never echoes the
  key; it fails on a plaintext mnemonic; a clean workspace and the `privateKeyRef` exemption pass. **Provisional:** if
  D2 = A2 the first expectation becomes "reports the plaintext dev account as a warning", not a failure.
- SS2-B: `--network mainnet` prints the address and the config snippet and **no 64-hex value** (only the decided
  minimum; R1 and R2 both satisfy it; the reveal flag and the backup path get their own tests once decided).
- SS2-C: `env check` names `HARDKAS_DEV_TOKEN` as set and prints its value nowhere, human and JSON.
- SS2-D: with colours on, `kaspa doctor` prints no password; at unit level the coloured userinfo and the coloured key
  are redacted. Controls: colours off, plain values, coloured query value.

## 6 · Files

- `before/INVESTIGATION.md` (this file), `before/tests/{core,cli}-secret-surface-2.test.ts`,
  `before/logs/ss2-before-1.{log,json,exit,head,status}`, `before/logs/run-files-wt.ps1`.
- Scratch: `cut47-secret-surface-2/` (the runners; the same logs).
- No product file changed; no commit, push or version.
