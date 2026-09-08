---
title: Real L1 Transaction Validated
status: COMPLETED
date: 2026-07-01
---

# L1 Validation: Successful Execution

The HardKAS SDK has successfully achieved a full cycle of **Real L1 Transaction** flow against the official Kaspa node (`kaspanet/rusty-kaspad:latest`).

## Criterio de Cierre Alcanzado
- ✅ **Balance before**: Successfully fetched UTXOs from a real node.
- ✅ **Build**: Successfully constructed an `RpcTransaction` matching Kaspad 1.1.0 wRPC JSON schema exactly.
- ✅ **Sign**: Successfully signed with `kaspa-wasm`.
- ✅ **SubmitTransaction**: Handled strict serialization rules (e.g. `sequence` as Number, BigInt exclusion).
- ✅ **Txid Real**: Node accepted and returned a real Kaspa `transactionId`.
- ✅ **Confirmation**: Successfully mined the block containing the transaction.
- ✅ **Balance after**: Validated that the balance reflects the correct output values.

## System Capabilities Enabled
```json
{
  "realMinedUtxo": true,
  "realSigning": true,
  "realBroadcast": true,
  "realConfirmation": true,
  "mainnet": false
}
```

## Significance
This completely validates that HardKAS `TxBuilder`, `AddressManager`, and `KaspaSdkRealTxSigner` generate perfectly compatible outputs that the official Kaspa Rust node unconditionally accepts. The `submitTransaction` normalization handles JSON-RPC quirks securely and automatically.
