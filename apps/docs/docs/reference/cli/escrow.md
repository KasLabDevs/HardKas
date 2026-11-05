---
title: hardkas escrow
---

# `hardkas escrow`

## `hardkas escrow rescue-v1 prepare`

### Synopsis (Generated)

**Purpose:** Prepare a v1 escrow rescue draft spending an orphaned UTXO to a target address

#### Options

- `--address &lt;address&gt;`: Legacy escrow P2SH address
- `--outpoint &lt;outpoint&gt;`: Funding outpoint to spend (txId:index)
- `--to &lt;address&gt;`: Destination address to recover funds to
- `--network &lt;network&gt;` (Default: `simnet`): Network id (default simnet)
- `--out &lt;file&gt;` (Default: `rescue-v1-plan.draft.json`): Output draft file path (default rescue-v1-plan.draft.json)
- `--fee &lt;sompi&gt;` (Default: `400000`): Miner fee in sompi (default 400000 sompi = 0.004 KAS)
- `--buyer-pk &lt;hex&gt;`: Buyer x-only public key (32 bytes hex)
- `--seller-pk &lt;hex&gt;`: Seller x-only public key (32 bytes hex)
- `--arbiter-pk &lt;hex&gt;`: Arbiter x-only public key (32 bytes hex)
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

- `--network &lt;network&gt;` (Default: `simnet`): Network (default simnet)
- `--json` (Default: `false`): Output as JSON

---

