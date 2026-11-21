---
title: Accounts
description: The accounts HardKAS signs with - simulator accounts, simnet development accounts and real keystore accounts - and how to create, import and list them.
---

# Accounts

An account name such as `alice` is an alias that resolves in the world the command runs on (the simulator, simnet,
testnet). It is not a global identity: the same name can mean a synthetic simulator account in one world and a real
key in another.

| Account | Network | Key | Created by |
|---------|---------|-----|------------|
| Simulator accounts `alice`…`erin` | `simulated` | none: synthetic authorization | `hardkas init` |
| Development accounts `alice`…`erin` | `simnet` | deterministic, from a public seed | `hardkas localnet start` |
| Real accounts | `simnet`, `testnet-10` | random, in an encrypted keystore | `hardkas accounts real generate` or `import` |
| An external address | any | held outside HardKAS | an address given instead of an account name |

Mainnet is locked down: no mainnet key is generated or imported (`MAINNET_SIGNING_DISABLED`), and nothing connects to
mainnet.

```bash
hardkas accounts list
hardkas accounts balance alice --network simulated
```

`accounts list` shows each account's name, address and kind, and for a key whether it is encrypted or plaintext.

## Simulator accounts

`hardkas init` creates the simulator state, `.hardkas/localnet.json`, with five accounts, `alice`, `bob`, `carol`,
`dave` and `erin`, holding 1000 KAS each.

- They are synthetic (`kind: "synthetic"`): the account layer names them `kaspa:sim_<name>`, and the simulator state
  records each one under the `kaspasim:` address of the matching development key. Their UTXOs are synthetic.
- They hold no key. Signing writes a synthetic authorization, never a Kaspa signature.
- `hardkas simulator fund <name> --amount <kas>` adds synthetic UTXOs (the project's default network must be the
  simulator). `hardkas accounts fund` is deprecated.
- They exist only on the simulator: a simulator identity is refused on a node.

## Development accounts (simnet)

On `simnet` the same five names resolve to deterministic development keys (`kind: "kaspa"`, network `simnet`). Each
key is derived from a fixed seed in the HardKAS source, so the addresses are the same on every machine and in CI.

- `hardkas localnet start --toccata` writes their keystores to `.hardkas/dev-accounts/`, encrypted with a published
  development password: signing with them needs no password.
- `hardkas localnet start --toccata --seed` gives each empty one 100 KAS from the localnet Treasury;
  `hardkas localnet fund <name>` mines to one (`--treasury` transfers from the Treasury instead).
- `hardkas dev accounts list` lists them; `hardkas dev accounts reveal <alias>` prints a key (simnet only).

> [!WARNING]
> Deterministic development keys are a testing convenience, not custody. Their seed is public, so anyone can derive
> them. Use them on your own local node only, and never send real funds to an address derived from them.

## Real accounts

A real account has a random key made by the pinned Kaspa SDK. Use one for your own simnet work and for testnet.

```bash
export PW=<keystore password>
hardkas accounts real generate --name ana --network simnet --password-env PW
hardkas accounts real generate --name tn-payer --network testnet-10 --password-env PW
```

- The key is encrypted (Argon2id and AES-256-GCM) in `.hardkas/keystore/<name>.json`; the account (name, address,
  network, keystore reference) is recorded in `.hardkas/accounts.real.json`.
- The password comes from `--password-env <VAR>` or `--password-stdin`; without either, `generate` prompts for it.
  `tx sign` (and the one-step `tx send --from`) read it the same way.
- `--count <n>` makes several accounts, numbered after `--name`. `--ecdsa` makes an ECDSA account (its address is the
  key's ECDSA address); the default is Schnorr.
- `hardkas accounts real change-password <name>` changes the password.

To bring a key you already have, import it. Read the key from an environment variable or stdin, never from the command
line (`--private-key` is deprecated: it can leak through the shell history):

```bash
export PK=<private key hex>
hardkas accounts real import --name payer --address <address> --network simnet --private-key-env PK --password-env PW
```

`--network` defaults to the address's own (`kaspasim:` is simnet, `kaspadev:` devnet); a `kaspatest:` address needs
`--network testnet-<n>` (or a workspace that names the testnet). A mainnet network or address is refused
(`MAINNET_SIGNING_DISABLED`).

### Plaintext keys (local nodes only)

For disposable local runs and scripts you can skip the password:

```bash
hardkas accounts real generate --name miner --unsafe-plaintext --yes
```

> [!CAUTION]
> `--unsafe-plaintext` writes the raw private key into `.hardkas/accounts.real.json`. Anyone who can read that file
> has the key. Use it for a local node only, never for testnet. A plaintext mainnet key is always refused.

`hardkas localnet account create <name>` makes the same kind of plaintext simnet account.

## Name collisions

A real account named like a preset (`alice`) replaces the preset of that name in the workspace's account list, on
every world the workspace runs, the simulator included. Give real accounts their own names (`miner`, `ana`).

## From the SDK

`sdk.accounts.resolve()` resolves a name or an address in the world the instance was opened on;
`sdk.accounts.list()` lists that world's accounts.

```ts
import { Hardkas } from "@hardkas/sdk";

async function main() {
  const sdk = await Hardkas.open({ network: "simulated" });
  try {
    const alice = await sdk.accounts.resolve("alice");
    console.log(alice.name, alice.kind, alice.address);

    for (const account of await sdk.accounts.list()) {
      console.log(account);
    }
  } finally {
    await sdk.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

On the simulator `alice.kind` is `"synthetic"`. Opened with `Hardkas.open({ network: "simnet" })`, the same call
returns the development key (`"kaspa"`), or your real account if you made one named `alice`. An address passed
instead of a name resolves as `"external-wallet"`: HardKAS knows the address, and signs only through an account name
whose key it holds.

See [Plan, sign and send a transaction](./transactions/plan-sign-send.md) for how each kind signs, and the
[security model](../concepts/security-model.md) for how keys are kept.
