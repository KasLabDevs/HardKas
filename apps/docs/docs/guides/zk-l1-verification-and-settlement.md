---
title: ZK L1 Proof Verification & Toccata Script Building
description: Practical guide to verifying Groth16 proofs mathematically, rejecting weak trapdoor keys, and building Kaspa Toccata L1 OpZkPrecompile scripts with HardKAS.
sidebar_label: ZK L1 Verification & Scripts
sidebar_position: 4
---

# ZK L1 Proof Verification & Toccata Script Building

HardKAS provides first-class CLI and SDK tooling for working with Zero-Knowledge proofs targeting Kaspa Layer 1 (`OpZkPrecompile` / KIP-16).

Every ZK operation in HardKAS separates **structural fixture coherence**, **cryptographic BN254 pairing verification**, and **Toccata L1 script construction** so that developers never confuse a structural mock with a real cryptographic check.

---

## 1. Cryptographic Groth16 Verification (`verify-math`)

To perform a full BN254 Groth16 elliptic-curve pairing check on a proof artifact:

```bash
hardkas zk proof verify-math fixtures/toccata-v2/zk/valid-groth16.json --json
```

### Enforcing Verification Key Pinning & Trapdoor Protection

In production or audit pipelines, always pin the expected domain-separated SHA-256 digest of your circuit's verification key (`--expect-vk-hash`):

```bash
hardkas zk proof verify-math ./my-proof.json --expect-vk-hash <64-char-sha256> --timeout 10000 --json
```

HardKAS automatically inspects the verification key's G2 points (`vk_gamma_2`, `vk_delta_2`) and rejects known trapdoor/generator keys (`ZK_WEAK_VERIFICATION_KEY`) where discrete logarithms are trivially known, preventing forged proofs from passing verification.

### Using the TypeScript SDK (`@hardkas/sdk`)

```typescript
import { verifyZkProofMath, inspectZkProof } from '@hardkas/sdk';

// 1. Inspect proof metadata and canonical digests
const inspection = await inspectZkProof('./fixtures/toccata-v2/zk/valid-groth16.json', process.cwd());

// 2. Run cryptographic BN254 Groth16 pairing check bound to fixture hashes
const verification = await verifyZkProofMath(
  './fixtures/toccata-v2/zk/valid-groth16.json',
  process.cwd(),
  {
    timeoutMs: 10_000,
    mathOnly: false,
    allowWeakVerificationKey: false,
  }
);

if (!verification.ok) {
  throw new Error(`ZK verification failed: ${JSON.stringify(verification.issues)}`);
}
```

---

## 2. Inspecting Toccata L1 `OpZkPrecompile` Rules

Before constructing a ZK-gated UTXO script, query the canonical Toccata L1 precompile parameters (`0xa8` opcode, `0x20` R0Groth16 tag, sig-op weight, and compute gram costs):

```bash
hardkas zk toccata rules --json
```

Or programmatically from `@hardkas/sdk`:

```typescript
import { getToccataPrecompileRules } from '@hardkas/sdk';

const rules = getToccataPrecompileRules();
console.log(rules.opcodeHex);        // "0xa8" (OpZkPrecompile)
console.log(rules.tagHex);           // "0x20" (R0Groth16)
console.log(rules.computeGramCost);  // 75000
```

---

## 3. Building Toccata L1 ZK Covenant Scripts (`build-scripts`)

HardKAS integrates `kaspa-wasm`'s `ZkScriptBuilder` to generate canonical P2SH redeem scripts and unlocking signature scripts for RISC Zero Groth16 proofs:

```bash
hardkas zk toccata build-scripts \
  --image-id aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899 \
  --journal-hash 1122334455667788990011223344556677889900112233445566778899001122 \
  --receipt ./seal.hex \
  --json
```

### Programmatic Script Construction in TypeScript

```typescript
import { buildR0Groth16Scripts } from '@hardkas/sdk';

const scriptBundle = buildR0Groth16Scripts({
  imageId: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
  journalHash: '1122334455667788990011223344556677889900112233445566778899001122',
  receiptHex: '<r0-groth16-receipt-hex>',
});

if (scriptBundle.ok) {
  console.log('Redeem Script:', scriptBundle.redeemScriptHex);
  console.log('P2SH ScriptPublicKey:', scriptBundle.scriptPublicKeyHex);
  console.log('Signature Script:', scriptBundle.signatureScriptHex);
}
```

---

## 4. Verifying a Complete ZK Corpus in CI

To validate every positive and adversarial ZK fixture in your workspace during continuous integration:

```bash
hardkas zk corpus verify fixtures/toccata-v2/zk --json
```

---

## Related Documentation

- [ZK Primitives & Sequencing (KIP-16 / KIP-21)](../concepts/toccata/zk-and-sequencing.md)
- [Testing Kaspa Covenants with HardKAS](./testing-kaspa-covenants.md)
- [`hardkas zk` CLI Reference](../reference/cli/zk.md)
