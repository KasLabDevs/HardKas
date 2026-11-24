[**HardKAS SDK**](../../../README.md)

***

[HardKAS SDK](../../../README.md) / [sdk/src](../README.md) / HdWalletScan

# Interface: HdWalletScan

Defined in: [packages/sdk/src/hd-wallet.ts:76](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L76)

## Properties

### account

> `readonly` **account**: `number`

Defined in: [packages/sdk/src/hd-wallet.ts:80](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L80)

***

### gapLimit

> `readonly` **gapLimit**: `number`

Defined in: [packages/sdk/src/hd-wallet.ts:81](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L81)

***

### label

> `readonly` **label**: `string`

Defined in: [packages/sdk/src/hd-wallet.ts:78](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L78)

***

### network

> `readonly` **network**: `string`

Defined in: [packages/sdk/src/hd-wallet.ts:79](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L79)

***

### nextChange

> `readonly` **nextChange**: `number`

Defined in: [packages/sdk/src/hd-wallet.ts:94](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L94)

***

### nextReceive

> `readonly` **nextReceive**: `number`

Defined in: [packages/sdk/src/hd-wallet.ts:93](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L93)

The first index of each chain that is past every used and every handed-out address.

***

### scanned

> `readonly` **scanned**: `object`

Defined in: [packages/sdk/src/hd-wallet.ts:96](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L96)

How many addresses of each chain were asked.

#### change

> `readonly` **change**: `number`

#### receive

> `readonly` **receive**: `number`

***

### totalSompi

> `readonly` **totalSompi**: `bigint`

Defined in: [packages/sdk/src/hd-wallet.ts:90](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L90)

Sum of every UTXO the node lists for the wallet's addresses (covenant ones included), sompi.

***

### used

> `readonly` **used**: readonly [`HdWalletScanEntry`](HdWalletScanEntry.md)[]

Defined in: [packages/sdk/src/hd-wallet.ts:88](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L88)

BETA-FIX W2: every address the wallet's local index handed out (receive and change, up to the stored indices), with
zero balances where empty, plus any address past them that holds UTXOs; receive chain first, by index. (It listed
only the addresses holding UTXOs, so a used address that was emptied disappeared.) Filter `utxoCount > 0` for the
funded ones.

***

### utxoCount

> `readonly` **utxoCount**: `number`

Defined in: [packages/sdk/src/hd-wallet.ts:91](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L91)

***

### verified

> `readonly` **verified**: `boolean`

Defined in: [packages/sdk/src/hd-wallet.ts:98](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L98)

True when the wallet was opened with its password for this scan (addresses from authenticated keys).

***

### walletId

> `readonly` **walletId**: `string`

Defined in: [packages/sdk/src/hd-wallet.ts:77](https://github.com/KasLabDevs/HardKas/blob/bba613f3ee75889e713da1a9df5325e3e3524361/packages/sdk/src/hd-wallet.ts#L77)
