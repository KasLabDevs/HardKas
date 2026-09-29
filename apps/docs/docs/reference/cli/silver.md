---
title: hardkas silver
---

# `hardkas silver`

## `hardkas silver doctor`

### Synopsis (Generated)

**Purpose:** Report whether the pinned toolchains and the canonical node are ready

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver compile`

### Synopsis (Generated)

**Purpose:** Compile SilverScript with the managed silverc v1.0.0 and record its provenance

#### Arguments

- `&lt;source&gt;` (Required): 

#### Options

- `--args &lt;file&gt;`: Constructor arguments: JSON list of &#123;kind, value&#125;
- `--out &lt;file&gt;`: Record path (default .hardkas/artifacts/silver/)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver inspect`

### Synopsis (Generated)

**Purpose:** Show a SilverScript v1 compile record

#### Arguments

- `&lt;record&gt;` (Required): 

#### Options

- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver verify`

### Synopsis (Generated)

**Purpose:** Reproduce a compile record with the managed silverc (byte-for-byte)

#### Arguments

- `&lt;record&gt;` (Required): 

#### Options

- `--args &lt;file&gt;`: The constructor arguments the record was compiled with
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver test`

### Synopsis (Generated)

**Purpose:** Run a compiled contract's tests on the official SilverScript runner experimental (script engine on scenario transactions; not transaction validity)

#### Arguments

- `&lt;record&gt;` (Required): 

#### Options

- `--tests &lt;file&gt;`: Runner test file (.test.json); a sig argument may be &#123;"signature":"&lt;account&gt;"&#125;
- `--args &lt;file&gt;`: The constructor arguments the record was compiled with
- `--contract &lt;name&gt;`: Contract, when the artifact has several
- `--runner &lt;path&gt;`: SilverScript runner (cli-debugger) binary (default: $HARDKAS_SILVER_RUNNER)
- `--out &lt;file&gt;`: Record path (default .hardkas/artifacts/silver-vm/)
- `--json` (Default: `false`): Output as JSON

### What it runs

The tests run on the official SilverScript runner (`cli-debugger` of kaspanet/silverscript), which executes the Kaspa script engine against a synthetic scenario transaction. The test file is the runner's own `.test.json` format. HardKAS adds three things:

- **The contract under test is the compile record's.** Its source and constructor arguments (checked against the record with `--args`) go to every test; a test file may not set its own `constructor_args`.
- **Signatures from local accounts.** Where an entry takes a `sig`, an argument `{"signature": "<account>"}` is signed by that account over the scenario transaction the runner builds. Plain P2SH scenarios only: covenant or state scenarios are refused.
- **A record.** `.hardkas/artifacts/silver-vm/silverVmTest-*.json`, mode `vm`, linked to the compile record. It holds the verdicts and digests; never the runner's output, which can print argument values.

Each test runs in its own runner process; its verdict is the runner's (exit status and PASS line). `expect: "fail"` means the script fails when it runs: an error before the script runs, such as bad arguments or a covenant rule on the scenario, is a FAIL either way. The command exits 1 if any test fails.

### What it does not prove

A runner verdict is contract execution with the runner's own compilation and argument encoding. The runner never executes an input's signature script and makes no P2SH check, so HardKAS does not pass unlock scripts to it, and it says nothing about fees, mass, UTXO state or chain-time locks. Transaction validity comes only from the node: `hardkas silver deploy` and `hardkas silver spend` on the canonical localnet. A `silverVmTest` record is never node evidence and never satisfies a capability.

### The runner (experimental)

Upstream publishes no runner binary yet. Build `cli-debugger` from the pinned release (kaspanet/silverscript v1.0.0: `cargo build --release -p cli-debugger`) and set `HARDKAS_SILVER_RUNNER` to it, or pass `--runner`. HardKAS records the binary's SHA-256 but cannot verify what it was built from. Nothing else in HardKAS needs the runner or a Rust toolchain; `hardkas silver doctor` shows whether one is configured.

---

## `hardkas silver deploy`

### Synopsis (Generated)

**Purpose:** Fund a compiled contract's P2SH output on the canonical localnet

#### Arguments

- `&lt;record&gt;` (Required): 

#### Options

- `--from &lt;account&gt;`: Funding account (local key)
- `--amount &lt;kas&gt;`: Value locked in the contract
- `--contract &lt;name&gt;`: Contract, when the artifact has several
- `--network &lt;network&gt;` (Default: `simnet`): Network
- `--wait` (Default: `false`): Wait for confirmation
- `--timeout &lt;seconds&gt;` (Default: `120`): Confirmation timeout
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver spend`

### Synopsis (Generated)

**Purpose:** Spend a deployed contract output through one of its entries

#### Arguments

- `&lt;deploy-record&gt;` (Required): 

#### Options

- `--entry &lt;name&gt;`: Entry to call
- `--to &lt;address&gt;`: Recipient of the whole value (minus the fee)
- `--args &lt;file&gt;`: Entry arguments: JSON list of &#123;kind, value&#125; and &#123;"kind":"signature","account":"&lt;name&gt;"&#125;
- `--sequence &lt;n&gt;`: Input sequence (relative locks)
- `--sig-op-count &lt;n&gt;`: Declared signature operations (default: the signature arguments, at least 1)
- `--wait` (Default: `false`): Wait for confirmation
- `--timeout &lt;seconds&gt;` (Default: `120`): Confirmation timeout
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver covenant genesis`

### Synopsis (Generated)

**Purpose:** Create a covenant: bind a new output to the covenant id the SDK derives

#### Arguments

- `&lt;record&gt;` (Required): 

#### Options

- `--from &lt;account&gt;`: Funding account (local key)
- `--amount &lt;kas&gt;`: Value locked in the covenant
- `--compute-budget &lt;n&gt;`: Compute budget of the funding input (explicit: no estimator exists)
- `--fee &lt;sompi&gt;`: Explicit fee (required when --compute-budget &gt; 0: the SDK does not price v1 budgets)
- `--contract &lt;name&gt;`: Contract, when the artifact has several
- `--wait` (Default: `false`): Wait for confirmation and the node's covenant id
- `--timeout &lt;seconds&gt;` (Default: `120`): Confirmation timeout
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver covenant transition`

### Synopsis (Generated)

**Purpose:** Advance a 1:1 auth-bound covenant: successor state compiled by silverc, same covenant id

#### Arguments

- `&lt;covenant-record&gt;` (Required): 

#### Options

- `--policy &lt;name&gt;`: Covenant declaration (policy function) to call
- `--constructor-args &lt;file&gt;`: Constructor arguments of the current state (checked against the record)
- `--state-map &lt;json&gt;`: State field -&gt; constructor parameter index, e.g. &#123;"value":0&#125;
- `--next-state &lt;file&gt;`: Successor state: JSON object of &#123;kind, value&#125; per field
- `--compute-budget &lt;n&gt;`: Compute budget of the covenant input (explicit: no estimator exists)
- `--args &lt;file&gt;`: Entry arguments: JSON list of &#123;kind, value&#125;
- `--fee &lt;sompi&gt;`: Explicit fee (required when --compute-budget &gt; 0)
- `--emit-args &lt;file&gt;`: Write the successor's constructor arguments here (for the next transition)
- `--wait` (Default: `false`): Wait for confirmation and check the lineage
- `--timeout &lt;seconds&gt;` (Default: `120`): Confirmation timeout
- `--json` (Default: `false`): Output as JSON

---

