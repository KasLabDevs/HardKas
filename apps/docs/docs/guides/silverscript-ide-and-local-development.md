---
title: SilverScript IDE & Local Development
description: Write, compile and run SilverScript contracts locally with the official silverc compiler, a simnet node and HardKAS.
sidebar_label: SilverScript IDE & Local Dev
sidebar_position: 2
---

# SilverScript: Local Development

**SilverScript** is Kaspa's language for L1 contracts and covenants. It compiles to Kaspa script that locks UTXOs; there is no virtual machine and no contract storage. A covenant's "state" is carried by the next UTXO it creates.

## The stack

1. **The protocol.** Toccata, active on Kaspa mainnet since 30 June 2026. The node validates covenant opcodes, signatures and mass.
2. **The compiler.** `silverc` v1.0.0, the official release (9 September 2026). It turns `.sil` source into script and an ABI.
3. **HardKAS.** It installs the pinned `silverc`, compiles through it, deploys and spends on a node you run, and writes verifiable records of each step. It never signs, sends or connects to mainnet in this release.
4. **Experimental.** vProgs is an inspect-only research surface, not part of this workflow.

## Browser IDE or local workflow

| | SilverScript Studio (web) | HardKAS (local) |
|---|---|---|
| Best for | Learning, quick experiments | Repeatable tests, CI, evidence |
| Runs against | Public endpoints | Your own simnet node in Docker |
| Output | Session state in the browser | Compile, deploy, spend and covenant records you can verify offline |

The [HardKAS IDE](https://github.com/KasLabDevs/HardKasIDE) is a separate desktop workbench built on the same CLI.

## Set up

```bash
mkdir kaspa-covenants-lab && cd kaspa-covenants-lab
npx @hardkas/cli@0.13.0-rc.2 init .
npm install
npx hardkas toolchain install silverc
npx hardkas silver doctor --network simnet
```

`toolchain install silverc` downloads the official `silverc` v1.0.0 asset for your platform and checks its SHA-256. `silver doctor` checks the compiler and your node (see [Run your own simnet node](https://github.com/KasLabDevs/HardKas/blob/main/docs/start/simnet-node.md)).

## A first contract

Save as `contracts/signed-release.sil`:

```text
pragma silverscript ^0.1.0;

contract SignedRelease(pubkey owner) {
    entry release(sig ownerSig) {
        require(checkSig(ownerSig, owner));
    }
}
```

Compile it with its constructor arguments, then check that the record reproduces:

```bash
npx hardkas silver compile contracts/signed-release.sil --args contracts/owner.args.json --network simnet --out contracts/signed-release.compile.json
npx hardkas silver verify contracts/signed-release.compile.json --args contracts/owner.args.json
```

The compile record names the compiler release and binary hash, the source and argument digests, and the contract's P2SH address.

Then deploy and spend it on your node:

```bash
npx hardkas silver deploy contracts/signed-release.compile.json --from alice --amount 1 --network simnet --password-env HARDKAS_PASSWORD --wait
npx hardkas silver spend .hardkas/artifacts/silver/silverDeploy-<id>.json --entry release --to <address> --args contracts/release.args.json --password-env HARDKAS_PASSWORD --wait
```

How to write the constructor arguments, a covenant example (genesis and transition), and real output from a node are in [SilverScript and covenants on your simnet](https://github.com/KasLabDevs/HardKas/blob/main/docs/start/silverscript-covenants.md).

## Testing

See [Testing Kaspa Covenants](./testing-kaspa-covenants.md). In short:
- the simulator does not execute Kaspa script, so covenant logic is tested on a simnet node;
- a refusal is tested by sending the breaking transaction and asserting that the node rejects it.

## Limits

1. **Timelocks.** HardKAS builds relative timelocks (sequence locks) and refuses to send one before it is met. It does not build absolute lock times (`checkLockTime`).
2. **What a policy computes** is evaluated by the node, not by HardKAS before sending.
3. **Covenant shapes.** `silver covenant` commands cover 1:1 transitions. Other shapes (1:N, N:M, termination) are built by the SDK's v1 engine (`sdk.covenants`) and proven by the repository's node suite only.
4. **Mainnet** is locked down in this release: no connection (reads included), no signing, no broadcast, and no flag enables it (`MAINNET_CONNECTION_DISABLED`, `MAINNET_SIGNING_DISABLED`, `MAINNET_BROADCAST_DISABLED`). SilverScript on mainnet is `SILVERSCRIPT_MAINNET_NOT_ENABLED`.

## Related

- [Official SilverScript compiler](https://github.com/kaspanet/silverscript)
- [SilverScript Studio (browser IDE)](https://silverscriptstudio.com)
- [Testing Kaspa Covenants](./testing-kaspa-covenants.md)
- [Execution contracts & evidence](../concepts/execution-contract.md)
