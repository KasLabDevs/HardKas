[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / Kcc20FeeSource

# Type Alias: Kcc20FeeSource

> **Kcc20FeeSource** = \{ `account`: `string`; `kind`: `"funder"`; \} \| \{ `kind`: `"token-change"`; `outputIndex`: `number`; \} \| \{ `account`: `string`; `kind`: `"sender-coins"`; \} \| \{ `kind`: `"explicit-outputs"`; \}

Defined in: [packages/sdk/src/kcc20.ts:191](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/kcc20.ts#L191)

Who pays a KCC-20 transfer's network fee (BETA-FIX W2). Never a recipient's output: the fee used to come out of the
first new output, the receiver's.
 - `funder`: the named funder's coins (P2PK fee inputs, change back to it); every output keeps its KAS.
 - `token-change`: no funder, and the transfer returns token change to the sender: that output keeps what the fee
   leaves of its share (the fee is the node's floor for the transaction).
 - `sender-coins`: no funder and no token change: the sender's own coins pay it (the sender is the funder).
 - `explicit-outputs`: no funder, no token change, no sender, and the caller set every output's KAS: the fee is what
   those outputs leave of the token inputs' KAS (held to the fee limit), as the caller chose.
Otherwise KCC20_FEE_SOURCE_REQUIRED (nothing is planned). Why each is a valid transfer: the KCC-20 reference program's
normal path checks the token amounts (conservation), owner and borrow schemes, the extension commitment and the
continuation count, never an output's KAS value (only its borrow path does); P2PK fee inputs and their change are not
covenant inputs or outputs, so they leave the covenant's counts untouched.
