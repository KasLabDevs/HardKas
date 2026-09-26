# Generating Real Accounts

To interact with Localnet, Testnet, or Mainnet, you cannot use Simulator synthetic accounts. You must generate **Real Accounts** possessing true cryptographic entropy.

## Using the CLI

Use the `hardkas accounts real generate` command to create accounts backed by a real Kaspa Private Key.

```bash
# Generate a real account for Alice on Localnet (simnet)
hardkas accounts real generate --name alice --network simnet

# Output:
# Enter password to encrypt 1 new account(s): ****
# Generated 1 real dev account(s)
# Name:    alice
# Address: kaspasim:qr...
```

HardKAS encrypts the private key and stores it in `.hardkas/keystore/`. A reference is saved in `.hardkas/accounts.real.json`.

### The `--unsafe-plaintext` Flag

If you are running disposable local tests (Localnet/CI) and do not want to deal with password prompts during automated scripts, you can bypass encryption:

```bash
hardkas accounts real generate --name alice --network simnet --unsafe-plaintext --yes
```

> **[SECURITY WARNING]** 
> This writes the raw 64-character private key directly into `.hardkas/accounts.real.json`. Anyone with file access can steal it. Never use this for Testnet/Mainnet accounts.

## Using the SDK

You can also resolve or generate accounts programmatically.

```typescript
import { Hardkas } from "@hardkas/sdk";

async function main() {
  const sdk = await Hardkas.open();

  // Resolves 'alice' based on the current execution target in hardkas.config.ts
  const alice = await sdk.accounts.resolve("alice");

  console.log(`Account Kind: ${alice.kind}`); 
  // Outputs "synthetic" if targeting Simulator
  // Outputs "kaspa" if targeting Localnet and a real keypair was generated
  
  console.log(`Address: ${alice.address}`);
}
```

## Account Collisions

If you generate a real account named `"alice"`, it will **overshadow** the default synthetic `"alice"` when running against Localnet. 
However, if you switch your config back to `mode: "simulator"`, the resolver will return the synthetic `kaspa:sim_alice` instead. 

**An account name is an environment-dependent alias, not a global identity.**
