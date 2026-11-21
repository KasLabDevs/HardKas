[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / ESCROW\_SPLIT\_SOURCE

# Variable: ESCROW\_SPLIT\_SOURCE

> `const` **ESCROW\_SPLIT\_SOURCE**: "pragma silverscript ^0.1.0;\n\ncontract EscrowSplit(\n    pubkey buyer,\n    pubkey seller,\n    pubkey arbiter,\n    byte\[\] buyerSpk,\n    byte\[\] sellerSpk,\n    int buyerAmount,\n    int sellerAmount,\n    byte\[\] escrowNonce\n) \{\n    entry executeSplit(sig partySig, sig arbiterSig) \{\n        require(checkSig(arbiterSig, arbiter));\n        require(checkSig(partySig, buyer) \|\| checkSig(partySig, seller));\n        require(escrowNonce.length == 32);\n        require(tx.outputs.length == 2);\n        require(tx.outputs\[0\].scriptPubKey == buyerSpk);\n        require(tx.outputs\[0\].value == buyerAmount);\n        require(tx.outputs\[1\].scriptPubKey == sellerSpk);\n        require(tx.outputs\[1\].value == sellerAmount);\n    \}\n\n    entry fullRefund(sig buyerSig, sig arbiterSig) \{\n        require(checkSig(buyerSig, buyer));\n        require(checkSig(arbiterSig, arbiter));\n        require(escrowNonce.length == 32);\n        require(tx.outputs.length == 1);\n        require(tx.outputs\[0\].scriptPubKey == buyerSpk);\n        require(tx.outputs\[0\].value == buyerAmount + sellerAmount);\n    \}\n\n    entry fullRelease(sig sellerSig, sig arbiterSig) \{\n        require(checkSig(sellerSig, seller));\n        require(checkSig(arbiterSig, arbiter));\n        require(escrowNonce.length == 32);\n        require(tx.outputs.length == 1);\n        require(tx.outputs\[0\].scriptPubKey == sellerSpk);\n        require(tx.outputs\[0\].value == buyerAmount + sellerAmount);\n    \}\n\n    entry mutualRelease(sig buyerSig, sig sellerSig) \{\n        require(checkSig(buyerSig, buyer));\n        require(checkSig(sellerSig, seller));\n        require(escrowNonce.length == 32);\n        require(tx.outputs.length == 2);\n        require(tx.outputs\[0\].scriptPubKey == buyerSpk);\n        require(tx.outputs\[1\].scriptPubKey == sellerSpk);\n        require(tx.outputs\[0\].value + tx.outputs\[1\].value == buyerAmount + sellerAmount);\n    \}\n\}\n"

Defined in: packages/sdk/src/escrow-core/escrow-source.ts:67

EscrowSplit: Two-of-three escrow with two pre-allocated target amounts.
Arbitrated executeSplit distributes both amounts simultaneously (2 outputs).
Full refund or release awards total deposit (1 output).
