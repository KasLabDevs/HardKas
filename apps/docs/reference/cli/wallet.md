---
title: hardkas wallet
---

# `hardkas wallet`

## `hardkas wallet hd create`

### Synopsis (Generated)

**Purpose:** Create a wallet with a new random recovery phrase, encrypted under its password (the phrase is not printed: back it up with 'wallet hd reveal') experimental

#### Options

- `--name &lt;name&gt;`: Wallet name: 1 to 64 letters, digits, _ and -
- `--network &lt;network&gt;`: Network the wallet is declared on: a network id (simnet, devnet, testnet-&lt;n&gt;) or a workspace network entry (default: the workspace's network, else simnet). Mainnet, in any spelling or through a config alias, is refused: MAINNET_SIGNING_DISABLED, nothing is generated
- `--words &lt;count&gt;`: Recovery phrase length: 12 or 24 (default 24)
- `--password-env &lt;env&gt;`: Read the wallet password from this environment variable
- `--password-stdin` (Default: `false`): Read the wallet password from stdin
- `--passphrase-env &lt;env&gt;`: Read the wallet's BIP39 passphrase (the optional "25th word") from this environment variable; never stored
- `--json` (Default: `false`): Output as JSON

---

## `hardkas wallet hd import`

### Synopsis (Generated)

**Purpose:** Recover a wallet from its BIP39 recovery phrase (12 or 24 English words) and, if it had one, its passphrase experimental

#### Options

- `--name &lt;name&gt;`: Wallet name: 1 to 64 letters, digits, _ and -
- `--network &lt;network&gt;`: Network the wallet is declared on (as for create). Mainnet is refused: MAINNET_SIGNING_DISABLED, nothing is read or written
- `--mnemonic-env &lt;env&gt;`: Read the recovery phrase from this environment variable
- `--mnemonic-stdin` (Default: `false`): Read the recovery phrase from stdin (then the password must come from --password-env)
- `--password-env &lt;env&gt;`: Read the wallet password from this environment variable
- `--password-stdin` (Default: `false`): Read the wallet password from stdin
- `--passphrase-env &lt;env&gt;`: Read the wallet's BIP39 passphrase (the optional "25th word") from this environment variable; never stored
- `--json` (Default: `false`): Output as JSON

---

## `hardkas wallet hd import-watch-only`

### Synopsis (Generated)

**Purpose:** Add a watch-only wallet from an account's extended public key (kpub/ktub of m/44'/111111'/&lt;account&gt;'): addresses and balance, no keys, nothing to sign with experimental

#### Options

- `--name &lt;name&gt;`: Wallet name: 1 to 64 letters, digits, _ and -
- `--xpub &lt;kpub&gt;`: The account-level extended public key (a master key is refused: HD_WALLET_XPUB_INVALID)
- `--network &lt;network&gt;`: Network the wallet is declared on (as for create). Mainnet is refused: MAINNET_CONNECTION_DISABLED
- `--json` (Default: `false`): Output as JSON

---

## `hardkas wallet hd list`

### Synopsis (Generated)

**Purpose:** List the workspace's HD wallets (public header only; nothing is decrypted) experimental

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas wallet hd address`

### Synopsis (Generated)

**Purpose:** Show a receive (or --change) address. Without --index: the next unused one, and the wallet's index advances. An HD wallet is opened with its password first, so the address comes from its authenticated keys experimental

#### Arguments

- `&lt;wallet&gt;` (Required): 

#### Options

- `--change` (Default: `false`): A change address instead of a receive address
- `--index &lt;n&gt;`: This address index (the wallet's index does not move)
- `--account &lt;n&gt;`: Account index (default 0)
- `--password-env &lt;env&gt;`: Read the wallet password from this environment variable
- `--password-stdin` (Default: `false`): Read the wallet password from stdin
- `--passphrase-env &lt;env&gt;`: Read the wallet's BIP39 passphrase (the optional "25th word") from this environment variable; never stored
- `--json` (Default: `false`): Output as JSON

---

## `hardkas wallet hd balance`

### Synopsis (Generated)

**Purpose:** Scan the wallet's receive and change addresses on the node (gap limit) and show what they hold: every address the wallet's index handed out (zero where emptied) and any funded one past it. Mainnet is refused: MAINNET_CONNECTION_DISABLED experimental

#### Arguments

- `&lt;wallet&gt;` (Required): 

#### Options

- `--network &lt;network&gt;`: The workspace network to read (default: the workspace's): it must be the wallet's
- `--gap-limit &lt;n&gt;`: Consecutive unused addresses per chain before the scan stops (default 20)
- `--account &lt;n&gt;`: Account index (default 0)
- `--password-env &lt;env&gt;`: Read the wallet password from this environment variable (optional: the scan then uses the authenticated keys; without it the result says verified: false)
- `--password-stdin` (Default: `false`): Read the wallet password from stdin
- `--passphrase-env &lt;env&gt;`: Read the wallet's BIP39 passphrase (the optional "25th word") from this environment variable; never stored
- `--json` (Default: `false`): Output as JSON

---

## `hardkas wallet hd send`

### Synopsis (Generated)

**Purpose:** Pay from the wallet: one plan over the UTXOs of all its addresses (the payment planner), change to its next unused change address, each input signed with its own address's key, sent through the same send path as 'tx send' (synced node, one submission per txId, records). Mainnet is refused: MAINNET_BROADCAST_DISABLED, before the password is read; off simnet it needs --yes, as 'tx send' experimental

#### Arguments

- `&lt;wallet&gt;` (Required): 

#### Options

- `--to &lt;address&gt;`: Recipient: a Kaspa address or a workspace account name
- `--amount &lt;kas&gt;`: Amount in KAS (decimal string)
- `--network &lt;network&gt;`: The workspace network to send on (default: the workspace's): it must be the wallet's
- `--fee-rate &lt;sompiPerGram&gt;`: Fee rate in sompi per gram (default: the node's normal estimate)
- `--max-fee-sompi &lt;sompi&gt;`: The most this payment may pay in fees, in sompi (the workspace's or HardKAS's default limit applies anyway)
- `--gap-limit &lt;n&gt;`: Consecutive unused addresses per chain before the scan stops (default 20)
- `--account &lt;n&gt;`: Account index (default 0)
- `--preflight` (Default: `false`): Check every input and signature against the node right before the broadcast (as 'tx send --preflight')
- `--yes` (Default: `false`): Confirm the broadcast. Required unless the network is simulated or simnet: without it the payment is refused (NOT EXECUTED, exit 3, TX_SEND_CONFIRMATION_REQUIRED) and nothing is sent or written
- `--password-env &lt;env&gt;`: Read the wallet password from this environment variable
- `--password-stdin` (Default: `false`): Read the wallet password from stdin
- `--passphrase-env &lt;env&gt;`: Read the wallet's BIP39 passphrase (the optional "25th word") from this environment variable; never stored
- `--json` (Default: `false`): Output as JSON

---

## `hardkas wallet hd reveal`

### Synopsis (Generated)

**Purpose:** Print the wallet's recovery phrase (SECRET: anyone who reads it owns the funds). Needs the password and --yes experimental

#### Arguments

- `&lt;wallet&gt;` (Required): 

#### Options

- `--yes` (Default: `false`): Confirm that the recovery phrase is printed to this terminal (or to stdout with --json)
- `--password-env &lt;env&gt;`: Read the wallet password from this environment variable
- `--password-stdin` (Default: `false`): Read the wallet password from stdin
- `--json` (Default: `false`): Output as JSON

---

## `hardkas wallet hd change-password`

### Synopsis (Generated)

**Purpose:** Re-encrypt the wallet under a new password (the recovery phrase and the addresses do not change) experimental

#### Arguments

- `&lt;wallet&gt;` (Required): 

#### Options

- `--password-env &lt;env&gt;`: Read the CURRENT wallet password from this environment variable
- `--password-stdin` (Default: `false`): Read the CURRENT wallet password from stdin
- `--new-password-env &lt;env&gt;`: Read the NEW wallet password (at least 8 characters) from this environment variable
- `--json` (Default: `false`): Output as JSON

---

