---
title: Compile and verify a SilverScript contract
description: What a HardKAS compile record holds, why it records digests instead of constructor arguments, and how silver verify reproduces it byte for byte.
---

# Compile and verify a SilverScript contract

A Kaspa node validates only the compiled Kaspa Script, never the `.sil` source. Whoever relies on a SilverScript
contract therefore trusts that the script matches the source: this is **compiler trust**. HardKAS makes that trust
checkable: every compilation goes through a pinned compiler and leaves a record anyone can reproduce.

The hands-on version (writing the constructor arguments, real output) is Part 1 of
[SilverScript and covenants on your simnet](../../start/silverscript-covenants.md#compile).

## The pinned compiler

```bash
hardkas toolchain install silverc
hardkas silver doctor --network simnet
```

`toolchain install silverc` downloads the official `silverc` v1.0.0 release asset for your platform and checks it against
the SHA-256 HardKAS pins. silverc then starts from a verified private copy of those bytes, never from the toolchain path.
HardKAS keeps the compiler version fixed: a newer upstream release is not used until HardKAS pins it.

## The compile record

```bash
hardkas silver compile contracts/signed-release.sil --args contracts/owner.args.json --network simnet --out contracts/signed-release.compile.json
```

The record (`silver.compile.v1`, written under `.hardkas/artifacts/silver/` unless `--out` names a path) holds:

- **the source**: its path, its text and its SHA-256;
- **the provenance** (`hardkas.silver.compileProvenance.v1`): the compiler's repository, release tag, commit, asset and
  binary SHA-256 and language version; the source digest; the **digest** of the constructor arguments; the digest of the
  compiled artifact; and per contract the bytecode digest, the template hash and each entry's dispatch tag;
- **the compiled artifact** (silverc's JSON, as produced);
- **per contract**: its entries, its covenant policies, its P2SH locking script and its P2SH address on the record's
  network.

Constructor arguments are recorded by digest only, because they may carry private material: keep the arguments file, since
`silver verify` and the covenant commands ask for it again (`--args`, `--constructor-args`). The provenance has no
timestamp: the same inputs always give the same provenance.

`hardkas silver inspect <record>` prints the contracts, entries (with their parameters and dispatch tags) and state fields
of a record.

## Reproducing a record (`silver verify`)

```bash
hardkas silver verify contracts/signed-release.compile.json --args contracts/owner.args.json
```

`silver verify` checks, without trusting the record:

1. that the source text in the record matches its recorded digest;
2. that the arguments you pass are the ones compiled (their digest);
3. that the managed silverc, run again on that source and those arguments, produces the same artifact byte for byte, with
   the recorded compiler binary;
4. that each contract's locking script is the P2SH script of its bytecode, and its address that script's address on the
   record's network.

It prints `REPRODUCED <artifact sha256> with silverc v1.0.0`, or lists the problems and fails with `SILVER_VERIFY_FAILED`.

## Before deploying: `silver audit`

```bash
hardkas silver audit contracts/signed-release.compile.json
```

`silver audit` runs heuristic rules over the source or the record (authorization, value, inputs, signature operations,
lock times, compute budget). Its findings are things to review, not a proof of security: the counter used in the
covenant examples, for instance, has no signature and no value check, and `silver audit` reports it (`COV-VALUE-001`).

## Deployed is not running

Deploying a contract on Kaspa means sending a transaction that creates its P2SH output (`hardkas silver deploy`); spending
it means satisfying one of its entries (`hardkas silver spend`). A deployed contract is an output with spending
conditions, not a service on the chain, and a covenant's state lives in the outputs it creates
([the covenant model](./covenant-model.md)).

## Related

- [SilverScript and Toccata covenants](./index.md)
- [Testing Kaspa covenants](../testing-kaspa-covenants.md)
- [`hardkas silver` in the CLI reference](../../reference/cli.md#hardkas-silver)
