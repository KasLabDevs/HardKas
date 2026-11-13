# EXTRACTO VERIFICABLE DE CÓDIGO FUENTE AUDITADO (`CODE_EVIDENCE_EXTRACT.md`)

- **Commit Git (`HEAD`)**: `33a934331d5d9a13af48408dcd82f0dd0daa646f`
- **SHA-256 Agregado del Corpus Fuente (`5327` archivos)**: `863f1b730cdeb9dfe6d7128250c97d686233ad038cbcefa3817f5667781ab972`
- **Propósito**: Permitir que un auditor externo verifique directamente en el paquete de evidencias las líneas exactas de código fuente correspondientes a los controles verificados y a los hallazgos `HAL-01` a `HAL-12`, sin necesidad de depender únicamente de la narrativa del informe.

## HK-REQ-001 (VERIFICADO) — Bloqueo Total de Mainnet en L1
- **Archivo**: `packages/core/src/mainnet-policy.ts` (Líneas 1–163 de 163)
- **SHA-256 del archivo completo**: `bc7a05c451332aed67b1cda10b972d534d5c651930163628babedd1fd9dbdb28`

```typescript
   1: import { HardkasError } from "./errors.js";
   2: 
   3: /*
   4:  * MAINNET TOTAL LOCKDOWN (owner decision, 2026-11-09) · the product policy of this release line: HardKAS makes NO
   5:  * network connection to mainnet — reads included — and signs, broadcasts or deploys nothing on it, until the product is
   6:  * complete, independently audited and the owner authorizes it explicitly. It revokes the read exception of
   7:  * SDK-MAINNET-BROADCAST-GUARD-1 (MG-C2: "reading and planning on mainnet stay allowed") and prevails over any policy,
   8:  * test or document that allowed a mainnet connection.
   9:  *
  10:  * Two constants, one layer shared by every path (CLI, SDK, RPC transport, toolkit, Silver, covenants, artifacts):
  11:  *  - MAINNET_TRANSACTIONS_ENABLED → `assertMainnetTransactionsDisabled`: MAINNET_SIGNING_DISABLED /
  12:  *    MAINNET_BROADCAST_DISABLED (offline signing included: no signed mainnet transaction is ever produced);
  13:  *  - MAINNET_CONNECTIONS_ENABLED → `assertMainnetConnectionsDisabled`: MAINNET_CONNECTION_DISABLED, raised before any
  14:  *    connection — by the endpoint authority (@hardkas/config resolveNodeEndpoint), by the RPC transport
  15:  *    (@hardkas/kaspa-rpc OfficialRpcSession, before it creates a client when the expected network is mainnet, and
  16:  *    right after the node's one identity answer when the node says mainnet), and by the paths that do not reach a node
  17:  *    through those two.
  18:  * `allowPublic` (which may open testnet), `experimental`, `allowMainnet`, an external signer, a direct call, a
  19:  * `HARDKAS_*` variable or any configuration never lift either: they are constants, not settings.
  20:  *
  21:  * Order (decided once, pinned by the tests): the operation's own guard names the refusal. A signature is
  22:  * MAINNET_SIGNING_DISABLED and a broadcast MAINNET_BROADCAST_DISABLED — both raised before any connection, signer call
  23:  * or record; every other operation that would reach a mainnet node (a read, a plan, a wait, a diagnostic, a deploy's
  24:  * reads) is MAINNET_CONNECTION_DISABLED. Only fully offline operations stay available (artifact integrity checks,
  25:  * address derivation, unsigned records), and none of them produces a signed mainnet transaction.
  26:  *
  27:  * The one unavoidable limit: an endpoint declared as ANOTHER network (or a raw `--url` with no network) can only be
  28:  * known to be mainnet from the node's own answer. The transport asks the node once (getServerInfo) before anything
  29:  * else; when it says mainnet, the connection is closed and refused (MAINNET_CONNECTION_DISABLED) and nothing else is
  30:  * asked. A node that lies about its network is outside what any client can decide.
  31:  */
  32: 
  33: /** Whether HardKAS signs or broadcasts on mainnet. A constant: enabling it is an explicit product decision. */
  34: export const MAINNET_TRANSACTIONS_ENABLED = false as const;
  35: 
  36: /**
  37:  * MAINNET TOTAL LOCKDOWN: whether HardKAS connects to mainnet at all (reads included). A constant: enabling it is an
  38:  * explicit, later product decision of the owner — never a flag, option, variable or configuration.
  39:  */
  40: export const MAINNET_CONNECTIONS_ENABLED = false as const;
  41: 
  42: /** The Kaspa network types (rusty-kaspa `NetworkType`). */
  43: export type KaspaNetworkType = "mainnet" | "testnet" | "devnet" | "simnet";
  44: 
  45: /**
  46:  * MAINNET-PERIMETER-1 (B2): the network TYPE an id names, the way rusty-kaspa parses a NetworkId — `<type>[-<suffix>]`
  47:  * (consensus/core/src/network.rs), so `mainnet-1` is mainnet — plus HardKAS's `kaspa` / `kaspa-` spellings, any case,
  48:  * trimmed. `undefined` for any other name (a config alias such as "prod", "simulated"): such a name never decides by
  49:  * itself; the network a config entry declares does (see `declaredNetworkIdOf`).
  50:  */
  51: export function networkTypeOf(networkId: unknown): KaspaNetworkType | undefined {
  52:   if (typeof networkId !== "string") return undefined;
  53:   let n = networkId.trim().toLowerCase();
  54:   if (n === "kaspa") return "mainnet";
  55:   if (n.startsWith("kaspa-")) n = n.slice("kaspa-".length);
  56:   const m = /^(mainnet|testnet|devnet|simnet)(?:-\d+)?$/.exec(n);
  57:   return m ? (m[1] as KaspaNetworkType) : undefined;
  58: }
  59: 
  60: /** A network id of the mainnet type (`mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet[-<n>]`, any case). */
  61: export function isMainnetNetworkId(networkId: unknown): boolean {
  62:   return networkTypeOf(networkId) === "mainnet";
  63: }
  64: 
  65: /**
  66:  * WALLET-HD-0 · HardKAS's own spellings of its local simulated world, besides the rusty-kaspa simnet type itself
  67:  * (`simnet`, `simnet-<n>`, `kaspa-simnet`): the simulator's `simulated` and the Docker localnet's `local-docker-simnet`.
  68:  */
  69: export const SIMNET_NETWORK_ALIASES: ReadonlySet<string> = new Set(["simulated", "local-docker-simnet"]);
  70: 
  71: /**
  72:  * WALLET-HD-0 · whether a network NAME means the local simnet — the only network a synthetic (predictable-key) HardKAS
  73:  * identity may exist on. Decided by the name alone, never by an address prefix: `kaspasim` (a prefix), a misspelling,
  74:  * an empty string or any unknown name is NOT simnet (fail closed).
  75:  */
  76: export function isSimnetNetworkId(networkId: unknown): boolean {
  77:   if (typeof networkId !== "string") return false;
  78:   const n = networkId.trim().toLowerCase();
  79:   return n !== "" && (networkTypeOf(n) === "simnet" || SIMNET_NETWORK_ALIASES.has(n));
  80: }
  81: 
  82: /**
  83:  * MAINNET-PERIMETER-1 (B2): the network a config entry DECLARES (`networks[name].network`), else the name itself. A
  84:  * config may name an entry anything ("prod"); the guard decides from what the entry says it is, not from its name.
  85:  */
  86: export function declaredNetworkIdOf(config: unknown, name: unknown): string | undefined {
  87:   if (typeof name !== "string") return undefined;
  88:   const declared = (config as { networks?: Record<string, { network?: unknown } | undefined> } | undefined)?.networks?.[name]?.network;
  89:   return typeof declared === "string" && declared.trim() !== "" ? declared : name;
  90: }
  91: 
  92: export type MainnetTransactionOperation = "sign" | "broadcast";
  93: 
  94: /**
  95:  * Refuses a sign or a broadcast when ANY of the network identities involved (the artifact's, the instance's, the
  96:  * node's when known) is mainnet — never only the one a caller declares. Throws `MAINNET_SIGNING_DISABLED` or
  97:  * `MAINNET_BROADCAST_DISABLED` before anything is signed, sent or recorded.
  98:  */
  99: export function assertMainnetTransactionsDisabled(
 100:   operation: MainnetTransactionOperation,
 101:   networkIds: ReadonlyArray<unknown>,
 102:   context?: string
 103: ): void {
 104:   if (MAINNET_TRANSACTIONS_ENABLED) return;
 105:   const seen = networkIds.filter((n): n is string => typeof n === "string" && n.trim() !== "");
 106:   if (!seen.some(isMainnetNetworkId)) return;
 107:   const sign = operation === "sign";
 108:   throw new HardkasError(
 109:     sign ? "MAINNET_SIGNING_DISABLED" : "MAINNET_BROADCAST_DISABLED",
 110:     `Mainnet ${sign ? "signing" : "broadcast"} is disabled in HardKAS${context ? ` (${context})` : ""}: ` +
 111:       `allowPublic, an external signer or a direct call do not enable it. Use simnet or testnet for real transactions. ` +
 112:       `Nothing was ${sign ? "signed" : "sent"} or recorded.`,
 113:     { metadata: { operation, networks: [...new Set(seen)] } }
 114:   );
 115: }
 116: 
 117: /** The typed code of every mainnet connection refusal (core, config, RPC transport, toolkit, CLI, SDK). */
 118: export const MAINNET_CONNECTION_DISABLED = "MAINNET_CONNECTION_DISABLED" as const;
 119: 
 120: /**
 121:  * The one text of a mainnet connection refusal. `context` names the operation or endpoint; `contacted` says whether
 122:  * the refusal came after the node's single identity answer (an endpoint declared as another network) or before any
 123:  * connection at all.
 124:  */
 125: export function mainnetConnectionDisabledMessage(context?: string, contacted: "nothing" | "identity-only" = "nothing"): string {
 126:   return (
 127:     `MAINNET_CONNECTION_DISABLED: mainnet connections are disabled in HardKAS${context ? ` (${context})` : ""}, reads ` +
 128:     `included, even to an endpoint you declare. No flag, option, environment variable or configuration enables them ` +
 129:     `(allowPublic, experimental, allowMainnet, HARDKAS_*). Use simnet, devnet or a testnet; mainnet records are verified ` +
 130:     `offline only. ` +
 131:     (contacted === "identity-only"
 132:       ? `The node answered only its identity (getServerInfo); the connection was closed and nothing else was asked. Nothing was sent.`
 133:       : `Nothing was contacted or sent.`)
 134:   );
 135: }
 136: 
 137: export function mainnetConnectionDisabledError(
 138:   context?: string,
 139:   metadata: Record<string, unknown> = {},
 140:   contacted: "nothing" | "identity-only" = "nothing"
 141: ): HardkasError {
 142:   return new HardkasError(MAINNET_CONNECTION_DISABLED, mainnetConnectionDisabledMessage(context, contacted), {
 143:     metadata: { ...metadata, contacted }
 144:   });
 145: }
 146: 
 147: /** Whether an error is a mainnet connection refusal (any layer: a HardkasError or the RPC transport's typed error). */
 148: export function isMainnetConnectionDisabledError(e: unknown): boolean {
 149:   return (e as { code?: unknown } | null)?.code === MAINNET_CONNECTION_DISABLED;
 150: }
 151: 
 152: /**
 153:  * MAINNET TOTAL LOCKDOWN · refuses, before any connection, an operation when ANY of the network identities involved
 154:  * (the name asked for, the network its config entry declares, the artifact's, the instance's) is of the mainnet type —
 155:  * `mainnet`, `mainnet-<n>`, `kaspa`, `kaspa-mainnet[-<n>]`, any case. Throws MAINNET_CONNECTION_DISABLED. Nothing in the
 156:  * environment or the configuration can make it return on mainnet.
 157:  */
 158: export function assertMainnetConnectionsDisabled(networkIds: ReadonlyArray<unknown>, context?: string): void {
 159:   if (MAINNET_CONNECTIONS_ENABLED) return;
 160:   const seen = networkIds.filter((n): n is string => typeof n === "string" && n.trim() !== "");
 161:   if (!seen.some(isMainnetNetworkId)) return;
 162:   throw mainnetConnectionDisabledError(context, { networks: [...new Set(seen)] });
 163: }
```

## HK-REQ-002 (VERIFICADO) — Guardias de Mundos de Ejecución (ExecutionTarget)
- **Archivo**: `packages/core/src/semantics/execution-guard.ts` (Líneas 70–218 de 218)
- **SHA-256 del archivo completo**: `020810340df64f0dd6b25ef9b4df44482b6220620920fdb18b4bba13584b4bdb`

```typescript
  70:  * targets (per docs/migrations/0.11-to-0.12.md §5) — the fix does NOT
  71:  * generalize `fund` into "accept every account kind".
  72:  *
  73:  * Account.kind is READ ONLY here; no mutation occurs during compatibility
  74:  * checking (regression H).
  75:  */
  76: export function assertAccountCompatibleWithTarget(
  77:   account: ExecutionAwareAccount,
  78:   target: HardkasExecutionTarget,
  79:   operation: ExecutionOperation
  80: ): void {
  81:   // Domain mismatch — applies to every operation.
  82:   if (target.domain === "evm-l2") {
  83:     // Unconditional failure for EVM L2 as Kaspa accounts don't port over automatically
  84:     throw new ExecutionDomainMismatchError({ expected: "kaspa-l1", actual: "evm-l2", message: `Domain 'evm-l2' is strictly isolated. Account kind '${account.kind}' cannot operate in this domain.` });
  85:   }
  86: 
  87:   if (isRecipientOperation(operation)) {
  88:     // Recipient rules (Wave 3 DEF-15). Signing authority is NOT required.
  89:     // Network compatibility still IS required — a wrong-network address would
  90:     // be an irrecoverable send.
  91:     if (target.mode === "simulator") {
  92:       // Simulator recipients must be synthetic — a raw kaspasim: address under
  93:       // the simulator target is preserved as invalid (regression F), matching
  94:       // pre-Wave-3 behavior. Only kaspa:sim_<name> synthetic identities are
  95:       // valid simulator recipients.
  96:       if (account.kind !== "synthetic") {
  97:         throw new ExecutionModeMismatchError({ expected: "synthetic", actual: account.kind });
  98:       }
  99:     } else if (target.mode === "localnet" || target.mode === "rpc") {
 100:       // Real Kaspa targets: synthetic accounts remain rejected (documented).
 101:       // Both HardKAS-owned kaspa accounts and external-wallet recipients are
 102:       // accepted — the recipient does not sign the funding transaction, so
 103:       // whether HardKAS holds the private key is irrelevant to this guard.
 104:       if (account.kind === "synthetic") {
 105:         throw new ExecutionModeMismatchError({ expected: "kaspa", actual: account.kind });
 106:       }
 107:       if (account.network && account.network !== target.network) {
 108:         throw new ExecutionNetworkMismatchError({ expected: target.network, actual: account.network });
 109:       }
 110:     }
 111:     return;
 112:   }
 113: 
 114:   // Signer/source operations — retain existing signing-authority semantics
 115:   // verbatim so this fix does NOT accidentally weaken any other guard.
 116:   if (target.mode === "simulator") {
 117:     if (account.kind !== "synthetic") {
 118:       throw new ExecutionModeMismatchError({ expected: "synthetic", actual: account.kind });
 119:     }
 120:   } else if (target.mode === "localnet") {
 121:     if (account.kind !== "kaspa") {
 122:       throw new ExecutionModeMismatchError({ expected: "kaspa", actual: account.kind });
 123:     }
 124:     if (account.network !== target.network) {
 125:       throw new ExecutionNetworkMismatchError({ expected: target.network, actual: account.network || "undefined" });
 126:     }
 127:   } else if (target.mode === "rpc") {
 128:     if (account.kind === "synthetic") {
 129:       throw new ExecutionModeMismatchError({ expected: "kaspa", actual: account.kind });
 130:     }
 131:     if (account.network !== target.network) {
 132:       throw new ExecutionNetworkMismatchError({ expected: target.network, actual: account.network || "undefined" });
 133:     }
 134:   }
 135: }
 136: 
 137: export function assertArtifactCompatibleWithTarget(artifact: ExecutionAwareArtifact, target: HardkasExecutionTarget, operation?: ExecutionOperation): void {
 138:   if (!artifact.execution) {
 139:     // Legacy V1/V2 artifacts won't have this. We allow them to pass the guard.
 140:     return;
 141:   }
 142: 
 143:   const classification = classifyExecutionCompatibility(artifact.execution, target, operation);
 144: 
 145:   if (classification === "incompatible") {
 146:     if (artifact.execution.domain !== target.domain) {
 147:       throw new ExecutionDomainMismatchError({ expected: target.domain, actual: artifact.execution.domain });
 148:     }
 149:     if (artifact.execution.network !== target.network) {
 150:       throw new ExecutionNetworkMismatchError({ expected: target.network, actual: artifact.execution.network });
 151:     }
 152:     if (artifact.execution.mode !== target.mode) {
 153:       throw new ExecutionModeMismatchError({ expected: target.mode, actual: artifact.execution.mode });
 154:     }
 155:   }
 156: 
 157:   if (classification === "undefined") {
 158:     throw new ExecutionCompatibilityUndefinedError({
 159:       artifactExecution: artifact.execution,
 160:       target,
 161:       operation
 162:     });
 163:   }
 164: }
 165: 
 166: export function assertReceiptCompatibleWithTarget(receipt: ExecutionAwareReceipt, target: HardkasExecutionTarget, operation?: ExecutionOperation): void {
 167:   if (!receipt.execution) return;
 168: 
 169:   const classification = classifyExecutionCompatibility(receipt.execution, target, operation);
 170: 
 171:   if (classification === "incompatible") {
 172:     if (receipt.execution.domain !== target.domain) {
 173:       throw new ExecutionDomainMismatchError({ expected: target.domain, actual: receipt.execution.domain });
 174:     }
 175:     if (receipt.execution.network !== target.network) {
 176:       throw new ExecutionNetworkMismatchError({ expected: target.network, actual: receipt.execution.network });
 177:     }
 178:     if (receipt.execution.mode !== target.mode) {
 179:       throw new ExecutionModeMismatchError({ expected: target.mode, actual: receipt.execution.mode });
 180:     }
 181:   }
 182: 
 183:   if (classification === "undefined") {
 184:     throw new ExecutionCompatibilityUndefinedError({
 185:       receiptExecution: receipt.execution,
 186:       target,
 187:       operation
 188:     });
 189:   }
 190: }
 191: 
 192: export function assertArtifactAccountCompatibility(artifact: ExecutionAwareArtifact, account: ExecutionAwareAccount): void {
 193:   if (!artifact.execution) return;
 194: 
 195:   if (artifact.execution.mode === "simulator") {
 196:     if (account.kind !== "synthetic") {
 197:       throw new ExecutionModeMismatchError({ expected: "synthetic", actual: account.kind });
 198:     }
 199:   } else if (artifact.execution.mode === "localnet" || artifact.execution.mode === "rpc") {
 200:     if (account.kind === "synthetic") {
 201:       throw new ExecutionModeMismatchError({ expected: "kaspa", actual: account.kind });
 202:     }
 203:     if (account.network && artifact.execution.network && account.network !== artifact.execution.network) {
 204:       throw new ExecutionNetworkMismatchError({ expected: artifact.execution.network, actual: account.network });
 205:     }
 206:   }
 207: }
 208: 
 209: export function assertExecutionCompatibility(input: ExecutionCompatibilityInput): void {
 210:   const { target, account, artifact, receipt, operation } = input;
 211: 
 212:   // DEF-15: thread `operation` explicitly into the account guard so recipient
 213:   // operations (`fund`) don't inherit signer-authority requirements.
 214:   if (account) assertAccountCompatibleWithTarget(account, target, operation);
 215:   if (artifact) assertArtifactCompatibleWithTarget(artifact, target, operation);
 216:   if (receipt) assertReceiptCompatibleWithTarget(receipt, target, operation);
 217:   if (artifact && account) assertArtifactAccountCompatibility(artifact, account);
 218: }
```

## HK-REQ-013 (VERIFICADO) — Canonicalización JSON RFC-8785 (hashVersion: 5)
- **Archivo**: `packages/artifacts/src/canonical.ts` (Líneas 85–210 de 378)
- **SHA-256 del archivo completo**: `a4a626cca326579b7580ce6be4fa09d9fa64e9cb189265195a4080f2be16e993`

```typescript
  85:  * schema-introspection test must be updated with it.
  86:  */
  87: export const V5_UNAUTHENTICATED: ReadonlySet<string> = new Set([
  88:   "createdAt",
  89:   "submittedAt",
  90:   "confirmedAt",
  91:   "deployedAt",
  92:   "executionId",
  93:   "tracePath",
  94:   "receiptPath",
  95:   "filePath",
  96:   "file_path",
  97:   "workspacePath",
  98:   "debug",
  99:   "logs",
 100:   "uiHints",
 101:   "cache",
 102:   "lastViewedAt",
 103:   "indexedAt",
 104:   "file_mtime_ms",
 105:   "latencyMs",
 106:   "rpcHost",
 107:   "rpcUrl",
 108:   "hardkasVersion",
 109:   "signatureMetadata"
 110: ]);
 111: 
 112: /**
 113:  * Hash version 5 (IC-1′.1c): labels derived from the hash. Excluded from the
 114:  * hash and RECOMPUTED by the verifier (`plan-<16hex>`, `signed-<16hex>`).
 115:  */
 116: export const V5_DERIVED_LABELS: ReadonlySet<string> = new Set(["planId", "signedId"]);
 117: 
 118: /**
 119:  * Hash version 5 (IC-1′.1a): self references excluded by EXACT PATH. A
 120:  * `contentHash` anywhere else (for example inside a reference) is authenticated.
 121:  */
 122: export const V5_SELF_REFERENCE_PATHS: readonly string[] = ["contentHash", "lineage.artifactId"];
 123: 
 124: /**
 125:  * Current canonicalization version.
 126:  * v1: BigInt(123) -> "123" (Collision with String "123")
 127:  * v2: BigInt(123) -> "n:123" (Distinguishable)
 128:  * v3: String normalization (\r\n -> \n, NFC) for cross-platform stability.
 129:  * v4: Strict Metadata Integrity (includes lineage, parentArtifactId, signatureMetadata, etc in the hash).
 130:  * v5: Closed top-level exclusion list, exact-path self references, derived labels
 131:  *     recomputed by the verifier, `hashVersion` authenticated, no exclusion by key
 132:  *     name at depth (Closure Pack IC-1′, decision Q1-B′).
 133:  */
 134: export const CURRENT_HASH_VERSION = 5;
 135: export const MIN_HASH_VERSION = 1;
 136: 
 137: /**
 138:  * Internal serializer mode with NO exclusions at any depth (the current string
 139:  * and bigint rules, every key kept). It is not a hash version an artifact may
 140:  * declare; it backs the domain-digest function (IC-1′.7) only.
 141:  */
 142: const UNEXCLUDED_FORM = Number.MAX_SAFE_INTEGER;
 143: 
 144: export const STRICT_PATH_KEYS = new Set([
 145:   "file_path",
 146:   "sandboxSnapshotPath",
 147:   "receiptPath",
 148:   "tracePath",
 149:   "outputPath",
 150:   "artifactPath",
 151:   "workspacePath",
 152:   "relativePath",
 153:   "absolutePath"
 154: ]);
 155: 
 156: /** Error thrown when an artifact's declared `hashVersion` is not an integer in the supported range. */
 157: export class HashVersionInvalidError extends Error {
 158:   readonly code = "HASH_VERSION_INVALID";
 159:   constructor(declared: unknown) {
 160:     super(
 161:       `HASH_VERSION_INVALID: hashVersion must be an integer between ${MIN_HASH_VERSION} and ${CURRENT_HASH_VERSION}, got ${JSON.stringify(declared)}`
 162:     );
 163:     this.name = "HashVersionInvalidError";
 164:   }
 165: }
 166: 
 167: /**
 168:  * The hash version an artifact declares, or `null` when it declares none or an
 169:  * invalid one. Strings, floats, out-of-range numbers and absence are all
 170:  * invalid: no reader may fall back to another version (IC-4′.2).
 171:  */
 172: export function readDeclaredHashVersion(artifact: unknown): number | null {
 173:   if (!artifact || typeof artifact !== "object") return null;
 174:   const declared = (artifact as Record<string, unknown>).hashVersion;
 175:   if (typeof declared !== "number" || !Number.isInteger(declared)) return null;
 176:   if (declared < MIN_HASH_VERSION || declared > CURRENT_HASH_VERSION) return null;
 177:   return declared;
 178: }
 179: 
 180: /**
 181:  * Recomputes an artifact's content hash with the version it DECLARES. This is
 182:  * the single function to use outside a producer (IC-1′.8): a bare
 183:  * `calculateContentHash(x)` would silently apply the current version to a legacy
 184:  * artifact and report a false mismatch.
 185:  */
 186: export function recomputeDeclaredContentHash(artifact: unknown): string {
 187:   const version = readDeclaredHashVersion(artifact);
 188:   if (version === null) throw new HashVersionInvalidError((artifact as Record<string, unknown> | null)?.hashVersion);
 189:   return calculateContentHash(artifact, version);
 190: }
 191: 
 192: function isPlainObject(value: unknown): value is Record<string, unknown> {
 193:   if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
 194:   const proto = Object.getPrototypeOf(value);
 195:   return proto === Object.prototype || proto === null;
 196: }
 197: 
 198: /**
 199:  * Whether a key is excluded from the hash under `version`, given where it sits.
 200:  * `depth` 0 is the artifact's own top level; `parentKey` names the enclosing key.
 201:  */
 202: function isExcluded(key: string, version: number, depth: number, parentKey: string | undefined): boolean {
 203:   if (version === UNEXCLUDED_FORM) return false;
 204:   if (version >= 5) {
 205:     if (depth === 0) return key === "contentHash" || V5_UNAUTHENTICATED.has(key) || V5_DERIVED_LABELS.has(key);
 206:     if (depth === 1 && parentKey === "lineage") return key === "artifactId";
 207:     return false;
 208:   }
 209:   const exclusions = version >= 4 ? V4_SEMANTIC_EXCLUSIONS : SEMANTIC_EXCLUSIONS;
 210:   return exclusions.has(key);
```

## HK-REQ-019 (VERIFICADO) — Cifrado de Keystore con Argon2id + AES-256-GCM + AAD y Zeroing
- **Archivo**: `packages/accounts/src/keystore.ts` (Líneas 1–260 de 314)
- **SHA-256 del archivo completo**: `92ea23246ba01f9cfa1cc2242c48f624f10504f4c152d253a07fc10994804ae3`

```typescript
   1: import fs from "node:fs";
   2: import path from "node:path";
   3: import crypto from "node:crypto";
   4: import { argon2id } from "hash-wasm";
   5: import { EncryptedKeystoreV2, KeystorePayload, KeystoreUnlockResult } from "./types.js";
   6: 
   7: import { writeFileAtomic, stripBom, networkTypeOf, isSimnetNetworkId } from "@hardkas/core";
   8: 
   9: /**
  10:  * TX-07 · bounds on the Argon2id parameters a keystore may carry, checked before any derivation (a file is input: it
  11:  * must not be able to ask for gigabytes of memory or hours of iterations). Creation also enforces a floor (OWASP's
  12:  * Argon2id minimum: 19 MiB, 2 passes). Memory is in KiB, as hash-wasm and the file take it.
  13:  */
  14: export const KEYSTORE_KDF_BOUNDS = Object.freeze({
  15:   memoryKiB: { min: 8_192, createMin: 19_456, max: 1_048_576 },
  16:   iterations: { min: 1, createMin: 2, max: 16 },
  17:   parallelism: { min: 1, max: 16 },
  18:   saltBytes: { min: 16, max: 64 }
  19: });
  20: 
  21: function keystoreError(code: string, message: string): Error {
  22:   return Object.assign(new Error(`${code}: ${message}`), { code });
  23: }
  24: 
  25: function kdfParamsProblem(kdf: { memory?: unknown; iterations?: unknown; parallelism?: unknown; salt?: unknown }, creating: boolean): string | undefined {
  26:   const b = KEYSTORE_KDF_BOUNDS;
  27:   const int = (v: unknown) => (typeof v === "number" && Number.isSafeInteger(v) ? v : NaN);
  28:   const m = int(kdf.memory);
  29:   const t = int(kdf.iterations);
  30:   const p = int(kdf.parallelism);
  31:   if (!(m >= (creating ? b.memoryKiB.createMin : b.memoryKiB.min) && m <= b.memoryKiB.max)) return `memory ${String(kdf.memory)} KiB`;
  32:   if (!(t >= (creating ? b.iterations.createMin : b.iterations.min) && t <= b.iterations.max)) return `iterations ${String(kdf.iterations)}`;
  33:   if (!(p >= b.parallelism.min && p <= b.parallelism.max)) return `parallelism ${String(kdf.parallelism)}`;
  34:   if (!creating) {
  35:     const salt = typeof kdf.salt === "string" ? Buffer.from(kdf.salt, "base64") : Buffer.alloc(0);
  36:     if (salt.length < b.saltBytes.min || salt.length > b.saltBytes.max) return `salt of ${salt.length} bytes`;
  37:   }
  38:   return undefined;
  39: }
  40: 
  41: /**
  42:  * TX-07 · the authenticated data of a 2.1.0 keystore: its type and version, the KDF parameters and the metadata that
  43:  * decides where the key may be used (network, address). Any edit of these makes AES-GCM refuse to decrypt.
  44:  */
  45: function keystoreAad(k: { type: string; version: string; kdf: { algorithm: string; memory: number; iterations: number; parallelism: number; salt: string }; metadata: { network?: unknown; address?: unknown } }): Buffer {
  46:   return Buffer.from(
  47:     JSON.stringify([
  48:       "hardkas.keystore.aad.v1",
  49:       k.type,
  50:       k.version,
  51:       k.kdf.algorithm,
  52:       k.kdf.memory,
  53:       k.kdf.iterations,
  54:       k.kdf.parallelism,
  55:       k.kdf.salt,
  56:       String(k.metadata.network ?? ""),
  57:       String(k.metadata.address ?? "")
  58:     ]),
  59:     "utf8"
  60:   );
  61: }
  62: 
  63: /** The network TYPE of a name (simnet aliases included), to compare a legacy file's metadata with its payload. */
  64: const networkKindOf = (n: unknown) => networkTypeOf(n) ?? (isSimnetNetworkId(n) ? "simnet" : typeof n === "string" ? n : undefined);
  65: 
  66: /**
  67:  * HardKAS Keystore V2 Implementation
  68:  *
  69:  * Uses Argon2id for KDF and AES-256-GCM for encryption.
  70:  * Designed for local developer workflows.
  71:  * TX-07: format 2.1.0 authenticates the metadata (AAD); 2.0.0 files are still read, their metadata checked against the
  72:  * encrypted payload.
  73:  */
  74: export class KeystoreManager {
  75:   /**
  76:    * Keystore container format version. Separate from ARTIFACT_VERSION.
  77:    * This versions the encrypted keystore envelope, not HardKAS artifacts.
  78:    */
  79:   private static readonly KEYSTORE_FORMAT_VERSION = "2.1.0";
  80:   /** The previous envelope (no AAD), still readable. */
  81:   private static readonly LEGACY_KEYSTORE_FORMAT_VERSION = "2.0.0";
  82:   private static readonly KEYSTORE_FORMAT_TYPE = "hardkas.encryptedKeystore.v2";
  83: 
  84:   /**
  85:    * Creates an encrypted keystore from a payload and password.
  86:    */
  87:   static async createEncryptedKeystore(
  88:     payload: KeystorePayload,
  89:     password: string,
  90:     options: {
  91:       label: string;
  92:       network: string;
  93:       iterations?: number;
  94:       memory?: number;
  95:       parallelism?: number;
  96:     }
  97:   ): Promise<EncryptedKeystoreV2> {
  98:     if (!password) throw new Error("Password cannot be empty.");
  99:     if (password.length < 8)
 100:       throw new Error("Password must be at least 8 characters long.");
 101: 
 102:     const salt = crypto.randomBytes(16);
 103:     const nonce = crypto.randomBytes(12);
 104: 
 105:     const iterations = options.iterations || 3;
 106:     const memory = options.memory || 65536; // 64MB
 107:     const parallelism = options.parallelism || 1;
 108:     const weak = kdfParamsProblem({ memory, iterations, parallelism }, true);
 109:     if (weak) throw keystoreError("KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS", `Argon2id ${weak} is outside the accepted range (see KEYSTORE_KDF_BOUNDS).`);
 110: 
 111:     const kdf = { algorithm: "argon2id" as const, memory, iterations, parallelism, salt: salt.toString("base64") };
 112:     const metadata = { label: options.label, network: options.network, address: payload.address };
 113: 
 114:     // Derive key using Argon2id
 115:     const derivedKeyHex = await argon2id({
 116:       password,
 117:       salt,
 118:       parallelism,
 119:       iterations,
 120:       memorySize: memory,
 121:       hashLength: 32, // 256 bits for AES-256
 122:       outputType: "hex"
 123:     });
 124:     const derivedKey = Buffer.from(derivedKeyHex, "hex");
 125: 
 126:     // Encrypt payload using AES-256-GCM
 127:     const cipher = crypto.createCipheriv("aes-256-gcm", derivedKey, nonce);
 128:     // TX-07: the metadata that decides where the key may be used is authenticated with the ciphertext
 129:     cipher.setAAD(keystoreAad({ type: this.KEYSTORE_FORMAT_TYPE, version: this.KEYSTORE_FORMAT_VERSION, kdf, metadata }));
 130:     const encryptedPayload = Buffer.concat([
 131:       cipher.update(JSON.stringify(payload), "utf8"),
 132:       cipher.final()
 133:     ]);
 134:     const tag = cipher.getAuthTag();
 135: 
 136:     // Memory zeroization (best-effort)
 137:     derivedKey.fill(0);
 138: 
 139:     return {
 140:       version: this.KEYSTORE_FORMAT_VERSION,
 141:       type: this.KEYSTORE_FORMAT_TYPE,
 142:       kdf,
 143:       cipher: {
 144:         algorithm: "aes-256-gcm",
 145:         nonce: nonce.toString("base64"),
 146:         tag: tag.toString("base64"),
 147:         aad: "hardkas.keystore.aad.v1"
 148:       },
 149:       encryptedPayload: encryptedPayload.toString("base64"),
 150:       createdAt: new Date().toISOString(),
 151:       metadata
 152:     } as EncryptedKeystoreV2;
 153:   }
 154: 
 155:   /**
 156:    * Decrypts an encrypted keystore using a password.
 157:    */
 158:   static async decryptEncryptedKeystore(
 159:     keystore: EncryptedKeystoreV2,
 160:     password: string
 161:   ): Promise<KeystoreUnlockResult> {
 162:     const legacy = keystore.version === this.LEGACY_KEYSTORE_FORMAT_VERSION;
 163:     if (keystore.version !== this.KEYSTORE_FORMAT_VERSION && !legacy) {
 164:       return {
 165:         success: false,
 166:         error: `Unsupported keystore version: ${keystore.version}`,
 167:         code: "KEYSTORE_VERSION_UNSUPPORTED"
 168:       };
 169:     }
 170:     // TX-07: the KDF parameters come from the file: bounded before anything is derived
 171:     const outOfBounds = kdfParamsProblem(keystore.kdf ?? {}, false);
 172:     if (outOfBounds || keystore.kdf?.algorithm !== "argon2id") {
 173:       return {
 174:         success: false,
 175:         error: `KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS: Argon2id ${outOfBounds ?? `algorithm ${String(keystore.kdf?.algorithm)}`} is outside the accepted range; the keystore was not opened.`,
 176:         code: "KEYSTORE_KDF_PARAMS_OUT_OF_BOUNDS"
 177:       };
 178:     }
 179: 
 180:     let payload: KeystorePayload;
 181:     try {
 182:       const salt = Buffer.from(keystore.kdf.salt, "base64");
 183:       const nonce = Buffer.from(keystore.cipher.nonce, "base64");
 184:       const tag = Buffer.from(keystore.cipher.tag, "base64");
 185:       const encryptedData = Buffer.from(keystore.encryptedPayload, "base64");
 186:       if (nonce.length !== 12 || tag.length !== 16) throw new Error("nonce/tag length");
 187: 
 188:       // Derive key
 189:       const derivedKeyHex = await argon2id({
 190:         password,
 191:         salt,
 192:         parallelism: keystore.kdf.parallelism,
 193:         iterations: keystore.kdf.iterations,
 194:         memorySize: keystore.kdf.memory,
 195:         hashLength: 32,
 196:         outputType: "hex"
 197:       });
 198:       const derivedKey = Buffer.from(derivedKeyHex, "hex");
 199: 
 200:       // Decrypt
 201:       const decipher = crypto.createDecipheriv("aes-256-gcm", derivedKey, nonce);
 202:       if (!legacy) decipher.setAAD(keystoreAad(keystore as any));
 203:       decipher.setAuthTag(tag);
 204: 
 205:       let decrypted: Buffer;
 206:       try {
 207:         decrypted = Buffer.concat([decipher.update(encryptedData), decipher.final()]);
 208:       } finally {
 209:         // Memory zeroization
 210:         derivedKey.fill(0);
 211:       }
 212: 
 213:       payload = JSON.parse(decrypted.toString("utf8")) as KeystorePayload;
 214:     } catch (e) {
 215:       // a 2.1.0 file whose metadata was edited fails here like a wrong password: GCM cannot tell which; the message says both
 216:       return legacy
 217:         ? { success: false, error: "Invalid password or corrupted keystore." }
 218:         : {
 219:             success: false,
 220:             error: "Invalid password, or a keystore whose authenticated metadata (network, address, KDF parameters) was edited.",
 221:             code: "KEYSTORE_UNLOCK_FAILED"
 222:           };
 223:     }
 224:     if (legacy) {
 225:       // TX-07: a 2.0.0 file's metadata is not authenticated; it must at least agree with the encrypted payload
 226:       const addressOk = payload.address === undefined || keystore.metadata?.address === undefined || payload.address === keystore.metadata.address;
 227:       const networkOk =
 228:         payload.network === undefined || keystore.metadata?.network === undefined || networkKindOf(payload.network) === networkKindOf(keystore.metadata.network);
 229:       if (!addressOk || !networkOk) {
 230:         return {
 231:           success: false,
 232:           error: "KEYSTORE_METADATA_MISMATCH: the keystore's metadata (network/address) does not match its encrypted payload; it was not opened.",
 233:           code: "KEYSTORE_METADATA_MISMATCH"
 234:         };
 235:       }
 236:     }
 237:     return { success: true, payload, metadataAuthenticated: !legacy };
 238:   }
 239: 
 240:   /**
 241:    * Verifies if the password is correct for the keystore.
 242:    */
 243:   static async verifyKeystorePassword(
 244:     keystore: EncryptedKeystoreV2,
 245:     password: string
 246:   ): Promise<boolean> {
 247:     const result = await this.decryptEncryptedKeystore(keystore, password);
 248:     return result.success;
 249:   }
 250: 
 251:   /**
 252:    * Changes the password of an encrypted keystore.
 253:    */
 254:   static async changeKeystorePassword(
 255:     keystore: EncryptedKeystoreV2,
 256:     oldPassword: string,
 257:     newPassword: string
 258:   ): Promise<EncryptedKeystoreV2> {
 259:     const unlock = await this.decryptEncryptedKeystore(keystore, oldPassword);
 260:     if (!unlock.success || !unlock.payload) {
```

## HK-REQ-040 (VERIFICADO) — Verificador ZK Groth16 (Subgrupo G2, VK Trapdoor y Subproceso)
- **Archivo**: `packages/sdk/src/zk/groth16-verifier.ts` (Líneas 150–260 de 922)
- **SHA-256 del archivo completo**: `519f39528d53c992edbb76058375d4705049fbc7b90005013a5455ceeca24779`

```typescript
 150: }
 151: 
 152: /**
 153:  * Keys pinned in this code. Pinning anchors the IDENTITY of a key (these exact curve points), not its
 154:  * soundness: a known-trapdoor toy stays weak and still needs allowWeakVerificationKey.
 155:  */
 156: export const PINNED_GROTH16_VERIFICATION_KEYS: readonly PinnedGroth16VerificationKey[] = Object.freeze([
 157:   Object.freeze({
 158:     id: "hardkas-groth16-multiplier-toy",
 159:     fingerprint: "be0faa7e36dee2e5dce7d9ef044213a1a7337c9e9867af6cc5b044c4d3eea057",
 160:     trust: "TOY_KNOWN_TRAPDOOR" as const,
 161:     knownTrapdoor: true,
 162:     source:
 163:       "fixtures/toccata-v2/zk/groth16-multiplier/verification-key.json (circom 2.1.6 + snarkjs 0.7.6 over an UNCONTRIBUTED powers of tau)"
 164:   }),
 165:   Object.freeze({
 166:     id: "risc0-groth16-bn254-v3.0.4",
 167:     fingerprint: "34d6b6930c72f7f4b6e6197c35310eb11ccdab9993aeeae7a34030f5d79ea401",
 168:     trust: "OFFICIAL_UPSTREAM_RELEASE" as const,
 169:     knownTrapdoor: false,
 170:     source:
 171:       "RISC Zero Groth16 verifying key: risc0 v3.0.4 risc0/groth16/src/verifier.rs; the same key, compressed, is R0_SERIALIZED_COMPRESSED_VK of rusty-kaspa v2.1.0 (crypto/txscript/zk-sdk fragments/groth16.rs) and is embedded by the kaspa-wasm 2.1.0 ZkScriptBuilder"
 172:   })
 173: ]);
 174: 
 175: /** Looks a pinned key up by fingerprint or by id. */
 176: export function findPinnedGroth16VerificationKey(fingerprintOrId: string): PinnedGroth16VerificationKey | undefined {
 177:   const k = String(fingerprintOrId ?? "").trim().toLowerCase();
 178:   return PINNED_GROTH16_VERIFICATION_KEYS.find((e) => e.fingerprint === k || e.id.toLowerCase() === k);
 179: }
 180: 
 181: /** Canonical decimal: no sign, no leading zeros, no whitespace, no hex. */
 182: const CANONICAL_DECIMAL = /^(0|[1-9][0-9]*)$/;
 183: 
 184: function parseCanonicalDecimal(raw: unknown): bigint | undefined {
 185:   if (typeof raw !== "string" || !CANONICAL_DECIMAL.test(raw)) return undefined;
 186:   try {
 187:     return BigInt(raw);
 188:   } catch {
 189:     return undefined;
 190:   }
 191: }
 192: 
 193: /**
 194:  * Validates that all public signals are canonical decimal strings within the scalar field [0, r).
 195:  */
 196: export function validatePublicSignals(
 197:   publicSignals: unknown,
 198:   issues: ZkIssue[]
 199: ): boolean {
 200:   if (!Array.isArray(publicSignals)) {
 201:     issues.push({
 202:       code: "ZK_SCALAR_MALFORMED",
 203:       message: "publicSignals must be an array of canonical decimal strings."
 204:     });
 205:     return false;
 206:   }
 207:   let allValid = true;
 208:   for (let i = 0; i < publicSignals.length; i++) {
 209:     const raw = publicSignals[i];
 210:     const val = parseCanonicalDecimal(raw);
 211:     if (val === undefined) {
 212:       issues.push({
 213:         code: "ZK_SCALAR_MALFORMED",
 214:         message: `Public input at index ${i} is not a canonical non-negative decimal string: '${String(raw)}'.`
 215:       });
 216:       allValid = false;
 217:       continue;
 218:     }
 219:     if (val >= BN254_SCALAR_FIELD_ORDER) {
 220:       issues.push({
 221:         code: "ZK_SCALAR_OUT_OF_RANGE",
 222:         message: `Public input at index ${i} (${raw}) is outside BN254 scalar field order [0, ${BN254_SCALAR_FIELD_ORDER}).`
 223:       });
 224:       allValid = false;
 225:     }
 226:   }
 227:   return allValid;
 228: }
 229: 
 230: function checkCoordinate(coord: unknown, pointName: string, issues: ZkIssue[]): boolean {
 231:   const val = parseCanonicalDecimal(coord);
 232:   if (val === undefined) {
 233:     issues.push({
 234:       code: "ZK_POINT_COORDINATE_MALFORMED",
 235:       message: `Point coordinate in ${pointName} is not a canonical decimal integer string: '${String(coord)}'.`
 236:     });
 237:     return false;
 238:   }
 239:   if (val >= BN254_BASE_FIELD_PRIME) {
 240:     issues.push({
 241:       code: "ZK_POINT_COORDINATE_OUT_OF_RANGE",
 242:       message: `Coordinate in ${pointName} is outside BN254 base field prime [0, ${BN254_BASE_FIELD_PRIME}).`
 243:     });
 244:     return false;
 245:   }
 246:   return true;
 247: }
 248: 
 249: /** A projective G1 point as snarkjs serialises it: exactly [x, y, z], every element canonical and < q. */
 250: function checkG1Shape(point: unknown, name: string, issues: ZkIssue[]): boolean {
 251:   if (!Array.isArray(point) || point.length !== 3) {
 252:     issues.push({
 253:       code: "ZK_POINT_MALFORMED",
 254:       message: `${name} must be a projective G1 point with exactly 3 coordinates.`
 255:     });
 256:     return false;
 257:   }
 258:   let ok = true;
 259:   for (let i = 0; i < 3; i++) if (!checkCoordinate(point[i], `${name}[${i}]`, issues)) ok = false;
 260:   return ok;
```

## HK-REQ-041 & HK-REQ-046 (VERIFICADO / PARCIAL) — Toccata RISC Zero L1 Introspection & Outpoint Limit
- **Archivo**: `packages/sdk/src/zk/toccata.ts` (Líneas 240–285 de 2071)
- **SHA-256 del archivo completo**: `46f30b0859723df240fe3641fdc1c090994d1bc1d0da6c7933d2fe65f5bf65fe`

```typescript
 240:   payout: ZkOutputTarget;
 241:   change?: ZkOutputTarget;
 242:   /**
 243:    * The most the lock may pay as fee. The redeem script refuses an input holding more than the bound outputs plus
 244:    * this amount, so a larger deposit cannot be burnt as fee by whoever triggers the spend. Default
 245:    * DEFAULT_MAX_FEE_CAP_SOMPI.
 246:    */
 247:   maxFeeSompi?: bigint;
 248:   /**
 249:    * @deprecated Refused (ZK_UTXO_BINDING_UNSATISFIABLE): binding the spent outpoint is circular. The funding
 250:    * transaction's id commits to its outputs, this P2SH among them, so no redeem script can name that outpoint in
 251:    * advance; a lock that did would be unspendable. Replay across UTXOs is limited by the one-input rule instead.
 252:    */
 253:   utxoBinding?: ZkReplayBinding;
 254: }
 255: 
 256: export interface ZkJournalBindingParams {
 257:   payoutAddress: string;
 258:   amountSompi: bigint;
 259:   utxoOutpoint?: { transactionId: string; index: number };
 260:   nonceHex?: string;
 261: }
 262: 
 263: export interface ZkJournalBindingResult {
 264:   domain: typeof ZK_OUTPUT_BINDING_DOMAIN;
 265:   journalHex: string;
 266:   journalHash: string;
 267:   recipientSpkHex: string;
 268:   amountSompi: bigint;
 269:   nonceHex: string;
 270: }
 271: 
 272: /**
 273:  * Creates a canonical, domain-separated journal for zkVM applications committing to transaction outputs.
 274:  * Domain: HARDKAS_ZK_OUTPUT_BINDING_V1
 275:  * Layout: [0..4] "HKZ1" | [4..36] SPK SHA-256 | [36..44] Amount u64 LE | [44..76] Outpoint Digest | [76..108] Nonce
 276:  *
 277:  * OFF-CHAIN CONVENTION ONLY: no HardKAS lock checks this journal. The redeem scripts verify a receipt of the image id
 278:  * for whatever journal hash the spender supplies; the outputs are bound by introspection in proof-and-output-bound
 279:  * mode, not through the journal. The fields mean something only if the guest program enforces them.
 280:  */
 281: export function createZkOutputBindingJournal(params: ZkJournalBindingParams): ZkJournalBindingResult {
 282:   const kaspa = loadManagedKaspaWasmSync();
 283:   if (!kaspa.Address.validate(params.payoutAddress)) {
 284:     throw new Error(`Invalid payoutAddress: '${params.payoutAddress}'`);
 285:   }
```

## HK-REQ-045 / HAL-07 (INCUMPLIDO) — Stubs Obsoletos planDeploy y planSpend en HardkasCovenants
- **Archivo**: `packages/sdk/src/covenants.ts` (Líneas 490–520 de 1078)
- **SHA-256 del archivo completo**: `fb92eee725bd951716c5d88f69a7a4408da6b12945b1d8557ab6b9fdf1970105`

```typescript
 490:    * ordinary self-payment and dropped the script, which signed and sent like any payment.
 491:    *
 492:    * @throws {HardkasError} COVENANT_PLAN_UNSUPPORTED
 493:    */
 494:   async planDeploy(options: CovenantDeployOptions): Promise<any> {
 495:     throw new HardkasError(
 496:       "COVENANT_PLAN_UNSUPPORTED",
 497:       "Covenant deployment planning is not supported by the SDK: it cannot carry a covenant script into a v1 plan, and it never substitutes an ordinary payment. Build real covenant transactions with `hardkas silver covenant genesis`.",
 498:       { metadata: { from: options.from } }
 499:     );
 500:   }
 501: 
 502:   /**
 503:    * Plan a covenant spend.
 504:    *
 505:    * SURFACE-TRUTH-1A (ST-I3): refused until the SDK plans real v1 covenant transactions. The former body planned an
 506:    * ordinary payment to `to` and dropped the covenant id and the witness data.
 507:    *
 508:    * @throws {HardkasError} COVENANT_PLAN_UNSUPPORTED
 509:    */
 510:   async planSpend(options: CovenantSpendOptions): Promise<any> {
 511:     throw new HardkasError(
 512:       "COVENANT_PLAN_UNSUPPORTED",
 513:       "Covenant spend planning is not supported by the SDK: it cannot carry the covenant id and witness data into a v1 plan, and it never substitutes an ordinary payment. Advance covenants with `hardkas silver covenant transition`.",
 514:       { metadata: { covenantId: options.covenantId, from: options.from } }
 515:     );
 516:   }
 517: 
 518:   /**
 519:    * V1-ENGINE-2 · the current state of a covenant: its outputs the node lists unspent with its covenant id (followed
 520:    * through the lineage this workspace recorded: the node has no query by covenant id), their value, and the state each
```

## HK-REQ-051, HK-REQ-054 & HK-REQ-055 / HAL-01 & HAL-06 (INCUMPLIDO) — WalletToolkit: Claves Sintéticas, Stubs y Omisión de assertBroadcastNodeSynced
- **Archivo**: `packages/toolkit/src/wallet.ts` (Líneas 155–245 de 779)
- **SHA-256 del archivo completo**: `c1b9deede4a033f1dcf3fca553141190350a8b2d13675fe9f6bbbc01e3251d51`

```typescript
 155: 
 156:     /**
 157:      * Creates the wallet's SYNTHETIC identity (WALLET-HD-0: simnet only; refused on any other declared network before
 158:      * it exists). The identity is derived from the wallet's name: it is a development fixture, not custody.
 159:      */
 160:     public async create(): Promise<void> {
 161:         const network = this.assertSyntheticIdentityNetwork("create");
 162:         this.walletManager.create({ walletId: this.name, network: network as any });
 163:     }
 164: 
 165:     /**
 166:      * The wallet's receive address (account 0, index 0; also its change address and the `from` of its plans). WALLET-HD-0:
 167:      * refused before derivation on any network but the local simnet — the key behind this address is computable from the
 168:      * wallet's name.
 169:      */
 170:     public async receive(): Promise<string> {
 171:         const network = this.assertSyntheticIdentityNetwork("receive");
 172:         // High level facade: gets receive address
 173:         const seedRef = this.walletManager.getSeedRef(this.name);
 174:         return this.addressManager.derive({
 175:             seedRef,
 176:             accountIndex: 0,
 177:             chain: 'receive',
 178:             addressIndex: 0,
 179:             network: network as any
 180:         }).address;
 181:     }
 182: 
 183:     /**
 184:      * WALLET-HD-0 · the toolkit's identity is synthetic (its keys are computable from its name), so it may exist on the
 185:      * local simnet only. Called before an identity is created and before any address is derived: a declaration naming
 186:      * any other network (testnet-10 and every testnet, devnet, mainnet) is refused with a typed error, and nothing
 187:      * downstream (balance, UTXOs, plans, signatures, submits) can happen without the address. No option, flag or
 188:      * environment variable lifts it. Returns the network name the derivation uses (`simnet`).
 189:      */
 190:     private assertSyntheticIdentityNetwork(operation: string): string {
 191:         const network = this.addressNetwork();
 192:         if (isSimnetNetworkId(network)) return network;
 193:         throw new HardkasError(
 194:             "WALLET_SYNTHETIC_NETWORK_BLOCKED",
 195:             `WalletToolkit.${operation}: this wallet's identity is synthetic (its private keys are computable from its name) ` +
 196:                 `and exists on simnet only; it cannot receive or spend on ${network}. No address was derived; nothing was ` +
 197:                 `signed or sent. For a public network use a real account: hardkas accounts real generate --network <id> ` +
 198:                 `--password-env <VAR>, then tx plan, tx sign and tx send.`,
 199:             { metadata: { network, identity: "legacy-synthetic", derivationModel: "deterministic-simulated-v1" } }
 200:         );
 201:     }
 202: 
 203:     /**
 204:      * P0-TX-SAFETY-1B v2 / WALLET-HD-0: the network TYPE addresses (receive, change) are derived for, from the
 205:      * declaration alone. With a declared `networkId` it is that id's type (`testnet-10` → testnet), never the `simnet`
 206:      * default; a `network` that names another type than `networkId` is refused (contradictory); a name that is neither a
 207:      * Kaspa network id nor a simnet alias is refused (invalid), never defaulted to simnet.
 208:      */
 209:     private addressNetwork(): string {
 210:         const fromId = this.options.networkId;
 211:         const fromNetwork = this.options.network as string | undefined;
 212:         const typeOf = (v: string): string | undefined => (isSimnetNetworkId(v) ? "simnet" : networkTypeOf(canonicalNetworkId(v)));
 213:         if (fromId !== undefined) {
 214:             const idType = typeof fromId === "string" ? typeOf(fromId) : undefined;
 215:             if (idType === undefined) {
 216:                 throw new HardkasError(
 217:                     "WALLET_NETWORK_INVALID",
 218:                     `WalletToolkit: networkId ${JSON.stringify(fromId)} is not a Kaspa network id (simnet, testnet-10, devnet, …). No address was derived.`
 219:                 );
 220:             }
 221:             if (fromNetwork !== undefined && typeOf(fromNetwork) !== idType) {
 222:                 throw new HardkasError(
 223:                     "WALLET_NETWORK_CONTRADICTORY",
 224:                     `WalletToolkit.receive: network ${fromNetwork} and networkId ${fromId} name different network types.`
 225:                 );
 226:             }
 227:             return idType;
 228:         }
 229:         if (fromNetwork !== undefined) {
 230:             const nType = typeOf(fromNetwork);
 231:             if (nType === undefined) {
 232:                 throw new HardkasError(
 233:                     "WALLET_NETWORK_INVALID",
 234:                     `WalletToolkit: network ${JSON.stringify(fromNetwork)} is not a Kaspa network name. No address was derived.`
 235:                 );
 236:             }
 237:             return nType;
 238:         }
 239:         return "simnet";
 240:     }
 241: 
 242:     public async balance(): Promise<bigint> {
 243:         const addr = await this.receive();
 244:         return (await this.walletQuery.getBalance([addr])) as any;
 245:     }
```

## HK-REQ-054 / HAL-01 (INCUMPLIDO) — WalletToolkit.verifySpendNetwork sin assertBroadcastNodeSynced
- **Archivo**: `packages/toolkit/src/wallet.ts` (Líneas 355–445 de 779)
- **SHA-256 del archivo completo**: `c1b9deede4a033f1dcf3fca553141190350a8b2d13675fe9f6bbbc01e3251d51`

```typescript
 355:             ...(mempoolSize !== undefined ? { mempoolSize } : {})
 356:         };
 357:     }
 358: 
 359:     /**
 360:      * @deprecated Use hardkas.tx.plan directly or the specific operation helpers like send() or consolidate()
 361:      */
 362:     public async planSend(opts: { to: string; amount: bigint; priority?: FeePriority; feeRate?: bigint }): Promise<any> {
 363:         return {
 364:             message: "This is a stub, as requested by P61 audit. Real planning requires UTXO orchestration."
 365:         };
 366:     }
 367: 
 368:     /**
 369:      * @deprecated sendSimulated is moved to testing patterns. Use hardkas.localnet.mine() and standard send() flows.
 370:      */
 371:     public async sendSimulated(opts: { to: string; amount: bigint; priority?: FeePriority; feeRate?: bigint }): Promise<string> {
 372:         return `sim_tx_${Date.now()}`;
 373:     }
 374: 
 375:     /**
 376:      * P0-TX-SAFETY-1B: the network a spend is made on is DECLARED (`networkId`, or an exact `network`), never adopted
 377:      * from the node. Missing, ambiguous (`testnet`), unparseable or contradictory declarations refuse the spend.
 378:      */
 379:     private declaredSpendNetwork(operation: string): string {
 380:         const ctx = `WalletToolkit.${operation}`;
 381:         const declaredType = (v: unknown) => {
 382:             if (typeof v !== "string") return undefined;
 383:             return networkTypeOf(canonicalNetworkId(v === "local-docker-simnet" ? "simnet" : v));
 384:         };
 385:         const fromId = this.options.networkId;
 386:         const fromNetwork = this.options.network as string | undefined;
 387:         // mainnet in ANY declaration refuses first (SDK-MAINNET-BROADCAST-GUARD-1)
 388:         assertMainnetTransactionsDisabled("broadcast", [fromNetwork, fromId], ctx);
 389:         let expected: string | undefined;
 390:         if (fromId !== undefined) {
 391:             if (typeof fromId !== "string" || declaredType(fromId) === undefined) {
 392:                 throw new HardkasError("WALLET_NETWORK_INVALID", `${ctx}: networkId ${JSON.stringify(fromId)} is not a Kaspa network id (simnet, testnet-10, devnet, …). Nothing was signed or sent.`);
 393:             }
 394:             expected = canonicalNetworkId(fromId);
 395:             // a testnet id without its suffix does not say which testnet (rusty-kaspa requires the suffix for testnet)
 396:             if (declaredType(fromId) === "testnet" && !/-\d+$/.test(expected)) {
 397:                 throw new HardkasError(
 398:                     "WALLET_NETWORK_AMBIGUOUS",
 399:                     `WalletToolkit.${operation}: networkId ${fromId} does not say which testnet; declare it with its suffix (e.g. testnet-10). Nothing was signed or sent.`
 400:                 );
 401:             }
 402:             if (fromNetwork !== undefined && declaredType(fromNetwork) !== declaredType(fromId)) {
 403:                 throw new HardkasError(
 404:                     "WALLET_NETWORK_CONTRADICTORY",
 405:                     `${ctx}: network ${fromNetwork} and networkId ${fromId} name different network types. Nothing was signed or sent.`
 406:                 );
 407:             }
 408:         } else if (fromNetwork !== undefined) {
 409:             const c = canonicalNetworkId(fromNetwork === "local-docker-simnet" ? "simnet" : fromNetwork);
 410:             // exact only: simnet, or an id with its suffix (testnet-10); "testnet" alone does not say which testnet
 411:             if (declaredType(fromNetwork) !== undefined && (declaredType(fromNetwork) !== "testnet" || /-\d+$/.test(c))) expected = c;
 412:             else {
 413:                 throw new HardkasError(
 414:                     "WALLET_NETWORK_AMBIGUOUS",
 415:                     `${ctx}: network ${fromNetwork} does not name one network; declare networkId (e.g. testnet-10) to sign or send. Nothing was signed or sent.`
 416:                 );
 417:             }
 418:         }
 419:         if (expected === undefined) {
 420:             throw new HardkasError(
 421:                 "WALLET_NETWORK_UNDECLARED",
 422:                 `${ctx}: no network is declared for this wallet (networkId); the toolkit does not sign or send on whatever network a node announces. Nothing was signed or sent.`
 423:             );
 424:         }
 425:         if (isMainnetNetworkId(expected)) assertMainnetTransactionsDisabled("broadcast", [expected], ctx);
 426:         return expected;
 427:     }
 428: 
 429:     /**
 430:      * P0-TX-SAFETY-1B · the node's identity, read NOW (MAINNET-PERIMETER-1's centralized check, @hardkas/kaspa-rpc):
 431:      * getServerInfo.networkId and getBlockDagInfo.network(Id) must both answer, agree, not be mainnet and equal the
 432:      * declared network. A read that fails, a missing method or an unnamed network refuses (fail closed). Returns the
 433:      * verified network. Called before planning and again right before signing and right before submitting.
 434:      */
 435:     private async verifySpendNetwork(operation: string): Promise<string> {
 436:         const expected = this.declaredSpendNetwork(operation);
 437:         if (!this.options.rpc) {
 438:             throw new HardkasError("WALLET_RPC_REQUIRED", `WalletToolkit.${operation}: an RPC client is required to sign or send. Nothing was signed or sent.`);
 439:         }
 440:         return assertBroadcastNodeIdentity(this.options.rpc, expected, "the wallet's node");
 441:     }
 442: 
 443:     private async signAndBroadcast(plan: any): Promise<{ txId: string; plan: any }> {
 444:         if (!this.options.signer) {
 445:             const err = new Error("MISSING_SIGNER: WalletToolkit requires an explicit signer to sign transactions.");
```

## HK-REQ-056 / HAL-02 (INCUMPLIDO) — ProjectionStoreJson.setAll sin writeFileAtomicSync ni Lock
- **Archivo**: `packages/query-store/src/projection-store.ts` (Líneas 1–58 de 58)
- **SHA-256 del archivo completo**: `aface713c6bc5771cbc2aeeede38c24b968d0188b57817225ae329089154f70b`

```typescript
   1: import * as fs from 'node:fs';
   2: import * as path from 'node:path';
   3: 
   4: export interface ProjectionStoreOptions {
   5:     namespace: string;
   6:     dirPath?: string;
   7: }
   8: 
   9: export class ProjectionStoreJson {
  10:     private readonly namespace: string;
  11:     private readonly filePath: string;
  12: 
  13:     constructor(options: ProjectionStoreOptions) {
  14:         this.namespace = options.namespace;
  15:         const dir = options.dirPath || path.join(process.cwd(), '.hardkas', 'projections');
  16:         this.filePath = path.join(dir, `${this.namespace}.json`);
  17:     }
  18: 
  19:     private ensureDir() {
  20:         const dir = path.dirname(this.filePath);
  21:         if (!fs.existsSync(dir)) {
  22:             fs.mkdirSync(dir, { recursive: true });
  23:         }
  24:     }
  25: 
  26:     public getAll(): Record<string, any> {
  27:         if (!fs.existsSync(this.filePath)) return {};
  28:         try {
  29:             return JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
  30:         } catch {
  31:             return {};
  32:         }
  33:     }
  34: 
  35:     public setAll(data: Record<string, any>) {
  36:         this.ensureDir();
  37:         const tmp = this.filePath + '.tmp';
  38:         fs.writeFileSync(tmp, JSON.stringify(data, null, 2), 'utf-8');
  39:         fs.renameSync(tmp, this.filePath);
  40:     }
  41: 
  42:     public get<T = any>(key: string): T | undefined {
  43:         const data = this.getAll();
  44:         return data[key] as T;
  45:     }
  46: 
  47:     public set<T = any>(key: string, val: T): void {
  48:         const data = this.getAll();
  49:         data[key] = val;
  50:         this.setAll(data);
  51:     }
  52: 
  53:     public update<T = any>(key: string, updater: (prev: T | undefined) => T): void {
  54:         const data = this.getAll();
  55:         data[key] = updater(data[key]);
  56:         this.setAll(data);
  57:     }
  58: }
```

## HK-REQ-062, HK-REQ-063 & HK-REQ-067 / HAL-08 (VERIFICADO / INCUMPLIDO) — Endurecimiento de @hardkas/dev-server y Ausencia de Rate Limiting
- **Archivo**: `packages/dev-server/src/server.ts` (Líneas 40–210 de 310)
- **SHA-256 del archivo completo**: `eb91c7be0c6effc539545014a85f443afde1981553ca2aed5b1b076ef4e0732c`

```typescript
  40:   unsafeNoAuth?: boolean;
  41:   open?: boolean;
  42: }
  43: 
  44: export function resolveCorsOrigin(
  45:   origin: string | undefined,
  46:   config: { unsafeExternal: boolean; port: number }
  47: ): string | null | undefined {
  48:   if (!origin) return origin;
  49: 
  50:   const allowedLocalPrefixes = [
  51:     `http://localhost:${config.port}`,
  52:     `http://127.0.0.1:${config.port}`,
  53:     `http://[::1]:${config.port}`,
  54:     `http://localhost:5173`,
  55:     `http://127.0.0.1:5173`,
  56:     `http://[::1]:5173`
  57:   ];
  58: 
  59:   if (
  60:     allowedLocalPrefixes.some(
  61:       (prefix) => origin === prefix || origin.startsWith(prefix + "/")
  62:     )
  63:   ) {
  64:     return origin;
  65:   }
  66: 
  67:   if (config.unsafeExternal) {
  68:     return origin;
  69:   }
  70: 
  71:   return null;
  72: }
  73: 
  74: export function createDevServer(config: DevServerConfig) {
  75:   const app = new Hono();
  76: 
  77:   // Generate cryptographically secure session token on server boot or reuse persistent env token
  78:   const devServerToken =
  79:     process.env.HARDKAS_DEV_TOKEN || crypto.randomBytes(32).toString("hex");
  80: 
  81:   // EVIDENCE-TRUST-1 (ET-C5): the access log never prints a credential. The API accepts its session token as `?token=`
  82:   // (an EventSource cannot send headers), so every logged request path goes through the same redaction as the CLI's
  83:   // output: secret-named query values are replaced by a marker, accepted token or not.
  84:   app.use(
  85:     "*",
  86:     logger((message: string, ...rest: string[]) =>
  87:       console.log(redactUrlCredentialsInText(message), ...rest.map((part) => redactUrlCredentialsInText(part)))
  88:     )
  89:   );
  90: 
  91:   // L-09 (3-nov): nothing this server answers is kept by a browser or proxy cache (workspace data, the catalog, refusals).
  92:   // The session token is never embedded in a response: a client gets it out of band (the 0600 file
  93:   // .hardkas/dev-server-token the CLI writes, or HARDKAS_DEV_TOKEN). A route that needs another policy (the SSE stream:
  94:   // no-cache) sets its own.
  95:   app.use("*", async (c, next) => {
  96:     c.header("Cache-Control", "no-store");
  97:     await next();
  98:     try {
  99:       if (!c.res.headers.has("Cache-Control")) c.res.headers.set("Cache-Control", "no-store");
 100:     } catch {
 101:       /* a response with immutable headers keeps its own */
 102:     }
 103:   });
 104: 
 105:   // 1. Host Header Validation (DNS Rebinding Defense)
 106:   app.use("*", async (c, next) => {
 107:     if (!config.unsafeExternal) {
 108:       const host = c.req.header("Host") || c.req.header("host") || "";
 109:       const allowedHosts = [
 110:         `localhost:${config.port}`,
 111:         `127.0.0.1:${config.port}`,
 112:         `[::1]:${config.port}`
 113:       ];
 114:       if (!allowedHosts.includes(host)) {
 115:         return c.json(
 116:           { error: `Forbidden: Host '${host}' is not allowed for this server session.` },
 117:           403
 118:         );
 119:       }
 120:     }
 121:     await next();
 122:   });
 123: 
 124:   // Strict Origin Validation (Reject invalid origins with 403)
 125:   app.use("*", async (c, next) => {
 126:     if (!config.unsafeExternal) {
 127:       const origin = c.req.header("Origin") || c.req.header("origin");
 128:       if (origin) {
 129:          const resolved = resolveCorsOrigin(origin, {
 130:             unsafeExternal: !!config.unsafeExternal,
 131:             port: config.port
 132:          });
 133:          if (!resolved) {
 134:             return c.json({ error: `Forbidden: Origin '${origin}' is not allowed.` }, 403);
 135:          }
 136:       }
 137:     }
 138:     await next();
 139:   });
 140: 
 141:   // 2. Strict CORS Configuration
 142:   app.use(
 143:     "*",
 144:     cors({
 145:       origin: (origin) =>
 146:         resolveCorsOrigin(origin, {
 147:           unsafeExternal: !!config.unsafeExternal,
 148:           port: config.port
 149:         }) ?? null
 150:     })
 151:   );
 152: 
 153:   // 3. Bearer Token Authentication Middleware
 154:   app.use("/api/*", async (c, next) => {
 155:     const authHeader = c.req.header("Authorization");
 156:     const queryToken = c.req.query("token");
 157:     let token = "";
 158: 
 159:     if (authHeader && authHeader.startsWith("Bearer ")) {
 160:       token = authHeader.substring(7);
 161:     } else if (queryToken) {
 162:       token = queryToken;
 163:     }
 164: 
 165:     if (!config.unsafeNoAuth && token !== devServerToken) {
 166:       return c.json({ error: "Unauthorized: Invalid or missing bearer token." }, 401);
 167:     }
 168:     await next();
 169:   });
 170: 
 171:   // 4. Custom CSRF Mutation Header Middleware
 172:   app.use("/api/*", async (c, next) => {
 173:     const method = c.req.method.toUpperCase();
 174:     if (["POST", "PUT", "PATCH", "DELETE"].includes(method)) {
 175:       const csrfHeader = c.req.header("X-Hardkas-Request");
 176:       if (csrfHeader !== "true") {
 177:         return c.json(
 178:           {
 179:             error:
 180:               "Forbidden: Missing required CSRF protection header X-Hardkas-Request: true"
 181:           },
 182:           403
 183:         );
 184:       }
 185:     }
 186:     await next();
 187:   });
 188: 
 189:   // Inject Generation ID to all API responses
 190:   app.use("/api/*", async (c, next) => {
 191:     await next();
 192:     try {
 193:       const { getQueryBackend } = await import("./db.js");
 194:       const backend = getQueryBackend();
 195:       if (backend.isReady()) {
 196:         const rows = await backend.executeRawSql(
 197:           "SELECT value FROM metadata WHERE key = 'generation_id'"
 198:         );
 199:         if (rows && rows.length > 0) {
 200:           c.header("X-Hardkas-Generation", rows[0].value);
 201:         }
 202:       }
 203:     } catch (e) {}
 204:   });
 205: 
 206:   app.route("/api/session", sessionRoutes);
 207:   app.route("/api/health", healthRoutes);
 208:   app.route("/api/bridge", bridgeRoutes);
 209:   app.route("/api/metamask", metamaskRoutes);
 210:   app.route("/api/kasware", kaswareRoutes);
```

