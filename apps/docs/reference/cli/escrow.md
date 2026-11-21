---
title: hardkas escrow
---

# `hardkas escrow`

## `hardkas escrow rescue-v1 prepare`

### Synopsis (Generated)

**Purpose:** Prepare a v1 escrow rescue draft spending an orphaned UTXO to a target address. The escrow is recompiled from the constructor arguments it was created with (createEscrow's v1 config); its lock must be --address and the UTXO's script, or nothing is read or written

#### Options

- `--address &lt;address&gt;`: Legacy escrow P2SH address
- `--outpoint &lt;outpoint&gt;`: Funding outpoint to spend (txId:index)
- `--to &lt;address&gt;`: Destination address to recover funds to
- `--buyer-pk &lt;hex&gt;`: Required: buyer x-only public key the escrow was created with (32 bytes hex)
- `--seller-pk &lt;hex&gt;`: Required: seller x-only public key the escrow was created with (32 bytes hex)
- `--arbiter-pk &lt;hex&gt;`: Required: arbiter x-only public key the escrow was created with (32 bytes hex)
- `--buyer-destination &lt;address|spk&gt;`: Required: the buyer destination the escrow was created with: an address, or its script public key in hex without the version (EscrowConfig.buyerDestinationSpk)
- `--seller-destination &lt;address|spk&gt;`: Required: the seller destination the escrow was created with: an address, or its script public key in hex without the version (EscrowConfig.sellerDestinationSpk)
- `--refund-amount &lt;sompi&gt;`: Required: the escrow's refundAmount (sompi), as it was created
- `--release-amount &lt;sompi&gt;`: Required: the escrow's releaseAmount (sompi), as it was created
- `--network &lt;network&gt;` (Default: `simnet`): Network id (default simnet); mainnet refused; testnet-&lt;n&gt; needs experimental + network.allowPublic
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet)
- `--out &lt;file&gt;` (Default: `rescue-v1-plan.draft.json`): Output draft file path (default rescue-v1-plan.draft.json)
- `--fee &lt;sompi&gt;`: Miner fee in sompi (default 400000 sompi = 0.004 KAS, raised to the node's minimum relay fee for this rescue when that is higher; at most 2500000)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas escrow rescue-v1 sign`

### Synopsis (Generated)

**Purpose:** Sign a rescue draft with a local dev or keystore account

#### Arguments

- `&lt;draft-file&gt;` (Required): 

#### Options

- `--account &lt;name&gt;`: Account name or role (e.g. buyer, seller, or dev account name)
- `--role &lt;role&gt;` (Default: `buyer`): Contract role (buyer or seller)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas escrow rescue-v1 inspect`

### Synopsis (Generated)

**Purpose:** Inspect a rescue draft and verify balance and signature status

#### Arguments

- `&lt;draft-file&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas escrow rescue-v1 broadcast`

### Synopsis (Generated)

**Purpose:** Finalize and broadcast the signed rescue transaction to the network

#### Arguments

- `&lt;draft-file&gt;` (Required): 

#### Options

- `--network &lt;network&gt;`: Network (default: the draft's); must be the draft's
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the draft's network; simnet: the canonical localnet)
- `--yes` (Default: `false`): Confirm the broadcast. Required unless the network is simulated or simnet: without it the rescue is refused (NOT EXECUTED, exit 3, TX_SEND_CONFIRMATION_REQUIRED) and nothing is sent or written
- `--json` (Default: `false`): Output as JSON

---

## `hardkas escrow create`

### Synopsis (Generated)

**Purpose:** Create a v2 escrow (EscrowFull with --amount, EscrowSplit with --buyer-amount and --seller-amount), compiled by the pinned silverc for the network, and record it in this workspace. Nothing is sent

#### Options

- `--buyer &lt;party&gt;`: The buyer: an account of this workspace, a Schnorr address of the network, or a 32-byte x-only public key (hex)
- `--seller &lt;party&gt;`: The seller (account, address or x-only public key)
- `--arbiter &lt;party&gt;`: The arbiter (account, address or x-only public key)
- `--buyer-destination &lt;address|spk&gt;`: Where refunds pay (default: the buyer's own address): an address of the network, or a script public key in hex without the version
- `--seller-destination &lt;address|spk&gt;`: Where releases pay (default: the seller's own address)
- `--amount &lt;kas&gt;`: EscrowFull: the principal every branch pays (KAS)
- `--buyer-amount &lt;kas&gt;`: EscrowSplit: the buyer's allocation (KAS), with --seller-amount
- `--seller-amount &lt;kas&gt;`: EscrowSplit: the seller's allocation (KAS), with --buyer-amount
- `--fee-budget &lt;sompi&gt;`: The fee of every release, added to the funding (sompi; default 2000000 = 0.02 KAS; at least the node's minimum relay fee of a release, checked before funding)
- `--nonce &lt;hex&gt;`: 32-byte nonce that makes the escrow's address unique (default: random)
- `--network &lt;network&gt;`: Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--json` (Default: `false`): Output as JSON

---

## `hardkas escrow fund`

### Synopsis (Generated)

**Purpose:** Fund an escrow from the buyer's account: one payment of its funding amount (principal + fee budget) to its address, planned, signed and sent by HardKAS's payment path. Refused before anything is signed if any release could not pay the node's minimum relay fee

#### Arguments

- `&lt;id&gt;` (Required): 

#### Options

- `--from &lt;account&gt;`: The buyer's account of this workspace (its key must be the escrow's buyer key)
- `--network &lt;network&gt;`: Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). The canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)
- `--wait` (Default: `false`): Wait until a chain block accepts the funding
- `--timeout &lt;seconds&gt;` (Default: `120`): With --wait: how long to wait
- `--password-env &lt;env&gt;`: Read the keystore password of the encrypted account this command signs with from this environment variable (development accounts need none)
- `--password-stdin` (Default: `false`): Read the keystore password of the encrypted account this command signs with from stdin
- `--yes` (Default: `false`): Confirm the broadcast. Required unless the network is simulated or simnet: without it the funding is refused (NOT EXECUTED, exit 3, TX_SEND_CONFIRMATION_REQUIRED) and nothing is sent or written
- `--json` (Default: `false`): Output as JSON

---

## `hardkas escrow status`

### Synopsis (Generated)

**Purpose:** Show an escrow recorded in this workspace: its state, funding, prepared release, signatures and release (no node is contacted)

#### Arguments

- `&lt;id&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas escrow prepare`

### Synopsis (Generated)

**Purpose:** Prepare the release of one branch over the recorded funding and write the release request each required signer signs (in this workspace, or in their own with `escrow sign &lt;file&gt;`)

#### Arguments

- `&lt;id&gt;` (Required): 

#### Options

- `--branch &lt;branch&gt;`: EscrowFull: mutualRelease, refundBuyer, releaseToSeller; EscrowSplit: executeSplit, fullRefund, fullRelease, mutualRelease
- `--buyer-share &lt;kas&gt;`: mutualRelease: what the buyer receives (KAS), with --seller-share; together the principal (default: the contract's default allocation)
- `--seller-share &lt;kas&gt;`: mutualRelease: what the seller receives (KAS), with --buyer-share
- `--out &lt;file&gt;`: The release request file (default escrow-&lt;id&gt;-&lt;branch&gt;.request.json)
- `--network &lt;network&gt;`: Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--json` (Default: `false`): Output as JSON

---

## `hardkas escrow sign`

### Synopsis (Generated)

**Purpose:** Sign an escrow's prepared release as one role: an escrow id of this workspace (the signature goes into its record), or a release request file, checked first against the escrow's own terms (the contract recompiled, the draft prepared again) and signed here, in the signer's own workspace

#### Arguments

- `&lt;id-or-request&gt;` (Required): 

#### Options

- `--role &lt;role&gt;`: buyer, seller or arbiter: a role the prepared branch requires
- `--account &lt;account&gt;`: The account of this workspace that signs (its key must be the escrow's key for the role)
- `--out &lt;file&gt;`: With a request file: where the signed request is written (default: the request file itself)
- `--network &lt;network&gt;`: Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--password-env &lt;env&gt;`: Read the keystore password of the encrypted account this command signs with from this environment variable (development accounts need none)
- `--password-stdin` (Default: `false`): Read the keystore password of the encrypted account this command signs with from stdin
- `--json` (Default: `false`): Output as JSON

---

## `hardkas escrow release`

### Synopsis (Generated)

**Purpose:** Send an escrow's prepared release once every required role signed: each signature verified (BIP340) before anything is sent, then one send through HardKAS's send machinery. An unknown outcome is recorded and never sent again before reconcile

#### Arguments

- `&lt;id&gt;` (Required): 

#### Options

- `--signatures &lt;files...&gt;`: Signed release request files to take the signatures from (each checked against this escrow's prepared release)
- `--network &lt;network&gt;`: Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). The canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)
- `--wait` (Default: `false`): Wait until a chain block accepts the release (RELEASED)
- `--timeout &lt;seconds&gt;` (Default: `120`): With --wait: how long to wait
- `--yes` (Default: `false`): Confirm the broadcast. Required unless the network is simulated or simnet: without it the release is refused (NOT EXECUTED, exit 3, TX_SEND_CONFIRMATION_REQUIRED) and nothing is sent or written
- `--json` (Default: `false`): Output as JSON

---

## `hardkas escrow reconcile`

### Synopsis (Generated)

**Purpose:** Look at the node once for an escrow's pending funding and release (its mempool, then its chain) and record what it shows: accepted by a chain block → confirmed (FUNDED / RELEASED)

#### Arguments

- `&lt;id&gt;` (Required): 

#### Options

- `--network &lt;network&gt;`: Network (default: the escrow's own, else the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). The canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)
- `--json` (Default: `false`): Output as JSON

---

