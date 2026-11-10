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

