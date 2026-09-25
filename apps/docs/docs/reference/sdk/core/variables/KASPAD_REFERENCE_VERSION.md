[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / KASPAD\_REFERENCE\_VERSION

# Variable: KASPAD\_REFERENCE\_VERSION

> `const` **KASPAD\_REFERENCE\_VERSION**: `"v2.0.1"` = `"v2.0.1"`

Defined in: [packages/core/src/node-images.ts:8](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-images.ts#L8)

Single source of truth for the Docker images HardKAS runs.

The node is the latest official rusty-kaspa release HardKAS supports (v2.0.1, the
Toccata guide minimum), pinned by digest so every localnet, test harness and gauntlet
runs the same bytes. Change these only together with evidence of a new release.
