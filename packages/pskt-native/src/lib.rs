#![deny(clippy::all)]

use base64::{engine::general_purpose, Engine as _};
use kaspa_consensus_core::config::params::Params;
use kaspa_consensus_core::hashing::sighash::{
    calc_schnorr_signature_hash, SigHashReusedValuesUnsync,
};
use kaspa_consensus_core::network::NetworkId;
use kaspa_consensus_core::subnets::SUBNETWORK_ID_NATIVE;
use kaspa_consensus_core::tx::{
    ComputeCommit, MutableTransaction, SignableTransaction, Transaction, TransactionInput, TransactionOutput,
};
use kaspa_wallet_core::account::pskb::finalize_pskt_one_or_more_sig_and_redeem_script;
use kaspa_wallet_pskt::bundle::Bundle;
use kaspa_wallet_pskt::pskt::{Creator, Inner, Signature, PSKT};
use napi::bindgen_prelude::*;
use napi_derive::napi;
use secp256k1::{Message, SECP256K1};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::str::FromStr;

const MAX_PSKT_PAYLOAD_BYTES: usize = 5 * 1024 * 1024; // 5MB limit

#[derive(Serialize)]
pub struct NativeOutpointJson {
    pub transaction_id: String,
    pub index: u32,
}

#[derive(Serialize)]
pub struct NativeInputJson {
    pub previous_outpoint: NativeOutpointJson,
    pub signature_script: String,
    pub sequence: String,
    pub sig_op_count: u8,
}

#[derive(Serialize)]
pub struct NativeScriptPublicKeyJson {
    pub version: u16,
    pub script: String,
}

#[derive(Serialize)]
pub struct NativeOutputJson {
    pub value: String,
    pub script_public_key: NativeScriptPublicKeyJson,
}

#[derive(Serialize)]
pub struct NativeTransactionJson {
    pub version: u16,
    pub mass: String,
    pub lock_time: String,
    pub inputs: Vec<NativeInputJson>,
    pub outputs: Vec<NativeOutputJson>,
    pub payload: String,
    pub subnetwork_id: String,
}

#[derive(Serialize, Deserialize)]
struct NativePsktProbe {
    #[serde(rename = "bridgeVersion")]
    bridge_version: String,
    #[serde(rename = "rustyKaspaCommit")]
    rusty_kaspa_commit: String,
    #[serde(rename = "crateVersion")]
    crate_version: String,
    operations: NativePsktOperations,
}

#[derive(Serialize, Deserialize)]
struct NativePsktOperations {
    decode: bool,
    encode: bool,
    inspect: bool,
    combine: bool,
    finalize: bool,
    extract: bool,
    sign: bool,
}

#[napi]
pub fn pskt_probe() -> Result<String> {
    let probe = NativePsktProbe {
        bridge_version: "0.11.3-alpha".to_string(),
        rusty_kaspa_commit: "78257f273a26c4be085bab0f79437dee99ca8835".to_string(),
        crate_version: "0.15.0".to_string(),
        operations: NativePsktOperations {
            decode: true,
            encode: true,
            inspect: true,
            combine: true,
            finalize: true,
            extract: true,
            sign: true,
        },
    };
    Ok(serde_json::to_string(&probe).unwrap())
}

fn compute_sha256(data: &[u8]) -> String {
    let mut hasher = Sha256::new();
    hasher.update(data);
    hex::encode(hasher.finalize())
}

#[derive(Serialize, Deserialize)]
struct StructuredError {
    code: String,
    operation: String,
    #[serde(rename = "upstreamKind")]
    upstream_kind: String,
    message: String,
    #[serde(rename = "payloadHash")]
    payload_hash: Option<String>,
}

fn to_napi_error(
    code: &str,
    operation: &str,
    upstream_kind: &str,
    message: &str,
    payload_hash: Option<String>,
) -> Error {
    let structured = StructuredError {
        code: code.to_string(),
        operation: operation.to_string(),
        upstream_kind: upstream_kind.to_string(),
        message: message.to_string(),
        payload_hash,
    };
    Error::new(
        Status::GenericFailure,
        serde_json::to_string(&structured).unwrap(),
    )
}

#[derive(Serialize, Deserialize)]
struct PsktRoundtripResult {
    #[serde(rename = "payloadBase64")]
    payload_base64: String,
    #[serde(rename = "byteIdentical")]
    byte_identical: bool,
    #[serde(rename = "inputHash")]
    input_hash: String,
    #[serde(rename = "outputHash")]
    output_hash: String,
    #[serde(rename = "canonicalIdentityBefore")]
    canonical_identity_before: String,
    #[serde(rename = "canonicalIdentityAfter")]
    canonical_identity_after: String,
}

#[derive(Serialize, Deserialize)]
struct PsktInspectionResult {
    #[serde(rename = "unsignedTransactionIdentity")]
    unsigned_transaction_identity: String,
    #[serde(rename = "inputCommitment")]
    input_commitment: String,
    #[serde(rename = "outputCommitment")]
    output_commitment: String,
    #[serde(rename = "payloadCommitment")]
    payload_commitment: String,
    #[serde(rename = "subnetworkId")]
    subnetwork_id: String,
    #[serde(rename = "transactionVersion")]
    transaction_version: u16,
    #[serde(rename = "partialSignatureCommitment")]
    partial_signature_commitment: String,
}

#[napi]
pub fn pskt_inspect(payload_base64: String) -> Result<String> {
    if payload_base64.len() > MAX_PSKT_PAYLOAD_BYTES {
        return Err(Error::new(
            Status::InvalidArg,
            "Payload exceeds MAX_PSKT_PAYLOAD_BYTES".to_string(),
        ));
    }
    let pskb_bytes = general_purpose::STANDARD
        .decode(&payload_base64)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid base64: {}", e)))?;
    let pskb_str = String::from_utf8(pskb_bytes)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid UTF-8: {}", e)))?;

    let bundle = Bundle::deserialize(&pskb_str)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid PSKB bundle: {:?}", e)))?;

    let inner = bundle
        .iter()
        .next()
        .ok_or_else(|| Error::new(Status::InvalidArg, "Empty bundle".to_string()))?;
    let p: PSKT<Creator> = PSKT::from(inner.clone());
    let unsigned_tx = p
        .constructor()
        .updater()
        .signer()
        .calculate_id()
        .to_string();

    let mut sigs = Vec::new();
    for (i, input) in inner.inputs.iter().enumerate() {
        for (pk, sig) in &input.partial_sigs {
            let sighash = input.sighash_type;
            let mut entry = Vec::new();
            entry.extend_from_slice(&(i as u32).to_le_bytes());
            entry.extend_from_slice(&pk.serialize());
            let sighash_u8: u8 = sighash.to_u8();
            entry.push(sighash_u8);
            let sig_json = serde_json::to_vec(&sig).unwrap();
            entry.extend_from_slice(&sig_json);
            sigs.push(entry);
        }
    }
    sigs.sort();
    let mut hasher = Sha256::new();
    for s in sigs {
        hasher.update(&s);
    }
    let partial_signature_commitment = hex::encode(hasher.finalize());

    let result = PsktInspectionResult {
        unsigned_transaction_identity: unsigned_tx,
        input_commitment: "unimplemented".to_string(),
        output_commitment: "unimplemented".to_string(),
        payload_commitment: "unimplemented".to_string(),
        subnetwork_id: SUBNETWORK_ID_NATIVE.to_string(),
        transaction_version: inner.global.tx_version,
        partial_signature_commitment,
    };

    Ok(serde_json::to_string(&result).unwrap())
}

#[napi]
pub fn pskt_decode_encode_roundtrip(payload_base64: String) -> Result<String> {
    if payload_base64.len() > MAX_PSKT_PAYLOAD_BYTES {
        return Err(Error::new(
            Status::InvalidArg,
            "Payload exceeds MAX_PSKT_PAYLOAD_BYTES".to_string(),
        ));
    }

    let input_bytes = general_purpose::STANDARD
        .decode(&payload_base64)
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid base64: {}", e)))?;

    let input_str = String::from_utf8(input_bytes.clone())
        .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid UTF-8: {}", e)))?;

    let canonical_before = if let Some(hex_data) = input_str.strip_prefix("PSKB") {
        let json_bytes = hex::decode(hex_data)
            .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid hex in PSKB: {}", e)))?;
        String::from_utf8(json_bytes)
            .map_err(|e| Error::new(Status::InvalidArg, format!("Invalid UTF-8 in JSON: {}", e)))?
    } else {
        return Err(Error::new(
            Status::InvalidArg,
            "Missing PSKB prefix".to_string(),
        ));
    };

    let bundle = Bundle::deserialize(&input_str).map_err(|e| {
        Error::new(
            Status::InvalidArg,
            format!("Failed to deserialize bundle: {:?}", e),
        )
    })?;

    let output_str = bundle.serialize().map_err(|e| {
        Error::new(
            Status::GenericFailure,
            format!("Failed to serialize bundle: {:?}", e),
        )
    })?;

    let canonical_after = if let Some(hex_data) = output_str.strip_prefix("PSKB") {
        let json_bytes = hex::decode(hex_data).unwrap();
        String::from_utf8(json_bytes).unwrap()
    } else {
        "".to_string()
    };

    let output_bytes = output_str.as_bytes();
    let output_base64 = general_purpose::STANDARD.encode(output_bytes);

    let result = PsktRoundtripResult {
        payload_base64: output_base64,
        byte_identical: input_bytes == output_bytes,
        input_hash: compute_sha256(&input_bytes),
        output_hash: compute_sha256(output_bytes),
        canonical_identity_before: canonical_before,
        canonical_identity_after: canonical_after,
    };

    Ok(serde_json::to_string(&result).unwrap())
}

#[derive(Serialize, Deserialize)]
struct CombineResult {
    #[serde(rename = "payloadBase64")]
    payload_base64: String,
    #[serde(rename = "inputPayloadHashes")]
    input_payload_hashes: Vec<String>,
    #[serde(rename = "outputPayloadHash")]
    output_payload_hash: String,
    #[serde(rename = "unsignedTransactionIdentity")]
    unsigned_transaction_identity: String,
    state: String,
}

#[napi]
pub fn pskt_combine(payloads_base64_json: String) -> Result<String> {
    let payloads: Vec<String> = serde_json::from_str(&payloads_base64_json).map_err(|e| {
        to_napi_error(
            "PSKT_JSON_PARSE_ERROR",
            "combine",
            "JsonError",
            &e.to_string(),
            None,
        )
    })?;

    if payloads.len() < 2 {
        return Err(to_napi_error(
            "PSKT_COMBINE_INSUFFICIENT_PAYLOADS",
            "combine",
            "ArgsError",
            "Need at least 2 payloads",
            None,
        ));
    }

    let mut base_bundle: Option<Bundle> = None;
    let mut unsigned_identity = String::new();
    let mut input_hashes = Vec::new();

    for p in payloads {
        if p.len() > MAX_PSKT_PAYLOAD_BYTES {
            return Err(to_napi_error(
                "PSKT_PAYLOAD_TOO_LARGE",
                "combine",
                "SizeError",
                "Exceeds max payload bytes",
                None,
            ));
        }
        let pskb_bytes = general_purpose::STANDARD.decode(&p).map_err(|e| {
            to_napi_error(
                "PSKT_BASE64_ERROR",
                "combine",
                "Base64Error",
                &e.to_string(),
                None,
            )
        })?;

        let p_hash = compute_sha256(&pskb_bytes);
        input_hashes.push(p_hash.clone());

        let pskb_str = String::from_utf8(pskb_bytes).map_err(|e| {
            to_napi_error(
                "PSKT_UTF8_ERROR",
                "combine",
                "Utf8Error",
                &e.to_string(),
                Some(p_hash.clone()),
            )
        })?;

        let bundle = Bundle::deserialize(&pskb_str).map_err(|e| {
            to_napi_error(
                "PSKT_DESERIALIZATION_FAILED",
                "combine",
                "DeserializeError",
                &e.to_string(),
                Some(p_hash.clone()),
            )
        })?;

        if let Some(bb) = base_bundle.take() {
            let bb_inners: Vec<_> = bb.iter().cloned().collect();
            let new_inners: Vec<_> = bundle.iter().cloned().collect();

            if bb_inners.len() != new_inners.len() {
                return Err(to_napi_error(
                    "PSKT_UNSIGNED_TX_MISMATCH",
                    "combine",
                    "LengthMismatch",
                    "Different number of inner PSKTs",
                    Some(p_hash.clone()),
                ));
            }

            let mut combined_pskts = Vec::new();
            for (b_inner, n_inner) in bb_inners.into_iter().zip(new_inners.into_iter()) {
                let p1: PSKT<Creator> = PSKT::from(b_inner);
                let p2: PSKT<Creator> = PSKT::from(n_inner);

                let id1 = p1.clone().constructor().updater().signer().calculate_id();
                let id2 = p2.clone().constructor().updater().signer().calculate_id();
                if id1 != id2 {
                    return Err(to_napi_error(
                        "PSKT_UNSIGNED_TX_MISMATCH",
                        "combine",
                        "TxIdMismatch",
                        "Different unsigned transactions",
                        Some(p_hash.clone()),
                    ));
                }

                let combined = (p1.constructor().updater().signer().combiner()
                    + p2.constructor().updater().signer().combiner())
                .map_err(|e| {
                    to_napi_error(
                        "PSKT_COMBINE_CONFLICT",
                        "combine",
                        "CombineError",
                        &e.to_string(),
                        Some(p_hash.clone()),
                    )
                })?;

                combined_pskts.push(combined);
            }
            base_bundle = Some(Bundle::from(combined_pskts));
        } else {
            if let Some(first) = bundle.iter().next() {
                let p1: PSKT<Creator> = PSKT::from(first.clone());
                unsigned_identity = p1
                    .constructor()
                    .updater()
                    .signer()
                    .calculate_id()
                    .to_string();
            }
            base_bundle = Some(bundle);
        }
    }

    let combined_bundle = base_bundle.unwrap();
    let output_str = combined_bundle.serialize().map_err(|e| {
        to_napi_error(
            "PSKT_SERIALIZATION_FAILED",
            "combine",
            "SerializeError",
            &e.to_string(),
            None,
        )
    })?;

    let output_bytes = output_str.as_bytes();
    let output_base64 = general_purpose::STANDARD.encode(output_bytes);

    let result = CombineResult {
        payload_base64: output_base64.clone(),
        input_payload_hashes: input_hashes,
        output_payload_hash: compute_sha256(output_bytes),
        unsigned_transaction_identity: unsigned_identity,
        state: "combined".to_string(),
    };

    Ok(serde_json::to_string(&result).unwrap())
}

#[derive(Serialize, Deserialize)]
struct FinalizeResult {
    #[serde(rename = "payloadBase64")]
    payload_base64: String,
    #[serde(rename = "inputPayloadHash")]
    input_payload_hash: String,
    #[serde(rename = "outputPayloadHash")]
    output_payload_hash: String,
    #[serde(rename = "unsignedTransactionIdentity")]
    unsigned_transaction_identity: String,
    state: String,
}

#[napi]
pub fn pskt_finalize(payload_base64: String) -> Result<String> {
    if payload_base64.len() > MAX_PSKT_PAYLOAD_BYTES {
        return Err(to_napi_error(
            "PSKT_PAYLOAD_TOO_LARGE",
            "finalize",
            "SizeError",
            "Exceeds max payload bytes",
            None,
        ));
    }
    let pskb_bytes = general_purpose::STANDARD
        .decode(&payload_base64)
        .map_err(|e| {
            to_napi_error(
                "PSKT_BASE64_ERROR",
                "finalize",
                "Base64Error",
                &e.to_string(),
                None,
            )
        })?;

    let input_hash = compute_sha256(&pskb_bytes);

    let pskb_str = String::from_utf8(pskb_bytes).map_err(|e| {
        to_napi_error(
            "PSKT_UTF8_ERROR",
            "finalize",
            "Utf8Error",
            &e.to_string(),
            Some(input_hash.clone()),
        )
    })?;

    let bundle = Bundle::deserialize(&pskb_str).map_err(|e| {
        to_napi_error(
            "PSKT_DESERIALIZATION_FAILED",
            "finalize",
            "DeserializeError",
            &e.to_string(),
            Some(input_hash.clone()),
        )
    })?;

    let mut unsigned_identity = String::new();
    let mut finalized_pskts = Vec::new();

    for inner in bundle.iter().cloned() {
        let p: PSKT<Creator> = PSKT::from(inner);
        if unsigned_identity.is_empty() {
            unsigned_identity = p
                .clone()
                .constructor()
                .updater()
                .signer()
                .calculate_id()
                .to_string();
        }

        let p_finalizer = p.constructor().updater().signer().finalizer();
        let finalized =
            p_finalizer.finalize_sync(|inner| -> Result<Vec<Vec<u8>>, String> {
                Ok(inner
                    .inputs
                    .iter()
                    .map(|i| {
                        let mut builder = kaspa_txscript::script_builder::ScriptBuilder::new();
                        i.partial_sigs.values().for_each(|s| {
                            let mut sig_bytes = s.clone().into_bytes().to_vec();
                            sig_bytes.push(i.sighash_type.to_u8());
                            builder.add_data(&sig_bytes).unwrap();
                        });
                        if let Some(ref script) = i.redeem_script {
                            builder.add_data(script.as_slice()).unwrap();
                        }
                        builder.drain()
                    })
                    .collect::<Vec<Vec<u8>>>())
            }).map_err(|e| {
                to_napi_error(
                    "PSKT_FINALIZATION_FAILED",
                    "finalize",
                    "FinalizeError",
                    &e.to_string(),
                    Some(input_hash.clone()),
                )
            })?;

        finalized_pskts.push(finalized);
    }

    let finalized_bundle = Bundle::from(finalized_pskts);
    let output_str = finalized_bundle.serialize().map_err(|e| {
        to_napi_error(
            "PSKT_SERIALIZATION_FAILED",
            "finalize",
            "SerializeError",
            &e.to_string(),
            Some(input_hash.clone()),
        )
    })?;

    let output_bytes = output_str.as_bytes();
    let output_base64 = general_purpose::STANDARD.encode(output_bytes);

    let result = FinalizeResult {
        payload_base64: output_base64.clone(),
        input_payload_hash: input_hash,
        output_payload_hash: compute_sha256(output_bytes),
        unsigned_transaction_identity: unsigned_identity,
        state: "finalized".to_string(),
    };

    Ok(serde_json::to_string(&result).unwrap())
}

#[derive(Serialize, Deserialize)]
struct ExtractResult {
    #[serde(rename = "transactionJson")]
    transaction_json: String,
    #[serde(rename = "transactionId")]
    transaction_id: String,
    #[serde(rename = "transactionVersion")]
    transaction_version: u16,
    #[serde(rename = "networkId")]
    network_id: String,
    #[serde(rename = "sourcePayloadHash")]
    source_payload_hash: String,
}

#[napi]
pub fn pskt_extract(payload_base64: String, network_id_str: String) -> Result<String> {
    if payload_base64.len() > MAX_PSKT_PAYLOAD_BYTES {
        return Err(to_napi_error(
            "PSKT_PAYLOAD_TOO_LARGE",
            "extract",
            "SizeError",
            "Exceeds max payload bytes",
            None,
        ));
    }

    let network_id = NetworkId::from_str(&network_id_str).map_err(|e| {
        to_napi_error(
            "PSKT_INVALID_NETWORK",
            "extract",
            "NetworkError",
            &e.to_string(),
            None,
        )
    })?;

    let params: Params = network_id.into();

    let pskb_bytes = general_purpose::STANDARD
        .decode(&payload_base64)
        .map_err(|e| {
            to_napi_error(
                "PSKT_BASE64_ERROR",
                "extract",
                "Base64Error",
                &e.to_string(),
                None,
            )
        })?;

    let source_hash = compute_sha256(&pskb_bytes);

    let pskb_str = String::from_utf8(pskb_bytes).map_err(|e| {
        to_napi_error(
            "PSKT_UTF8_ERROR",
            "extract",
            "Utf8Error",
            &e.to_string(),
            Some(source_hash.clone()),
        )
    })?;

    let bundle = Bundle::deserialize(&pskb_str).map_err(|e| {
        to_napi_error(
            "PSKT_DESERIALIZATION_FAILED",
            "extract",
            "DeserializeError",
            &e.to_string(),
            Some(source_hash.clone()),
        )
    })?;

    let inners: Vec<_> = bundle.iter().cloned().collect();
    if inners.len() != 1 {
        if inners.is_empty() {
            return Err(to_napi_error(
                "PSKT_EXTRACTION_FAILED",
                "extract",
                "EmptyBundle",
                "Bundle is empty",
                Some(source_hash.clone()),
            ));
        }
        if inners.len() > 1 {
            return Err(to_napi_error(
                "PSKT_EXTRACTION_FAILED",
                "extract",
                "MultipleTx",
                "Cannot extract single transaction from multiple bundle",
                Some(source_hash.clone()),
            ));
        }
    }

    let inner = inners[0].clone();
    let p: PSKT<Creator> = PSKT::from(inner.clone());
    let p_finalizer = p.constructor().updater().signer().finalizer();

    let p_extractor = p_finalizer.extractor().map_err(|_| {
        to_napi_error(
            "PSKT_NOT_FINALIZED",
            "extract",
            "NotFinalized",
            "PSKT is not ready for extraction",
            Some(source_hash.clone()),
        )
    })?;

    let tx_res = p_extractor.extract_tx(&params).map_err(|e| {
        to_napi_error(
            "PSKT_EXTRACTION_FAILED",
            "extract",
            "ExtractError",
            &e.to_string(),
            Some(source_hash.clone()),
        )
    })?;

    let tx_id = tx_res.id().to_string();
    let tx_version = tx_res.tx.version;

    let native_tx = NativeTransactionJson {
        version: tx_res.tx.version,
        mass: tx_res.tx.storage_mass().to_string(),
        lock_time: tx_res.tx.lock_time.to_string(),
        inputs: tx_res.tx.inputs.iter().enumerate().map(|(idx, i)| NativeInputJson {
            previous_outpoint: NativeOutpointJson {
                transaction_id: i.previous_outpoint.transaction_id.to_string(),
                index: i.previous_outpoint.index,
            },
            signature_script: hex::encode(&i.signature_script),
            sequence: i.sequence.to_string(),
            sig_op_count: inner.inputs[idx].sig_op_count.unwrap_or(1),
        }).collect(),
        outputs: tx_res.tx.outputs.iter().map(|o| NativeOutputJson {
            value: o.value.to_string(),
            script_public_key: NativeScriptPublicKeyJson {
                version: o.script_public_key.version(),
                script: hex::encode(o.script_public_key.script()),
            },
        }).collect(),
        payload: hex::encode(&tx_res.tx.payload),
        subnetwork_id: tx_res.tx.subnetwork_id.to_string(),
    };

    let tx_json = serde_json::to_string(&native_tx).map_err(|e| {
        to_napi_error(
            "PSKT_EXTRACTION_FAILED",
            "extract",
            "JsonError",
            &e.to_string(),
            Some(source_hash.clone()),
        )
    })?;

    let result = ExtractResult {
        transaction_json: tx_json,
        transaction_id: tx_id,
        transaction_version: tx_version,
        network_id: network_id.to_string(),
        source_payload_hash: source_hash,
    };

    Ok(serde_json::to_string(&result).unwrap())
}

#[derive(Serialize, Deserialize)]
struct SignRequest {
    #[serde(rename = "inputIndexes")]
    input_indexes: Option<Vec<usize>>,
}

#[derive(Serialize, Deserialize)]
struct SignResult {
    #[serde(rename = "payloadBase64")]
    payload_base64: String,
    #[serde(rename = "inputPayloadHash")]
    input_payload_hash: String,
    #[serde(rename = "outputPayloadHash")]
    output_payload_hash: String,
    state: String,
}

fn build_unsigned_tx(inner: &Inner) -> SignableTransaction {
    let tx = Transaction::new(
        inner.global.tx_version,
        inner
            .inputs
            .iter()
            .map(|i| TransactionInput {
                previous_outpoint: i.previous_outpoint,
                signature_script: vec![],
                sequence: i.sequence.unwrap_or(u64::MAX),
                compute_commit: ComputeCommit::SigopCount(i.sig_op_count.unwrap_or(0).into()),
            })
            .collect(),
        inner
            .outputs
            .iter()
            .map(|o| TransactionOutput {
                value: o.amount,
                script_public_key: o.script_public_key.clone(),
                covenant: o.covenant,
            })
            .collect(),
        inner
            .inputs
            .iter()
            .map(|i| i.min_time)
            .max()
            .unwrap_or(inner.global.fallback_lock_time)
            .unwrap_or(0),
        SUBNETWORK_ID_NATIVE,
        0,
        inner.global.payload.clone().unwrap_or_default(),
    );
    let entries = inner
        .inputs
        .iter()
        .filter_map(|i| i.utxo_entry.clone())
        .collect();
    SignableTransaction::with_entries(tx, entries)
}

use zeroize::Zeroizing;

#[napi]
pub fn pskt_sign(
    payload_base64: String,
    private_keys: Vec<napi::bindgen_prelude::Buffer>,
    request_json: String,
) -> Result<String> {
    let req: SignRequest = match serde_json::from_str(&request_json) {
        Ok(r) => r,
        Err(e) => {
            return Err(to_napi_error(
                "PSKT_JSON_PARSE_ERROR",
                "sign",
                "ParseError",
                &e.to_string(),
                None,
            ))
        }
    };

    // Copy the JS buffers into Rust-owned zeroizing memory
    let secret_keys: Vec<Zeroizing<Vec<u8>>> = private_keys
        .into_iter()
        .map(|buf| Zeroizing::new(buf.as_ref().to_vec()))
        .collect();

    if secret_keys.is_empty() || secret_keys.iter().all(|k| k.is_empty()) {
        return Err(to_napi_error(
            "PSKT_SIGNING_KEY_REQUIRED",
            "sign",
            "ArgsError",
            "No keys provided",
            None,
        ));
    }

    if payload_base64.len() > MAX_PSKT_PAYLOAD_BYTES {
        return Err(to_napi_error(
            "PSKT_PAYLOAD_TOO_LARGE",
            "sign",
            "SizeError",
            "Exceeds max payload bytes",
            None,
        ));
    }

    let pskb_bytes = match general_purpose::STANDARD.decode(&payload_base64) {
        Ok(b) => b,
        Err(e) => {
            return Err(to_napi_error(
                "PSKT_BASE64_ERROR",
                "sign",
                "Base64Error",
                &e.to_string(),
                None,
            ));
        }
    };

    let input_hash = compute_sha256(&pskb_bytes);

    let pskb_str = match String::from_utf8(pskb_bytes) {
        Ok(s) => s,
        Err(e) => {
            return Err(to_napi_error(
                "PSKT_UTF8_ERROR",
                "sign",
                "Utf8Error",
                &e.to_string(),
                Some(input_hash.clone()),
            ));
        }
    };

    let bundle = match Bundle::deserialize(&pskb_str) {
        Ok(b) => b,
        Err(e) => {
            return Err(to_napi_error(
                "PSKT_DESERIALIZATION_FAILED",
                "sign",
                "DeserializeError",
                &e.to_string(),
                Some(input_hash.clone()),
            ));
        }
    };

    let mut signed_inners = Vec::new();

    for mut inner in bundle.iter().cloned() {
        let unsigned_tx = build_unsigned_tx(&inner);
        let mut entries = Vec::new();
        for i_in in &inner.inputs {
            if let Some(utxo) = &i_in.utxo_entry {
                entries.push(utxo.clone());
            } else {
                return Err(to_napi_error(
                    "PSKT_MISSING_UTXO",
                    "sign",
                    "DataError",
                    "Missing UTXO for input in PSKT",
                    None,
                ));
            }
        }
        let mutable_tx = kaspa_consensus_core::tx::MutableTransaction::with_entries(unsigned_tx, entries);
        let sighashes: Vec<_> = inner.inputs.iter().map(|i| i.sighash_type).collect();
        let mut reused_values = kaspa_consensus_core::hashing::sighash::SigHashReusedValuesUnsync::new();

        // Determine targets for signing
        let sign_targets = if let Some(ref idxs) = req.input_indexes {
            if idxs.is_empty() {
                return Err(to_napi_error(
                    "PSKT_SIGNING_KEY_REQUIRED",
                    "sign",
                    "ArgsError",
                    "inputIndexes cannot be empty",
                    Some(input_hash.clone()),
                ));
            }
            idxs.clone()
        } else {
            return Err(to_napi_error(
                "PSKT_SIGNING_KEY_REQUIRED",
                "sign",
                "ArgsError",
                "inputIndexes is required",
                Some(input_hash.clone()),
            ));
        };

        for priv_key_buf in &secret_keys {
            if priv_key_buf.is_empty() {
                continue;
            }

            let keypair =
                match secp256k1::Keypair::from_seckey_slice(SECP256K1, priv_key_buf.as_ref()) {
                    Ok(k) => k,
                    Err(_) => {
                        return Err(to_napi_error(
                            "PSKT_SIGN_FAILED",
                            "sign",
                            "Secp256k1Error",
                            "Invalid private key format",
                            Some(input_hash.clone()),
                        ));
                    }
                };

            let pubkey = keypair.public_key();
            let xonly_pubkey = secp256k1::XOnlyPublicKey::from(pubkey);

            for &input_idx in &sign_targets {
                if input_idx >= inner.inputs.len() {
                    continue;
                }

                let input = &mut inner.inputs[input_idx];

                // Remove the heuristic script_public_key check. Let the control check fail.

                let mut controls = false;
                for (pk, _) in &input.bip32_derivations {
                    let pk_bytes = pk.serialize();
                    let xonly_bytes = xonly_pubkey.serialize();
                    if pk_bytes.len() >= 32
                        && xonly_bytes.len() == 32
                        && pk_bytes[pk_bytes.len() - 32..] == xonly_bytes
                    {
                        controls = true;
                        break;
                    }
                    if pk_bytes.as_ref() == pubkey.serialize().as_slice() {
                        controls = true;
                        break;
                    }
                }

                if !controls && !input.bip32_derivations.is_empty() {
                    return Err(to_napi_error(
                        "PRIVATE_KEY_DOES_NOT_CONTROL_INPUT",
                        "sign",
                        "ArgsError",
                        "Private key does not control input",
                        Some(input_hash.clone()),
                    ));
                }

                if !controls && input.bip32_derivations.is_empty() {
                    // Fallback requirement says "throw si la clave no controla el input".
                    // If no bip32_derivations, we cannot verify control, so we must error.
                    return Err(to_napi_error(
                        "PRIVATE_KEY_DOES_NOT_CONTROL_INPUT",
                        "sign",
                        "ArgsError",
                        "No Bip32 derivations found, cannot verify control",
                        Some(input_hash.clone()),
                    ));
                }

                let hash = calc_schnorr_signature_hash(
                    &mutable_tx.as_verifiable(),
                    input_idx,
                    sighashes[input_idx],
                    &reused_values,
                );

                let pubkey_key = pubkey.into();
                if input.partial_sigs.contains_key(&pubkey_key) {
                    continue;
                }

                let msg = match Message::from_digest_slice(hash.as_bytes().as_slice()) {
                    Ok(m) => m,
                    Err(_) => {
                        return Err(to_napi_error(
                            "PSKT_SIGN_FAILED",
                            "sign",
                            "Secp256k1Error",
                            "Invalid digest slice",
                            Some(input_hash.clone()),
                        ));
                    }
                };

                let sig = keypair.sign_schnorr(msg);
                input
                    .partial_sigs
                    .insert(pubkey.into(), Signature::Schnorr(sig));
            }
        }
        signed_inners.push(inner);
    }

    // secret_keys are zeroized on drop.

    let signed_bundle = Bundle::from(
        signed_inners
            .into_iter()
            .map(PSKT::<Creator>::from)
            .collect::<Vec<_>>(),
    );
    let output_str = match signed_bundle.serialize() {
        Ok(s) => s,
        Err(e) => {
            return Err(to_napi_error(
                "PSKT_SERIALIZATION_FAILED",
                "sign",
                "SerializeError",
                &e.to_string(),
                Some(input_hash.clone()),
            ))
        }
    };

    let output_bytes = output_str.as_bytes();
    let output_base64 = general_purpose::STANDARD.encode(output_bytes);

    let result = SignResult {
        payload_base64: output_base64,
        input_payload_hash: input_hash,
        output_payload_hash: compute_sha256(output_bytes),
        state: "signed".to_string(),
    };

    Ok(serde_json::to_string(&result).unwrap())
}

#[cfg(test)]
mod tests {
    use super::*;
    use kaspa_wallet_pskt::pskt::Input;
    use secp256k1::{Keypair, Secp256k1};

    #[test]
    fn test_sign_flow() {
        let secp = Secp256k1::new();
        let (secret_key, public_key) = secp.generate_keypair(&mut secp256k1::rand::thread_rng());
        let _keypair = Keypair::from_secret_key(&secp, &secret_key);

        use kaspa_consensus_core::tx::{ScriptPublicKey, UtxoEntry};

        let mut inner = kaspa_wallet_pskt::pskt::Inner::default();
        let mut input = Input::default();

        // Add UTXO entry to prevent panic in unsigned_tx()
        input.utxo_entry = Some(UtxoEntry::new(
            1000,
            ScriptPublicKey::new(0, vec![].into()),
            0,
            false,
            None,
        ));

        // Setup Bip32 derivation to match our public key
        input.bip32_derivations.insert(public_key.into(), None);
        inner.inputs.push(input);

        let mut bundle = Bundle::new();
        bundle.add_pskt(PSKT::<kaspa_wallet_pskt::pskt::Creator>::from(inner));

        let unsigned_b64 = general_purpose::STANDARD.encode(bundle.serialize().unwrap().as_bytes());

        let priv_key_buf = napi::bindgen_prelude::Buffer::from(secret_key.secret_bytes().to_vec());
        let signed_json = pskt_sign(
            unsigned_b64,
            vec![priv_key_buf],
            r#"{"inputIndexes":[0]}"#.to_string(),
        )
        .expect("Sign failed");
        let result: SignResult = serde_json::from_str(&signed_json).unwrap();

        assert_eq!(result.state, "signed");

        // Ensure that partial_sigs contains the signature!
        let signed_bytes = general_purpose::STANDARD
            .decode(result.payload_base64.clone())
            .unwrap();
        let signed_str = String::from_utf8(signed_bytes).unwrap();
        let signed_bundle = Bundle::deserialize(&signed_str).unwrap();

        let pskt = &signed_bundle.0[0];
        assert!(
            !pskt.inputs[0].partial_sigs.is_empty(),
            "Signature should be present"
        );

        // Finalize it
        let finalized_json = pskt_finalize(result.payload_base64.clone()).expect("Finalize failed");
        let finalized: FinalizeResult = serde_json::from_str(&finalized_json).unwrap();
        assert_eq!(finalized.state, "finalized");
    }
}
