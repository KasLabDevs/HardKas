[**@hardkas/core**](../index.md)

***

[@hardkas/core](../index.md) / hardkasConfigSchema

# Variable: hardkasConfigSchema

> `const` **hardkasConfigSchema**: `ZodObject`\<\{ `localnet`: `ZodDefault`\<`ZodObject`\<\{ `dataDir`: `ZodOptional`\<`ZodString`\>; `mode`: `ZodDefault`\<`ZodEnum`\<\[`"simulator"`, `"local-node"`\]\>\>; \}, `"strip"`, `ZodTypeAny`, \{ `dataDir?`: `string`; `mode`: `"simulator"` \| `"local-node"`; \}, \{ `dataDir?`: `string`; `mode?`: `"simulator"` \| `"local-node"`; \}\>\>; `network`: `ZodObject`\<\{ `id`: `ZodEnum`\<\[`"mainnet"`, `"testnet-10"`, `"testnet-11"`, `"testnet-12"`, `"simnet"`, `"simnet-1"`, `"devnet"`, `"simulated"`, `"igra"`\]\>; `rpcUrl`: `ZodOptional`\<`ZodString`\>; \}, `"strip"`, `ZodTypeAny`, \{ `id`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `rpcUrl?`: `string`; \}, \{ `id`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `rpcUrl?`: `string`; \}\>; `project`: `ZodObject`\<\{ `name`: `ZodString`; `root`: `ZodString`; \}, `"strip"`, `ZodTypeAny`, \{ `name`: `string`; `root`: `string`; \}, \{ `name`: `string`; `root`: `string`; \}\>; \}, `"strip"`, `ZodTypeAny`, \{ `localnet`: \{ `dataDir?`: `string`; `mode`: `"simulator"` \| `"local-node"`; \}; `network`: \{ `id`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `rpcUrl?`: `string`; \}; `project`: \{ `name`: `string`; `root`: `string`; \}; \}, \{ `localnet?`: \{ `dataDir?`: `string`; `mode?`: `"simulator"` \| `"local-node"`; \}; `network`: \{ `id`: `"simnet"` \| `"mainnet"` \| `"testnet-10"` \| `"testnet-11"` \| `"testnet-12"` \| `"simnet-1"` \| `"devnet"` \| `"simulated"` \| `"igra"`; `rpcUrl?`: `string`; \}; `project`: \{ `name`: `string`; `root`: `string`; \}; \}\>

Defined in: [packages/core/src/index.ts:88](https://github.com/KasLabDevs/HardKas/blob/996453df4467f91767515bd975fbb31b40441849/packages/core/src/index.ts#L88)
