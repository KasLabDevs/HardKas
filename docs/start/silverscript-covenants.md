---
title: SilverScript and covenants on your simnet
description: Compile a SilverScript contract with the pinned silverc, deploy and spend it, then create a Toccata covenant and advance it, on your own simnet node.
---

# SilverScript and covenants on your simnet

Two examples on the node from [Run your own simnet node](./simnet-node.md), with
the accounts and funds of the [Quickstart](./quickstart-simnet.md) (`alice` holds
100 KAS; keep the miner running so the node stays synced and transactions
confirm):

1. **A signed contract, deployed and spent** (SilverScript P2SH, transaction v0):
   compile → deploy → spend.
2. **A covenant** (Toccata, transaction v1): compile → genesis → transition.

Everything here is real-node evidence about your simnet node only. Mainnet is
refused (`SILVERSCRIPT_MAINNET_NOT_ENABLED`); testnet-10 is not evidenced for
these commands.

## 0. Install the compiler and check readiness

```bash
npx hardkas toolchain install silverc
npx hardkas silver doctor --network simnet
```

`toolchain install` downloads the official `silverc` v1.0.0 release asset for
your platform (about 7 MB installed) and checks its SHA-256. `silver doctor` should end
with:

```text
  OK   node ws://127.0.0.1:26510 (simnet)  rusty-kaspad 2.1.0 at ws://127.0.0.1:26510 (simnet), proven by what it reports: network, version, not the simulator; and synced; no container or image checked
  OK   silver.compile.v1  ready
  OK   silver.p2sh.deploy-spend.v1  ready
  OK   toccata.covenant.auth-1to1-transition.v1  ready
  MISS silver runner (experimental, optional)  SILVER_RUNNER_NOT_CONFIGURED: …
```

The runner line is optional: deploy, spend and covenants do not use it (see
[What is not covered](#what-is-not-covered)).

## Part 1 · A signed contract: deploy and spend

### The contract

Save as `contracts/signed-release.sil`:

```text
pragma silverscript ^0.1.0;

contract SignedRelease(pubkey owner) {
    entry release(sig ownerSig) {
        require(checkSig(ownerSig, owner));
    }
}
```

Whoever holds `owner`'s key can release the funds locked in it.

### Constructor arguments

`owner` is a 32-byte x-only public key, given to the compiler as a list of
bytes (`{"kind": "bytes", "value": [ … ]}`; a hex string is refused with
`SILVER_VALUE_INVALID`). The workspace keeps each account's compressed public
key in `.hardkas/accounts.real.json`; the x-only key is that key without its
first byte. Save this helper as `owner-args.mjs` in the project folder:

```javascript
// Writes SignedRelease's constructor arguments for one account of this workspace:
// its x-only public key (the compressed key without its first byte) as a list of bytes.
// Usage: node owner-args.mjs <account> <out.json>
import fs from "node:fs";

const [name, out] = process.argv.slice(2);
const store = JSON.parse(fs.readFileSync(".hardkas/accounts.real.json", "utf8"));
const account = store.accounts.find((a) => a.name === name);
if (!account) throw new Error(`no account '${name}' in .hardkas/accounts.real.json`);
const xOnly = Buffer.from(account.publicKey, "hex").subarray(1);
fs.writeFileSync(out, JSON.stringify([{ kind: "bytes", value: [...xOnly] }]));
console.log(`${out}: owner = ${name} (${xOnly.toString("hex")})`);
```

```bash
node owner-args.mjs alice contracts/owner.args.json
```

### Compile

```bash
npx hardkas silver compile contracts/signed-release.sil --args contracts/owner.args.json --network simnet --out contracts/signed-release.compile.json
npx hardkas silver verify contracts/signed-release.compile.json --args contracts/owner.args.json
```

```text
Compiled with silverc v1.0.0 (ce1e0ef5f1f415f371d3d2426e788597a388635da8cbe93e72e95a4f754b29af)
  SignedRelease  kaspasim:pzz7sfdml5ud9av3vvtykrwkk5jsnf32mak0eat5lej8ddvswsmx6cmv5mjlq
    entries: release#388ad0b4
REPRODUCED 43412350e5546006587cc0a3a13094d46060bfb5149434927b8f5edd4c822e06 with silverc v1.0.0
```

The compile record names the compiler (release, binary SHA-256), the source and
argument digests and the contract's P2SH address. `silver verify` recompiles and
checks that the record reproduces byte for byte.

### Deploy

```bash
npx hardkas silver deploy contracts/signed-release.compile.json --from alice --amount 1 --network simnet --password-env HARDKAS_PASSWORD --wait
```

```text
Deployed SignedRelease at kaspasim:pzz7sfdml5ud9av3vvtykrwkk5jsnf32mak0eat5lej8ddvswsmx6cmv5mjlq
  tx d338b6a03d40ee1d003cc286466c4842edbbe48b601fd7e4ba6cc5b9c317bec2 (confirmed), 100000000 sompi, fee 1000100
record: .hardkas\artifacts\silver\silverDeploy-b9a8165e609c5d7d.json
```

With `--wait`, `(confirmed)` (and `status: "confirmed"` in the record) means the
node's UTXO index lists the new output: the node accepted the transaction into
its chain view. It is **not** the payment flow's `CONFIRMED`, which needs 100
blue-score confirmations ([receipts and levels](./receipts-and-levels.md)); for
that depth, run `npx hardkas artifact verify <record> --url <node> --require consensus`.

Deploy funds the contract's P2SH output from `alice` with a transaction v0 (the
certified default; `--tx-version 1` uses the SDK's v1 engine instead). Note the
deploy record's path: the spend takes it.

### Spend

Save as `contracts/release.args.json` (the entry's `ownerSig` is signed by
`alice` at spend time):

```json
[{ "kind": "signature", "account": "alice" }]
```

```bash
npx hardkas silver spend .hardkas/artifacts/silver/silverDeploy-<id>.json --entry release --to <alice-address> --args contracts/release.args.json --password-env HARDKAS_PASSWORD --wait
```

```text
Spent SignedRelease.release -> kaspasim:qz2n6hxsqq6qptaegap325q7p33ny7hf47f2fdtsja70wjqk5jcpce2myljaa
  tx 9aa8b937a3521d116a735bcdea0c1036db80c22991eaaf1a4c9c3d73518e2a83 (confirmed), 99824800 sompi, fee 175200
record: .hardkas\artifacts\silver\silverSpend-ecc5c723b04e63f8.json
```

`--to` takes an address (`npx hardkas accounts list` shows `alice`'s). The node
ran the contract's script, which checked `alice`'s signature against `owner`.

## Part 2 · A covenant: genesis and transition

A Toccata covenant binds an output to a covenant id that follows it from one
transaction to the next. This one is a counter: each transition must carry
`value + delta` forward, with `delta > 0`.

### The covenant

Save as `contracts/counter.sil`:

```text
pragma silverscript ^0.1.0;

contract Counter(int init_value) {
    int value = init_value;

    #[covenant(binding = auth, from = 1, to = 1, mode = transition)]
    function bump(State prev_state, int delta) : (State) {
        require(delta > 0);
        return(State { value: prev_state.value + delta });
    }
}
```

and its starting value as `contracts/counter.args.json`:

```json
[{ "kind": "int", "value": 7 }]
```

### Compile and create (genesis)

```bash
npx hardkas silver compile contracts/counter.sil --args contracts/counter.args.json --network simnet --out contracts/counter.compile.json
npx hardkas silver covenant genesis contracts/counter.compile.json --from alice --amount 10 --compute-budget 10 --fee 1000000 --network simnet --password-env HARDKAS_PASSWORD --wait
```

```text
Covenant created Counter 78ebb2e3735b22d93fdcc1526221e7dcfb0c4d9b8e111552ec6f5def6a0b30c9
  tx 64e653078a46a5e42215e4178dec1cedf6246940644630189c09cb04839ebda1 (confirmed), 1000000000 sompi, fee 1000000
record: .hardkas\artifacts\silver\silverCovenant-24884056f65331c1.json
```

Genesis is a transaction v1. The covenant id is the one the SDK derives; with
`--wait` the record also keeps the id the node reports (`covenantIdFromNode`),
and in the test run both were the same. `--compute-budget 10` covers the
funding input's signature check, and the fee is explicit (HardKAS does not price
v1 compute budgets): these are the values the corpus run proved on a real node.
With 10 KAS locked, a 0.01 KAS fee clears the node's minimum.

### Advance it (transition 7 → 12)

Save the next state as `contracts/counter.next-state.json` and the entry's
argument as `contracts/bump.args.json`:

```json
{ "value": { "kind": "int", "value": 12 } }
```

```json
[{ "kind": "int", "value": 5 }]
```

`--state-map` maps the state field to the constructor parameter it comes from.
The simplest form, on every shell, is the path of a JSON file holding it (for
example `contracts/counter.state-map.json` with `{"value":0}`). Inline JSON also
works; quote it for your shell:

| Shell | `--state-map` argument |
| :-- | :-- |
| bash / zsh, PowerShell 7.3+ | `'{"value":0}'` |
| Windows PowerShell 5.1 | `'{\"value\":0}'` |
| Windows `cmd` | `"{\"value\":0}"` |

bash / zsh:

```bash
npx hardkas silver covenant transition .hardkas/artifacts/silver/silverCovenant-<id>.json --policy bump --constructor-args contracts/counter.args.json --state-map '{"value":0}' --next-state contracts/counter.next-state.json --args contracts/bump.args.json --compute-budget 0 --emit-args contracts/counter.next-args.json --password-env HARDKAS_PASSWORD --wait
```

```text
Covenant advanced Counter.bump 78ebb2e3735b22d93fdcc1526221e7dcfb0c4d9b8e111552ec6f5def6a0b30c9
  tx d8fea01b6c8473ffef15b722a3db2b7c7e16ab1857badfeb1727ed5a4c35149e (confirmed), successor kaspasim:pzdzrdpjj4yt94nlv22z6e0txt0ay5386l0h4lxt8f0fhwfzugdvg7qze9dl5
record: .hardkas\artifacts\silver\silverCovenant-101f8b0336b6fe5c.json
```

The covenant record is the genesis record printed above. The successor's state
is compiled by silverc; the fee comes out of the covenant's value; the same
covenant id carries over. `--emit-args` writes the successor's constructor
arguments (`[{"kind":"int","value":12}]`): pass them with `--constructor-args`
and the new record to the next transition.

### Inspect and verify

```bash
npx hardkas silver covenant inspect <covenantId> --network simnet
npx hardkas artifact verify .hardkas/artifacts/silver --recursive
```

```text
covenant 78ebb2e3735b22d93fdcc1526221e7dcfb0c4d9b8e111552ec6f5def6a0b30c9  VERIFIED
  genesis 64e653078a46a5e42215e4178dec1cedf6246940644630189c09cb04839ebda1 (anchor verified) · 1 transition(s)
  tip d8fea01b…149e:0 999928100 sompi at kaspasim:pzdzrdpjj4yt94nlv22z6e0txt0ay5386l0h4lxt8f0fhwfzugdvg7qze9dl5: unspent state {"value":{"kind":"int","value":"12"}} (address-commits)

  ✔ Audit Complete: All 5 artifacts verified.
```

`inspect` rebuilds the lineage from this workspace's own records, anchors it by
recomputing the genesis covenant id, and checks the tip against the node's
unspent outputs. The node has no query by covenant id, so a transition this
workspace did not record is seen only by its effect.

## What is not covered

- **Covenant shapes other than 1:1** (1:N fan-out, N:M, termination) and the
  KCC-20 example transfer: built by the SDK's v1 engine only (`hardkas.covenants`,
  `hardkas silver engine`), proven on a real simnet node by the repository's
  node suite, and not available as `silver covenant` commands
  ([Covenants status](../status/covenants-status.md)).
- **What a policy computes** (a `require`, conservation of amounts): HardKAS
  does not evaluate it before sending; the node does, and refuses a violation.
- **`silver test`, `silver debug`, `silver preflight`**: they run the
  SilverScript runner (`cli-debugger`), which upstream does not publish as a
  binary. A local build is labelled UNVERIFIED and runs only with
  `--allow-unverified-runner`; its verdicts are never a node's acceptance.
- **Testnet-10 and mainnet**: not evidenced for these commands; mainnet is
  refused.

## Next

- [Reading receipts and verification levels](./receipts-and-levels.md)
- [What works in this release](./what-works.md)
