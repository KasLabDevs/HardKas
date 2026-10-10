# SECRET-SURFACE-2 · D1 — `kaspa wallet create`: recoverability today, and the minimal contract (DESIGN HOLD → P1 implemented)

**Status (2026-10-10, closing round):** the reviewer chose **P1** ("GO D1/P1 + FINAL QUALIFICATION") with one
condition — verify that the encrypted alternative is a real, registered CLI path producing recoverable material — and
P1 is implemented as proposed in §3 (`cli/src/commands/kaspa.ts`, `cli/src/runners/kaspa-wallet-runner.ts`). The
answers to §5 and the verification of the condition are in `LEDGER.md` §7. Sections 1–4 below are the design as it was
submitted (kept as written; the JSON shape of §3 became `{ ok, command, mode, result: { name, network, address,
publicKey, privateKeyEnv, privateKey, persisted: false } }`, the envelope every other command uses).

## 1 · What the command does today, and whether the key can be recovered later

Chain (base `6ebc5f330`):
- `cli/src/commands/kaspa.ts:18-25` — `kaspa wallet create <name> --network <id>` (default `simnet`), no `--json`,
  no other option; help: "Generate a key pair and print it (address, config snippet and private key); nothing is saved".
- `cli/src/runners/kaspa-wallet-runner.ts:8-48` — `createLocalKaspaWallet({networkId})`, then prints the address, a
  `hardkas.config.ts` snippet (`kind: "kaspa-private-key"`, `privateKeyEnv: "<NAME>_PRIVATE_KEY"`) and the line
  `<NAME>_PRIVATE_KEY=<private key>` "to set in `.env`". **Nothing is written anywhere** ("HardKAS never auto-writes
  secrets for your protection").
- `accounts/src/kaspa-wallet.ts:12-20` → `accounts/src/kaspa-sdk-keygen.ts:44-73` — the key is
  **`crypto.randomBytes(32)`** turned into a kaspa-wasm `PrivateKey`; the result is `{address, publicKey, privateKey}`.
  The interface's optional `mnemonic` (`real-keygen.ts:5`) is **never produced** by this generator: there is no seed
  phrase to derive the key from again.

**Answer: the key is recoverable only from the printed line.** No file, no keystore, no mnemonic, no store entry. If
the line is hidden by default and nothing replaces it, the command would create a key that is lost the moment it is
created (an address with no spendable key). That is why the default cannot change on its own.

## 2 · What already exists and can be reused (no new storage, no new cryptography)

- `accounts real generate --name <n> --network <simnet|testnet-10|mainnet> --password-env <VAR> | --password-stdin`
  generates a key, writes an **encrypted keystore** (`KeystoreManager.createEncryptedKeystore` /
  `saveEncryptedKeystore`, format `hardkas.encryptedKeystore.v2`, argon2 parameters) under `.hardkas/keystore/`, and
  registers the account in `.hardkas/accounts.real.json` with a `keystoreRef`; it never prints the key (AUD-21) and
  refuses plaintext storage for mainnet (AUD-20). This is already the "stored, encrypted, recoverable with the
  password" path for every network — the help of `kaspa wallet create` itself points to it ("For stored dev accounts
  use 'accounts real generate'").
- `metamask export --show-private-key` — the one existing opt-in reveal flag of the CLI (name and semantics to reuse).
- `dev accounts reveal` / `dev accounts export kasware` — reveals restricted to simnet / simulated, typed refusals
  otherwise (precedent for "reveal is a policy decision, not a default").

## 3 · The minimal contract (proposal P1, recommended)

`kaspa wallet create` keeps its one job — generate and hand the key to the user without storing anything — but the
hand-over becomes an explicit choice, decided **before** anything is generated:

| Invocation | Behaviour |
| --- | --- |
| `kaspa wallet create <name> [--network <id>]` (no flag) | **Refused before generating**, typed `WALLET_KEY_OUTPUT_REQUIRED` (exit USAGE_ERROR): "A new private key must go somewhere you choose: add `--show-private-key` to print it once (you store it), or use `hardkas accounts real generate --name <name> --network <id> --password-env <VAR>` for an encrypted keystore. Nothing was generated." Nothing is created, so nothing can be lost. |
| `… --show-private-key` | Generates; prints the address, the config snippet and the `.env` line exactly as today, under the warning block (red, "this is the only copy; HardKAS stores nothing"). Every network, mainnet included (the user asked for it explicitly; AUD-20 forbids plaintext *storage*, not a requested display). |
| `… --json` (with `--show-private-key`) | `{ name, address, network, privateKeyEnv, output: "shown", privateKey }` — the key only because the flag asked for it (the `includeSecret` pattern of `metamask export`); without the flag `--json` is refused like the human mode. |

What it does **not** add: no `--keystore-out` on `wallet create` (that would duplicate `accounts real generate`), no
plaintext file, no new store, no new cryptography. The mnemonic question is moot (none is generated).

Consequences to decide with it:
- The help text changes ("print it" → "prints the address; the private key only with `--show-private-key`"), and the
  `help-truth` pin ("nothing is saved") stays true.
- Scripts that relied on the default printing break loudly (a typed refusal), never silently.
- Tests once approved: refusal without the flag (exit 2, no key anywhere, nothing generated), reveal with the flag on
  simnet / testnet-10 / mainnet (the key printed once, under the warning), `--json` shapes, the help and the docs
  (`apps/docs` reference of `kaspa wallet create`).

## 4 · Alternative (P2): `--keystore-out <file>` on `wallet create`

The same refusal without a flag, plus `--keystore-out <file> --password-env <VAR> | --password-stdin` writing an
encrypted keystore (reusing `KeystoreManager`) and printing the address and the path. Recoverable with the password;
no account registered (the user keeps a file). More code, a second keystore-writing path to keep aligned with
`accounts real generate`, and a file outside the containment rules of CONTAINMENT-2 unless it is confined to the
workspace keystore directory — at which point it is `accounts real generate` again. Not recommended.

## 5 · What the reviewer was asked to decide — and decided (2026-10-10)

1. P1 (refusal + `--show-private-key`, pointing to `accounts real generate` for the encrypted path) — recommended — or P2.
   **Decided: P1.** No P2, no new keystore infrastructure, no mnemonic ("that generator does not provide a recoverable
   one"); the refusal must have zero effects ("not even random material that is then lost"), a typed usage error, exit
   2, and exactly one error document in JSON mode, with no secret in it.
2. Whether `--show-private-key` on mainnet needs an additional `--yes` (a second explicit step), or the flag alone is the
   conscious opt-in. Recommendation: the flag alone; it names what it does.
   **Decided: the flag alone** (the reviewer's contract table: `--show-private-key` "generates and reveals the key
   explicitly"; no second step asked for), with a warning that the key is not persisted nor recoverable by HardKAS,
   printed once, never sent to telemetry or evidence.
3. Whether `--json` without the flag should refuse (recommended) or answer with the address only (a wallet without a
   reachable key, which is the situation this design exists to prevent).
   **Decided: refuse** ("one JSON document in JSON mode" for the refusal). With the flag, `--json` carries the key in
   its one document, once, as proposed in §3 (the `includeSecret` pattern of `metamask export`).

Condition attached to the GO: "verify that `accounts real generate --password-env` is a real, registered CLI path
producing recoverable encrypted material before recommending it; STOP if that assumption fails." Verified — see
`LEDGER.md` §7 (the probe and the test "the way out the refusal names is real and recoverable").
