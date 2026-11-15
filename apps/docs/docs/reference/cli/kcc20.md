---
title: hardkas kcc20
---

# `hardkas kcc20`

## `hardkas kcc20 encode-state`

### Synopsis (Generated)

**Purpose:** Encode a KCC20State (JSON file or inline: amount, owner, ownerScheme, borrowScheme, borrowGuard, extensionCommitment) as its 112-byte KCC-1 state encoding. Exit codes: 0 encoded; 2 an invalid state

#### Arguments

- `&lt;state&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas kcc20 decode-state`

### Synopsis (Generated)

**Purpose:** Decode a 112-byte KCC20State encoding strictly (KCC-1 §3.7.1) and report any KCC-20 rule the state breaks. Exit codes: 0 decoded; 2 not a canonical KCC20State encoding

#### Arguments

- `&lt;hex&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas kcc20 check`

### Synopsis (Generated)

**Purpose:** Check a KCC-20 transfer off chain against the leader's rules: inputs (leader first, with state, kasValueSompi, witness), nextStates, outputs (state, kasValueSompi), optional transactionInputs and config (a kcc20.json). Signatures are listed, never verified; continuation programs, covenant bindings and each input's entrypoint are not checked, and the input states and their order are taken as given (the token's program checks them on chain). Exit codes: 0 STRUCTURALLY_VALID; 1 REJECTED (KCC20_TRANSFER_REJECTED); 2 usage

#### Arguments

- `&lt;transfer&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas kcc20 artifact`

### Synopsis (Generated)

**Purpose:** Read a KCC-20 program artifact (kcc20.json: program, entrypoints, owner_schemes, max_token_inputs, max_token_outputs) and print its configuration and KCC-1 dispatch tags. Exit codes: 0 valid; 2 invalid

#### Arguments

- `&lt;file&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas kcc20 deploy`

### Synopsis (Generated)

**Purpose:** Create a KCC-20 token on a node (transaction v1): a covenant genesis of the token program — its compile record, e.g. the reference KCC20.sil compiled by `hardkas silver compile` — with one token output per initial holder, all one covenant id; planned, checked, signed and sent by the SDK's v1 engine (sdk.kcc20). Mainnet refused (MAINNET_SIGNING_DISABLED) before anything is read; testnet-&lt;n&gt; needs experimental + network.allowPublic

#### Arguments

- `&lt;record&gt;` (Required): 

#### Options

- `--from &lt;account&gt;`: Funding account (local key): pays the token outputs' KAS and the fee, gets the change
- `--holder &lt;spec&gt;` (Default: ``): An initial holder, in output order (repeatable): '&lt;owner&gt;=&lt;amount&gt;', the owner an account of this workspace, a P2PK address or a 32-byte x-only public key (hex), owner scheme p2pk-schnorr/v1; the amount an exact integer
- `--kas &lt;kas&gt;` (Default: `10`): KAS locked in each token output
- `--extension-commitment &lt;hex&gt;`: The token's extension commitment (32 bytes, hex; default zero): every output of the token carries it
- `--artifact &lt;file&gt;`: The program's KCC-20 artifact (kcc20.json: entrypoints, owner schemes, bounds); default: KCC-20's default configuration
- `--constructor-args &lt;file&gt;`: Constructor arguments the program was compiled with (default: proven from its initial State)
- `--contract &lt;name&gt;`: Contract, when the artifact has several (default: KCC20)
- `--fee &lt;sompi&gt;`: Fee in sompi: at least the node's floor for this transaction (the floor when omitted)
- `--network &lt;network&gt;`: Network (default: the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)
- `--wait` (Default: `false`): Wait until every token output is confirmed with the covenant id
- `--timeout &lt;seconds&gt;` (Default: `120`): Confirmation timeout
- `--password-env &lt;env&gt;`: Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)
- `--password-stdin` (Default: `false`): Read the keystore password of the encrypted account(s) this command signs with from stdin
- `--json` (Default: `false`): Output as JSON

---

## `hardkas kcc20 transfer`

### Synopsis (Generated)

**Purpose:** Transfer KCC-20 tokens on a node (transaction v1): --from's token outputs (or the --input ones) to the recipients, the change back to --from, through the program's transfer (the leader) and transfer_delegator (the other inputs). Checked against the KCC-20 rules (the model `kcc20 check` runs) before anything is signed, and refused there when they reject it (KCC20_TRANSFER_REJECTED); the owners' signatures go in the witnesses; planned, signed and sent by the SDK's v1 engine (sdk.kcc20); the token's program on the node is the final judge. Mainnet refused (MAINNET_SIGNING_DISABLED) before anything is read

#### Options

- `--covenant &lt;id&gt;`: The token's covenant id (32 bytes, hex)
- `--from &lt;account&gt;`: The holder whose token outputs are spent and who signs them (local key); the change in tokens goes back to it
- `--to &lt;spec&gt;` (Default: ``): A recipient, in output order (repeatable): '&lt;owner&gt;=&lt;amount&gt;', the owner an account of this workspace, a P2PK address or a 32-byte x-only public key (hex)
- `--input &lt;outpoint&gt;` (Default: ``): Spend this token output 'txid:index' (repeatable, the leader first); default: --from's live outputs, largest first, as few as cover the amounts
- `--funder &lt;account&gt;`: Pay the fee from this account's coins (local key); default: the tokens' KAS (the first new output keeps what the fee leaves)
- `--artifact &lt;file&gt;`: The program's KCC-20 artifact (kcc20.json); default: KCC-20's default configuration
- `--fee &lt;sompi&gt;`: Fee in sompi: at least the node's floor for this transaction (the floor when omitted)
- `--max-fee &lt;sompi&gt;`: The plan's fee limit (default: the fee it pays)
- `--compute-budget &lt;n&gt;`: Compute budget of each token input, or 'estimate' (the default: rusty-kaspa's upper bound)
- `--network &lt;network&gt;`: Network (default: the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)
- `--wait` (Default: `false`): Wait until every new token output is confirmed with the covenant id
- `--timeout &lt;seconds&gt;` (Default: `120`): Confirmation timeout
- `--password-env &lt;env&gt;`: Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)
- `--password-stdin` (Default: `false`): Read the keystore password of the encrypted account(s) this command signs with from stdin
- `--json` (Default: `false`): Output as JSON

---

## `hardkas kcc20 balance`

### Synopsis (Generated)

**Purpose:** KCC-20 balances on a node: the holder's live token outputs (or every holder's), from this workspace's records of the token's covenant, each listed unspent at the node with the covenant id and its state checked against its address. The node has no query by covenant id: an output this workspace did not record is not seen. Mainnet refused (MAINNET_CONNECTION_DISABLED) before anything is read

#### Arguments

- `&lt;holder&gt;` (Optional): 

#### Options

- `--covenant &lt;id&gt;`: The token's covenant id (32 bytes, hex)
- `--network &lt;network&gt;`: Network (default: the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)
- `--json` (Default: `false`): Output as JSON

---

