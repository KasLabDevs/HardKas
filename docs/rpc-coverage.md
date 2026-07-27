# Kaspa RPC Surface Coverage

> **Source Snapshot:** `kaspanet/rusty-kaspa` @ v2.0.1 (unknown (toccata-v2))
> **Generated At:** 2026-07-21

## Category: READ

| Operation | HardKAS Method | Status | 1:1 Raw | Abstraction | Typings | Errors | Cancel |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `getBlock` | `getBlock` | COVERED | ✅ | ❌ | ✅ | ✅ | ✅ |
| `getBlocks` | `getBlocks` | COVERED | ✅ | ❌ | ✅ | ✅ | ✅ |
| `getHeaders` | `getHeaders` | COVERED | ✅ | ❌ | ✅ | ✅ | ✅ |
| `getBlockCount` | `getBlockCount` | COVERED | ✅ | ❌ | ✅ | ✅ | ✅ |
| `getBlockDagInfo` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `getSelectedTipHash` | `getSelectedTipHash` | COVERED | ✅ | ❌ | ✅ | ✅ | ✅ |
| `getVirtualChainFromBlock` | `getVirtualChainFromBlock` | COVERED | ✅ | ❌ | ✅ | ✅ | ✅ |
| `getVirtualSelectedParentBlueScore` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `getSinkBlueScore` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `getCoinSupply` | `getCoinSupply` | COVERED | ✅ | ❌ | ✅ | ✅ | ✅ |
| `getSyncStatus` | `getSyncStatus` | COVERED | ✅ | ❌ | ✅ | ✅ | ✅ |
| `getCurrentNetwork` | `getCurrentNetwork` | COVERED | ✅ | ❌ | ✅ | ✅ | ✅ |
| `getInfo` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `getServerInfo` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `getUtxosByAddresses` | `getUtxosByAddress` | PARTIAL | ❌ | ✅ | ✅ | ✅ | ❌ |
| `getBalanceByAddress` | `getBalanceByAddress` | PARTIAL | ❌ | ✅ | ✅ | ✅ | ❌ |
| `getBalancesByAddresses` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `getConnectedPeerInfo` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `getPeerAddresses` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |

## Category: MEMPOOL

| Operation | HardKAS Method | Status | 1:1 Raw | Abstraction | Typings | Errors | Cancel |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `getMempoolEntry` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `getMempoolEntries` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `getMempoolEntriesByAddresses` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `submitTransaction` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `submitTransactionReplacement` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `getFeeEstimate` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `getFeeEstimateExperimental` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |

## Category: EVENTS

| Operation | HardKAS Method | Status | 1:1 Raw | Abstraction | Typings | Errors | Cancel |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `notifyBlockAdded` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `notifyNewBlockTemplate` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `notifyVirtualDaaScoreChanged` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `notifyUtxosChanged` | `subscribeToUtxosChanged` | PARTIAL | ❌ | ✅ | ✅ | ✅ | ❌ |

## Category: MINING

| Operation | HardKAS Method | Status | 1:1 Raw | Abstraction | Typings | Errors | Cancel |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `getBlockTemplate` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `submitBlock` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |

## Category: ADMIN

| Operation | HardKAS Method | Status | 1:1 Raw | Abstraction | Typings | Errors | Cancel |
| :--- | :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `addPeer` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `ban` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |
| `unban` | - | GAP | ❌ | ❌ | ❌ | ❌ | ❌ |

