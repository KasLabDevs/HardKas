[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ESCROW\_V1\_SOURCE

# Variable: ESCROW\_V1\_SOURCE

> `const` **ESCROW\_V1\_SOURCE**: "pragma silverscript ^0.1.0;\n\ncontract Escrow(\n    pubkey buyer,\n    pubkey seller,\n    pubkey arbiter,\n    byte\[\] buyerSpk,\n    byte\[\] sellerSpk,\n    int refundAmount,\n    int releaseAmount\n) \{\n    entry mutualRelease(sig buyerSig, sig sellerSig) \{\n        require(checkSig(buyerSig, buyer));\n        require(checkSig(sellerSig, seller));\n    \}\n\n    entry refundBuyer(sig buyerSig, sig arbiterSig) \{\n        require(checkSig(buyerSig, buyer));\n        require(checkSig(arbiterSig, arbiter));\n        require(tx.outputs.length == 1);\n        require(tx.outputs\[0\].scriptPubKey == buyerSpk);\n        require(tx.outputs\[0\].value == refundAmount);\n    \}\n\n    entry releaseToSeller(sig sellerSig, sig arbiterSig) \{\n        require(checkSig(sellerSig, seller));\n        require(checkSig(arbiterSig, arbiter));\n        require(tx.outputs.length == 1);\n        require(tx.outputs\[0\].scriptPubKey == sellerSpk);\n        require(tx.outputs\[0\].value == releaseAmount);\n    \}\n\}\n"

Defined in: packages/sdk/src/escrow-core/escrow-source.ts:121

Legacy v1 contract source for backward compatibility and safe recovery.
