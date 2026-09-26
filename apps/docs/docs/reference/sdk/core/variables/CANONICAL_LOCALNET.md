[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / CANONICAL\_LOCALNET

# Variable: CANONICAL\_LOCALNET

> `const` **CANONICAL\_LOCALNET**: `object`

Defined in: [packages/core/src/node-identity.ts:29](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/node-identity.ts#L29)

Canonical real localnet: one lifecycle, managed by DockerKaspadRunner.

## Type Declaration

### containerName

> `readonly` **containerName**: `"hardkas-kaspad-toccata-v2"` = `"hardkas-kaspad-toccata-v2"`

### dataDir

> `readonly` **dataDir**: `".hardkas/kaspad"` = `".hardkas/kaspad"`

### host

> `readonly` **host**: `"127.0.0.1"` = `"127.0.0.1"`

### image

> `readonly` **image**: `"kaspanet/rusty-kaspad:v2.0.1@sha256:db36449e2f41cf33ab7c26683ce390cb71bdea9c403eefd2e740a7d5605bcd8b"` = `KASPAD_REFERENCE_IMAGE`

### imageDigest

> `readonly` **imageDigest**: `"sha256:db36449e2f41cf33ab7c26683ce390cb71bdea9c403eefd2e740a7d5605bcd8b"` = `KASPAD_REFERENCE_DIGEST`

### minerContainerName

> `readonly` **minerContainerName**: `"hardkas-toccata-miner"` = `"hardkas-toccata-miner"`

### network

> `readonly` **network**: `"simnet"` = `"simnet"`

### ports

> `readonly` **ports**: `object`

#### ports.borshRpc

> `readonly` **borshRpc**: `17210` = `17210`

#### ports.jsonRpc

> `readonly` **jsonRpc**: `18210` = `18210`

#### ports.rpc

> `readonly` **rpc**: `16210` = `16210`

### profile

> `readonly` **profile**: `"toccata-v2"` = `"toccata-v2"`

### serverVersion

> `readonly` **serverVersion**: `string`
