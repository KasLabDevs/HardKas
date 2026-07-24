import type { SnapshotOperation } from "./types.js";

/**
 * Toccata v2.0.1 Official RPC Surface Snapshot
 * This acts as the single source of truth for the coverage engine.
 */
export const RUSTY_KASPA_V2_SNAPSHOT: SnapshotOperation[] = [
  // -----------------------------------------------------------------
  // Read
  // -----------------------------------------------------------------
  { operation: "getBlock", requestType: "GetBlockRequestMessage", responseType: "GetBlockResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getBlocks", requestType: "GetBlocksRequestMessage", responseType: "GetBlocksResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getHeaders", requestType: "GetHeadersRequestMessage", responseType: "GetHeadersResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getBlockCount", requestType: "GetBlockCountRequestMessage", responseType: "GetBlockCountResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getBlockDagInfo", requestType: "GetBlockDagInfoRequestMessage", responseType: "GetBlockDagInfoResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getSelectedTipHash", requestType: "GetSelectedTipHashRequestMessage", responseType: "GetSelectedTipHashResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getVirtualChainFromBlock", requestType: "GetVirtualChainFromBlockRequestMessage", responseType: "GetVirtualChainFromBlockResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getVirtualSelectedParentBlueScore", requestType: "GetVirtualSelectedParentBlueScoreRequestMessage", responseType: "GetVirtualSelectedParentBlueScoreResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getSinkBlueScore", requestType: "GetSinkBlueScoreRequestMessage", responseType: "GetSinkBlueScoreResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getCoinSupply", requestType: "GetCoinSupplyRequestMessage", responseType: "GetCoinSupplyResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getSyncStatus", requestType: "GetSyncStatusRequestMessage", responseType: "GetSyncStatusResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getCurrentNetwork", requestType: "GetCurrentNetworkRequestMessage", responseType: "GetCurrentNetworkResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getInfo", requestType: "GetInfoRequestMessage", responseType: "GetInfoResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getServerInfo", requestType: "GetServerInfoRequestMessage", responseType: "GetServerInfoResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getUtxosByAddresses", requestType: "GetUtxosByAddressesRequestMessage", responseType: "GetUtxosByAddressesResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: ["utxoindex"] },
  { operation: "getBalanceByAddress", requestType: "GetBalanceByAddressRequestMessage", responseType: "GetBalanceByAddressResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: ["utxoindex"] },
  { operation: "getBalancesByAddresses", requestType: "GetBalancesByAddressesRequestMessage", responseType: "GetBalancesByAddressesResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: ["utxoindex"] },
  { operation: "getConnectedPeerInfo", requestType: "GetConnectedPeerInfoRequestMessage", responseType: "GetConnectedPeerInfoResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getPeerAddresses", requestType: "GetPeerAddressesRequestMessage", responseType: "GetPeerAddressesResponseMessage", category: "read", securityProfile: "public", requiredNodeFeatures: [] },

  // -----------------------------------------------------------------
  // Mempool
  // -----------------------------------------------------------------
  { operation: "getMempoolEntry", requestType: "GetMempoolEntryRequestMessage", responseType: "GetMempoolEntryResponseMessage", category: "mempool", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getMempoolEntries", requestType: "GetMempoolEntriesRequestMessage", responseType: "GetMempoolEntriesResponseMessage", category: "mempool", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getMempoolEntriesByAddresses", requestType: "GetMempoolEntriesByAddressesRequestMessage", responseType: "GetMempoolEntriesByAddressesResponseMessage", category: "mempool", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "submitTransaction", requestType: "SubmitTransactionRequestMessage", responseType: "SubmitTransactionResponseMessage", category: "mempool", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "submitTransactionReplacement", requestType: "SubmitTransactionReplacementRequestMessage", responseType: "SubmitTransactionReplacementResponseMessage", category: "mempool", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getFeeEstimate", requestType: "GetFeeEstimateRequestMessage", responseType: "GetFeeEstimateResponseMessage", category: "mempool", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "getFeeEstimateExperimental", requestType: "GetFeeEstimateExperimentalRequestMessage", responseType: "GetFeeEstimateExperimentalResponseMessage", category: "mempool", securityProfile: "public", requiredNodeFeatures: [] },

  // -----------------------------------------------------------------
  // Mining
  // -----------------------------------------------------------------
  { operation: "getBlockTemplate", requestType: "GetBlockTemplateRequestMessage", responseType: "GetBlockTemplateResponseMessage", category: "mining", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "submitBlock", requestType: "SubmitBlockRequestMessage", responseType: "SubmitBlockResponseMessage", category: "mining", securityProfile: "public", requiredNodeFeatures: [] },
  
  // -----------------------------------------------------------------
  // Events
  // -----------------------------------------------------------------
  { operation: "notifyBlockAdded", requestType: "NotifyBlockAddedRequestMessage", responseType: "NotifyBlockAddedResponseMessage", category: "events", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "notifyNewBlockTemplate", requestType: "NotifyNewBlockTemplateRequestMessage", responseType: "NotifyNewBlockTemplateResponseMessage", category: "events", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "notifyVirtualDaaScoreChanged", requestType: "NotifyVirtualDaaScoreChangedRequestMessage", responseType: "NotifyVirtualDaaScoreChangedResponseMessage", category: "events", securityProfile: "public", requiredNodeFeatures: [] },
  { operation: "notifyUtxosChanged", requestType: "NotifyUtxosChangedRequestMessage", responseType: "NotifyUtxosChangedResponseMessage", category: "events", securityProfile: "public", requiredNodeFeatures: ["utxoindex"] },

  // -----------------------------------------------------------------
  // Admin
  // -----------------------------------------------------------------
  { operation: "addPeer", requestType: "AddPeerRequestMessage", responseType: "AddPeerResponseMessage", category: "admin", securityProfile: "privileged", requiredNodeFeatures: [] },
  { operation: "ban", requestType: "BanRequestMessage", responseType: "BanResponseMessage", category: "admin", securityProfile: "privileged", requiredNodeFeatures: [] },
  { operation: "unban", requestType: "UnbanRequestMessage", responseType: "UnbanResponseMessage", category: "admin", securityProfile: "privileged", requiredNodeFeatures: [] }
];
