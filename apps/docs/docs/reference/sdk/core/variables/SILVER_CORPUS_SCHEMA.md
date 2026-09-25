[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / SILVER\_CORPUS\_SCHEMA

# Variable: SILVER\_CORPUS\_SCHEMA

> `const` **SILVER\_CORPUS\_SCHEMA**: `"hardkas.silverCorpus.v1"` = `"hardkas.silverCorpus.v1"`

Defined in: [packages/core/src/silverscript-corpus.ts:31](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/silverscript-corpus.ts#L31)

SilverScript golden corpus: cases produced by real execution against the
verified canonical node, checked offline.

Verification proves, without a node: that every artifact is what the pinned
official silverc produces from the recorded source and constructor
arguments (recompiled here, byte for byte); that locks, addresses and
covenant ids are what the SDK derives from those artifacts; and that each
case's evidence names the verified reference node, its capabilities and the
classified outcome of every control. It re-executes nothing on chain.
