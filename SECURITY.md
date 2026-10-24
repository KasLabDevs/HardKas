# Security Policy

HardKAS is development tooling for Kaspa: a CLI, an SDK and the packages behind them. Its security controls protect keys, transaction artifacts, network identity and evidence on the developer's machine. This file explains how to report a weakness in them.

## Reporting a vulnerability

Do not report a vulnerability in a public issue, pull request or discussion.

Report it privately through GitHub's private vulnerability reporting: open this repository's **Security** tab and choose **Report a vulnerability**. Only you and the maintainers can see the report and the conversation about it.

Include what you can of:

- the version (`hardkas --version`) and the package or packages involved;
- the command, SDK call or file, and the steps that reproduce the problem;
- the impact: what an attacker gains, and under which conditions;
- your operating system and Node.js version.

Never put a real private key, mnemonic, keystore password or RPC credential in a report. When a key is needed to reproduce the problem, use a throwaway key on a local network.

## How reports are handled

- Reports are handled privately, in the advisory opened by the report, where you and the maintainers can discuss them.
- Disclosure is coordinated: the details stay private until a fixed version is released, or until you and the maintainers agree to publish them.
- Say in the report whether you want to be credited.
- There are no guaranteed response or fix times.

## Supported versions

HardKAS has not reached 1.0. Security fixes are made on the current development line and published in a new version; earlier versions are not patched. Use the latest published version.

## Scope

In scope: the code in this repository, including:

- how keys are generated, stored, unlocked and used (keystores, the development accounts, signing);
- the guards that refuse mainnet transactions, and the checks of a node's network and identity;
- the integrity of artifacts and evidence (content hashes, verification, tampering detection);
- what the CLI, the dashboard and the logs reveal (secret redaction, the dashboard's access token);
- reading and writing outside the `.hardkas/` workspace.

Out of scope:

- vulnerabilities in Kaspa itself (rusty-kaspa, kaspa-wasm), in Node.js or in third-party npm packages: report them to those projects. How HardKAS uses them is in scope;
- accounts stored in plaintext on purpose (`--unsafe-plaintext`, `localnet account create`) and the development accounts of a local node: they are unprotected by design and meant for local development only;
- private keys in this repository's test fixtures and test vectors: they are public on purpose;
- attacks that need a machine that is already compromised, or a malicious package installed in your project (see the [threat model](docs/status/threat-model.md)).

What HardKAS protects and what it does not: [security model](docs/concepts/security-model.md) and [security claims](docs/status/security-claims.md).
