---
title: hardkas silver
---

# `hardkas silver`

## `hardkas silver audit`

### Synopsis (Generated)

**Purpose:** Run static security analysis over a SilverScript (.sil) contract or compile record (heuristic AST and source-text rules COV-AUTH-001..COV-BUDGET-001: findings to review, not a proof of security). Exit codes: 0 report written; 1 HIGH findings with --fail-on-high (SILVER_AUDIT_HIGH_FINDINGS); 2 usage (file not found, not a compile record); 4 tampered compile record

#### Arguments

- `&lt;source-or-record&gt;` (Required): 

#### Options

- `--args &lt;file&gt;`: Optional constructor arguments JSON file
- `--fail-on-high` (Default: `false`): Exit with non-zero code if any HIGH severity finding is detected
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver preflight`

### Synopsis (Generated)

**Purpose:** Run v1 covenant transition preflight on a generated local testbed UTXO (STRUCTURAL_PREFLIGHT, plus SCRIPT_VM_PREFLIGHT on the SilverScript runner) reporting mass, compute budget and both verdicts; never a node's acceptance. Exit codes: 0 PREFLIGHT PASS; 1 PREFLIGHT FAIL (structural or SCRIPT_VM rejection: SILVER_PREFLIGHT_FAILED) or a runner that gave no verdict (SILVER_RUNNER_NOT_FOUND, _START_FAILED, _TIMEOUT, _PROTOCOL_ERROR or _INTERNAL_ERROR); 2 usage; 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED); 4 tampered compile record

#### Arguments

- `&lt;source-or-record&gt;` (Required): 

#### Options

- `--entry &lt;name&gt;`: Covenant policy or entrypoint name (e.g. bump)
- `--constructor-args &lt;file&gt;`: Constructor arguments JSON file
- `--args &lt;json-or-file&gt;`: Entry arguments JSON array or file path
- `--state &lt;json-or-file&gt;`: Current covenant state JSON object or file path
- `--next-state &lt;json-or-file&gt;`: Successor covenant state JSON object or file path
- `--demo-fixture` (Default: `false`): Allow generated laboratory fixture parameters and synthetic UTXO when explicit transaction arguments are omitted
- `--fee &lt;sompi&gt;`: Fee in sompi (default: 300000)
- `--compute-budget &lt;n&gt;`: Compute budget or 'estimate' (default: estimate)
- `--level &lt;level&gt;` (Default: `SCRIPT_VM_PREFLIGHT`): Preflight level: STRUCTURAL_PREFLIGHT or SCRIPT_VM_PREFLIGHT
- `--allow-unverified-runner` (Default: `false`): Run a SilverScript runner (cli-debugger) that is not verified against a trusted reference. Upstream publishes no runner binary, so today every runner is an UNVERIFIED local build: without this flag none is executed. Its verdicts are labelled UNVERIFIED, never official
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver debug`

### Synopsis (Generated)

**Purpose:** Execute a covenant transition on the SilverScript runner (cli-debugger: a local build, no official binary exists) after the structural v1 validation, and emit source-mapped step traces, variable state and three verdicts (structural, SCRIPT_VM, global). Exit codes: 0 APPROVED (or any rejection with --allow-failure); 1 rejected (SILVER_DEBUG_STRUCTURAL_REJECTED, SILVER_DEBUG_CONTRACT_REJECTED) or a runner that gave no verdict (SILVER_RUNNER_NOT_FOUND, _START_FAILED, _TIMEOUT, _PROTOCOL_ERROR or _INTERNAL_ERROR); 2 usage; 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED); 4 tampered compile record

#### Arguments

- `&lt;source-or-record&gt;` (Required): 

#### Options

- `--entry &lt;name&gt;`: Covenant policy or entrypoint name (e.g. bump)
- `--constructor-args &lt;file&gt;`: Constructor arguments JSON file
- `--args &lt;json-or-file&gt;`: Entry arguments JSON array or file path
- `--state &lt;json-or-file&gt;`: Current covenant state JSON object or file path
- `--next-state &lt;json-or-file&gt;`: Successor covenant state JSON object or file path
- `--demo-fixture` (Default: `false`): Allow generated laboratory fixture parameters and synthetic UTXO when explicit transaction arguments are omitted
- `--fee &lt;sompi&gt;`: Fee in sompi (default: 300000)
- `--compute-budget &lt;n&gt;`: Compute budget or 'estimate' (default: estimate)
- `--allow-failure` (Default: `false`): Return exit code 0 when the transition is rejected (structural validation or SCRIPT_VM), for interactive inspection; the verdicts are unchanged
- `--allow-unverified-runner` (Default: `false`): Run a SilverScript runner (cli-debugger) that is not verified against a trusted reference. Upstream publishes no runner binary, so today every runner is an UNVERIFIED local build: without this flag none is executed. Its verdicts are labelled UNVERIFIED, never official
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver fuzz`

### Synopsis (Generated)

**Purpose:** Run bidirectional property-based fuzzing over a counter covenant transition: SCRIPT_VM checks the counter rule (accepted iff delta &gt; 0 and next = previous + delta) on the SilverScript runner; SYNTHETIC checks the structural compute-budget bounds. Exit codes: 0 FUZZ PASS; 1 counterexample (SILVER_FUZZ_FAILED), too few samples of one direction (SILVER_FUZZ_INSUFFICIENT_COVERAGE), a sample without a VM verdict (SILVER_FUZZ_NO_VM_EVIDENCE), a testbed error (SILVER_FUZZ_EVALUATION_ERROR), a runner that gave no verdict (SILVER_RUNNER_NOT_FOUND, _START_FAILED, _TIMEOUT, _PROTOCOL_ERROR or _INTERNAL_ERROR) or one that changed during the run (SILVER_RUNNER_CHANGED); 2 usage (SILVER_OPTION_INVALID, SILVER_FUZZ_SHAPE_UNSUPPORTED); 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED); 4 tampered compile record

#### Arguments

- `&lt;source-or-record&gt;` (Required): 

#### Options

- `--entry &lt;name&gt;` (Default: `bump`): Covenant entrypoint name: it must take (State, int delta, sig) over a state of one int field
- `--constructor-args &lt;file&gt;`: Constructor arguments JSON file
- `--runs &lt;n&gt;` (Default: `10`): Generated samples (1-10000), run after the boundary samples that every run includes
- `--seed &lt;n&gt;` (Default: `20261029`): Deterministic RNG seed (32-bit integer)
- `--backend &lt;backend&gt;` (Default: `SCRIPT_VM`): SCRIPT_VM: the counter rule on the SilverScript runner; SYNTHETIC: the structural compute-budget bounds (no contract logic is judged without the VM)
- `--allow-unverified-runner` (Default: `false`): Run a SilverScript runner (cli-debugger) that is not verified against a trusted reference. Upstream publishes no runner binary, so today every runner is an UNVERIFIED local build: without this flag none is executed. Its verdicts are labelled UNVERIFIED, never official
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver doctor`

### Synopsis (Generated)

**Purpose:** Report whether the pinned toolchains and the node the Silver on-chain commands would use are ready

#### Options

- `--network &lt;network&gt;`: Network (default: the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver compile`

### Synopsis (Generated)

**Purpose:** Compile SilverScript with the managed silverc v1.0.0 and record its provenance

#### Arguments

- `&lt;source&gt;` (Required): 

#### Options

- `--args &lt;file&gt;`: Constructor arguments: JSON list of &#123;kind, value&#125;
- `--network &lt;network&gt;`: Network the record and its P2SH addresses are for (default: the workspace's network, else simnet; mainnet refused)
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

**Purpose:** Run a compiled contract's tests on the SilverScript runner (cli-debugger) experimental (script engine on scenario transactions; not transaction validity). Exit codes: 0 every test passed; 1 a test failed (SILVER_TEST_FAILED) or the runner gave no verdict (SILVER_RUNNER_FAILED, _START_FAILED, _CHANGED, _TIMEOUT, _OUTPUT_UNRECOGNIZED, _PROTOCOL_ERROR or _INTERNAL_ERROR); 2 usage; 3 runner refused by the trust policy (SILVER_RUNNER_UNVERIFIED); 4 tampered compile record

#### Arguments

- `&lt;record&gt;` (Required): 

#### Options

- `--tests &lt;file&gt;`: Runner test file (.test.json); a sig argument may be &#123;"signature":"&lt;account&gt;"&#125;
- `--args &lt;file&gt;`: The constructor arguments the record was compiled with
- `--contract &lt;name&gt;`: Contract, when the artifact has several
- `--runner &lt;path&gt;`: SilverScript runner (cli-debugger) binary (default: $HARDKAS_SILVER_RUNNER, else &lt;HARDKAS_HOME&gt;/toolchains/cli-debugger/1.0.0)
- `--allow-unverified-runner` (Default: `false`): Run a SilverScript runner (cli-debugger) that is not verified against a trusted reference. Upstream publishes no runner binary, so today every runner is an UNVERIFIED local build: without this flag none is executed. Its verdicts are labelled UNVERIFIED, never official
- `--out &lt;file&gt;`: Record path (default .hardkas/artifacts/silver-vm/)
- `--password-env &lt;env&gt;`: Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)
- `--password-stdin` (Default: `false`): Read the keystore password of the encrypted account(s) this command signs with from stdin
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver deploy`

### Synopsis (Generated)

**Purpose:** Fund a compiled contract's P2SH output on a Kaspa node (the canonical localnet, or the node --url / the workspace names)

#### Arguments

- `&lt;record&gt;` (Required): 

#### Options

- `--from &lt;account&gt;`: Funding account (local key)
- `--amount &lt;kas&gt;`: Value locked in the contract
- `--contract &lt;name&gt;`: Contract, when the artifact has several
- `--network &lt;network&gt;`: Network (default: the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)
- `--tx-version &lt;n&gt;` (Default: `0`): Transaction version: 0 (the default, as certified) or 1 (the SDK's v1 engine: checks before any key, compute budgets)
- `--wait` (Default: `false`): Wait for confirmation
- `--timeout &lt;seconds&gt;` (Default: `120`): Confirmation timeout
- `--password-env &lt;env&gt;`: Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)
- `--password-stdin` (Default: `false`): Read the keystore password of the encrypted account(s) this command signs with from stdin
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
- `--sig-op-count &lt;n&gt;`: Declared signature operations (default: the signature arguments, at least 1); transaction v0 only
- `--network &lt;network&gt;`: Network (default: the deploy record's); mainnet refused; testnet-&lt;n&gt; needs experimental + network.allowPublic
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)
- `--tx-version &lt;n&gt;` (Default: `0`): Transaction version: 0 (the default, as certified) or 1 (the SDK's v1 engine: checks before any key, compute budgets)
- `--constructor-args &lt;file&gt;`: With --tx-version 1: the constructor arguments the contract was compiled with (default: proven from this spend's signers, when they are the keys it checks)
- `--compute-budget &lt;n&gt;`: With --tx-version 1: the contract input's compute budget, or 'estimate' (rusty-kaspa's upper bound); default: the certified budget of this entry, else that estimate
- `--wait` (Default: `false`): Wait for confirmation
- `--timeout &lt;seconds&gt;` (Default: `120`): Confirmation timeout
- `--password-env &lt;env&gt;`: Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)
- `--password-stdin` (Default: `false`): Read the keystore password of the encrypted account(s) this command signs with from stdin
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
- `--compute-budget &lt;n&gt;`: Compute budget of the funding inputs (default: the certified P2PK budget)
- `--fee &lt;sompi&gt;`: Fee in sompi: at least the node's floor for this transaction (the floor when omitted)
- `--constructor-args &lt;file&gt;`: Constructor arguments the contract was compiled with (default: proven from its initial State)
- `--contract &lt;name&gt;`: Contract, when the artifact has several
- `--network &lt;network&gt;`: Network (default: the workspace's, else simnet). mainnet is refused; testnet-&lt;n&gt; needs experimental + network.allowPublic in the config
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)
- `--wait` (Default: `false`): Wait for confirmation and the node's covenant id
- `--timeout &lt;seconds&gt;` (Default: `120`): Confirmation timeout
- `--password-env &lt;env&gt;`: Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)
- `--password-stdin` (Default: `false`): Read the keystore password of the encrypted account(s) this command signs with from stdin
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
- `--state-map &lt;json|file&gt;`: State field -&gt; constructor parameter index: inline JSON such as &#123;"value":0&#125;, or the path of a JSON file with it
- `--next-state &lt;file&gt;`: Successor state: JSON object of &#123;kind, value&#125; per field
- `--compute-budget &lt;n&gt;`: Compute budget of the covenant input, or 'estimate' (rusty-kaspa's upper bound); default: the certified budget of this entry, else that estimate
- `--args &lt;file&gt;`: Entry arguments: JSON list of &#123;kind, value&#125; and &#123;"kind":"signature","account":"&lt;name&gt;"&#125;
- `--fee &lt;sompi&gt;`: Fee in sompi, paid from the covenant's value: at least the node's floor for this transaction (the floor when omitted)
- `--emit-args &lt;file&gt;`: Write the successor's constructor arguments here (for the next transition)
- `--network &lt;network&gt;`: Network (default: the covenant record's); mainnet refused; testnet-&lt;n&gt; needs experimental + network.allowPublic
- `--url &lt;url&gt;`: Node wRPC (JSON) endpoint (default: the one the workspace declares for the network; simnet: the canonical localnet). Only the canonical localnet is proven by container and image digest; any other node by what it reports (network, version, synced)
- `--wait` (Default: `false`): Wait for confirmation and check the lineage
- `--timeout &lt;seconds&gt;` (Default: `120`): Confirmation timeout
- `--password-env &lt;env&gt;`: Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)
- `--password-stdin` (Default: `false`): Read the keystore password of the encrypted account(s) this command signs with from stdin
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver covenant inspect`

### Synopsis (Generated)

**Purpose:** A covenant's lineage and state (its id, or one of its covenant records): genesis anchored by its recomputed id, transitions linked by outpoints, the tip checked at the node

#### Arguments

- `&lt;covenant&gt;` (Required): 

#### Options

- `--network &lt;network&gt;`: Network (default: the workspace's)
- `--no-node`: Do not ask the node for the tip (records only)
- `--no-states`: Do not check the declared states against the addresses
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver engine plan`

### Synopsis (Generated)

**Purpose:** Plan a v1 transaction (genesis, transition, deploy or spend) from a JSON spec of the SDK's options, sompi as decimal strings

#### Arguments

- `&lt;operation&gt;` (Required): 
- `&lt;spec&gt;` (Required): 

#### Options

- `--network &lt;network&gt;`: Network (default: the workspace's)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver engine sign`

### Synopsis (Generated)

**Purpose:** Sign a v1 plan (its path or artifact id) with the SDK's engine: checked against the node and the compiler first, no key read for a plan it refuses

#### Arguments

- `&lt;plan&gt;` (Required): 

#### Options

- `--network &lt;network&gt;`: Network (default: the plan's)
- `--password-env &lt;env&gt;`: Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)
- `--password-stdin` (Default: `false`): Read the keystore password of the encrypted account(s) this command signs with from stdin
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver engine draft prepare`

### Synopsis (Generated)

**Purpose:** Prepare a draft of a v1 plan (its path or artifact id): checked against the node and the compiler now, its signature slots unsigned

#### Arguments

- `&lt;plan&gt;` (Required): 

#### Options

- `--network &lt;network&gt;`: Network (default: the plan's)
- `--out &lt;file&gt;`: Draft path (default .hardkas/drafts/)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver engine draft sign`

### Synopsis (Generated)

**Purpose:** Sign one account's slots of a draft with its local key (the draft checked first; each signature verified before it is kept)

#### Arguments

- `&lt;draft&gt;` (Required): 

#### Options

- `--plan &lt;plan&gt;`: The plan the draft was prepared for (its path or artifact id)
- `--account &lt;name&gt;`: The account whose slots this signs
- `--network &lt;network&gt;`: Network (default: the plan's)
- `--out &lt;file&gt;`: Signed draft path (default .hardkas/drafts/)
- `--password-env &lt;env&gt;`: Read the keystore password of the encrypted account(s) this command signs with from this environment variable (development accounts need none)
- `--password-stdin` (Default: `false`): Read the keystore password of the encrypted account(s) this command signs with from stdin
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver engine draft combine`

### Synopsis (Generated)

**Purpose:** Combine drafts signed by different parties: the same transaction and slots, every signature verified (one bad signature refuses all)

#### Arguments

- `&lt;drafts&gt;` (Required): 

#### Options

- `--plan &lt;plan&gt;`: The plan the drafts were prepared for (its path or artifact id)
- `--out &lt;file&gt;`: Combined draft path (default .hardkas/drafts/)
- `--json` (Default: `false`): Output as JSON

---

## `hardkas silver engine draft finalize`

### Synopsis (Generated)

**Purpose:** Finalize a fully signed draft into the signed transaction (checked against the node and the compiler again, every signature verified)

#### Arguments

- `&lt;draft&gt;` (Required): 

#### Options

- `--plan &lt;plan&gt;`: The plan the draft was prepared for (its path or artifact id)
- `--network &lt;network&gt;`: Network (default: the plan's)
- `--json` (Default: `false`): Output as JSON

---

