[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ESCROW\_FULL\_SOURCE

# Variable: ESCROW\_FULL\_SOURCE

> `const` **ESCROW\_FULL\_SOURCE**: "pragma silverscript ^0.1.0;\n\ncontract EscrowFull(\n    pubkey buyer,\n    pubkey seller,\n    pubkey arbiter,\n    byte\[\] buyerSpk,\n    byte\[\] sellerSpk,\n    int principal,\n    byte\[\] escrowNonce\n) \{\n    entry releaseToSeller(sig sellerSig, sig arbiterSig) \{\n        require(checkSig(sellerSig, seller));\n        require(checkSig(arbiterSig, arbiter));\n        require(escrowNonce.length == 32);\n        require(tx.outputs.length == 1);\n        require(tx.outputs\[0\].scriptPubKey == sellerSpk);\n        require(tx.outputs\[0\].value == principal);\n    \}\n\n    entry refundBuyer(sig buyerSig, sig arbiterSig) \{\n        require(checkSig(buyerSig, buyer));\n        require(checkSig(arbiterSig, arbiter));\n        require(escrowNonce.length == 32);\n        require(tx.outputs.length == 1);\n        require(tx.outputs\[0\].scriptPubKey == buyerSpk);\n        require(tx.outputs\[0\].value == principal);\n    \}\n\n    entry mutualRelease(sig buyerSig, sig sellerSig) \{\n        require(checkSig(buyerSig, buyer));\n        require(checkSig(sellerSig, seller));\n        require(escrowNonce.length == 32);\n        if (tx.outputs.length == 1) \{\n            require(tx.outputs\[0\].value == principal);\n            require(tx.outputs\[0\].scriptPubKey == buyerSpk \|\| tx.outputs\[0\].scriptPubKey == sellerSpk);\n        \} else \{\n            require(tx.outputs.length == 2);\n            require(tx.outputs\[0\].scriptPubKey == buyerSpk);\n            require(tx.outputs\[1\].scriptPubKey == sellerSpk);\n            require(tx.outputs\[0\].value + tx.outputs\[1\].value == principal);\n        \}\n    \}\n\}\n"

Defined in: packages/sdk/src/escrow-core/escrow-source.ts:16

EscrowFull: Two-of-three escrow on a single P2SH output for a single principal.
Every arbiter-assisted branch pays the 100% principal to one destination.
Mutual release allows amicable settlement where outputs sum exactly to principal.
Committed escrowNonce guarantees unique P2SH address per order.
