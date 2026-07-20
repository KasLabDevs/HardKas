#[derive(Serialize, Deserialize)]
struct SignRequest {
    #[serde(rename = "inputIndexes")]
    input_indexes: Option<Vec<usize>>,
}

#[napi]
pub fn pskt_sign(payload_base64: String, private_keys: Vec<napi::bindgen_prelude::Buffer>, request_json: String) -> Result<String> {
    let req: SignRequest = match serde_json::from_str(&request_json) {
        Ok(r) => r,
        Err(e) => return Err(to_napi_error("PSKT_JSON_PARSE_ERROR", "sign", "ParseError", &e.to_string(), None)),
    };

    // Copy the JS buffers into Rust-owned zeroizing memory
    let secret_keys: Vec<Zeroizing<Vec<u8>>> = private_keys.into_iter()
        .map(|buf| Zeroizing::new(buf.as_ref().to_vec()))
        .collect();

    if payload_base64.len() > MAX_PSKT_PAYLOAD_BYTES {
        return Err(to_napi_error("PSKT_PAYLOAD_TOO_LARGE", "sign", "SizeError", "Exceeds max payload bytes", None));
    }

    let pskb_bytes = match general_purpose::STANDARD.decode(&payload_base64) {
        Ok(b) => b,
        Err(e) => {
            return Err(to_napi_error("PSKT_BASE64_ERROR", "sign", "Base64Error", &e.to_string(), None));
        }
    };

    let input_hash = compute_sha256(&pskb_bytes);

    let pskb_str = match String::from_utf8(pskb_bytes) {
        Ok(s) => s,
        Err(e) => {
            return Err(to_napi_error("PSKT_UTF8_ERROR", "sign", "Utf8Error", &e.to_string(), Some(input_hash)));
        }
    };

    let bundle = match Bundle::deserialize(&pskb_str) {
        Ok(b) => b,
        Err(e) => {
            return Err(to_napi_error("PSKT_DESERIALIZATION_FAILED", "sign", "DeserializeError", &e.to_string(), Some(input_hash)));
        }
    };

    let mut signed_inners = Vec::new();
    let reused_values = SigHashReusedValuesUnsync::new();

    for mut inner in bundle.iter().cloned() {
        let unsigned_tx = build_unsigned_tx(&inner);
        let sighashes: Vec<_> = inner.inputs.iter().map(|i| i.sighash_type).collect();

        // Determine targets for signing
        let sign_targets = if let Some(ref idxs) = req.input_indexes {
            if idxs.is_empty() {
                return Err(to_napi_error("PSKT_SIGNING_KEY_REQUIRED", "sign", "ArgsError", "inputIndexes cannot be empty", Some(input_hash.clone())));
            }
            idxs.clone()
        } else {
            return Err(to_napi_error("PSKT_SIGNING_KEY_REQUIRED", "sign", "ArgsError", "inputIndexes is required", Some(input_hash.clone())));
        };

        for priv_key_buf in &secret_keys {
            if priv_key_buf.is_empty() { continue; }
            
            let keypair = match secp256k1::Keypair::from_seckey_slice(SECP256K1, priv_key_buf.as_ref()) {
                Ok(k) => k,
                Err(_) => {
                    return Err(to_napi_error("PSKT_SIGN_FAILED", "sign", "Secp256k1Error", "Invalid private key format", Some(input_hash.clone())));
                }
            };
            
            let pubkey = keypair.public_key();
            let xonly_pubkey = secp256k1::XOnlyPublicKey::from(pubkey);
            
            for &input_idx in &sign_targets {
                if input_idx >= inner.inputs.len() {
                    continue;
                }
                
                let input = &mut inner.inputs[input_idx];
                
                // Check if covenant
                if let Some(utxo) = &input.utxo_entry {
                    if utxo.script_public_key.version() > 0 {
                        return Err(to_napi_error("PSKT_INPUT_NOT_KEY_SIGNABLE", "sign", "ArgsError", "Requested input is a covenant", Some(input_hash.clone())));
                    }
                }

                // Check control via bip32_derivations
                let mut controls = false;
                if input.bip32_derivations.is_empty() {
                    // Fallback to checking if we just want to sign it blindly? 
                    // Requirements say: throw if key doesn't control input.
                    // If we have no bip32_derivations, we can't be sure it's ours.
                    // But if it's the only key provided and we don't strictly enforce? 
                    // Let's enforce it strictly unless it's empty, actually wait, the user said "throw si la clave no controla el input".
                    // Let's strictly require bip32 matching, or if we want to be lax, check if it's not empty first.
                    // Let's assume we require the pubkey to be in bip32 derivations.
                }

                for (pk, _) in &input.bip32_derivations {
                    let pk_bytes = pk.as_slice();
                    let xonly_bytes = xonly_pubkey.0.serialize();
                    // Just comparing the x-only part to be safe, as derivations might use compressed or x-only
                    if pk_bytes.len() >= 32 && xonly_bytes.len() == 32 && pk_bytes[pk_bytes.len()-32..] == xonly_bytes {
                        controls = true;
                        break;
                    }
                    if pk_bytes == pubkey.serialize().as_slice() {
                        controls = true;
                        break;
                    }
                }

                if !controls && !input.bip32_derivations.is_empty() {
                    return Err(to_napi_error("PRIVATE_KEY_DOES_NOT_CONTROL_INPUT", "sign", "ArgsError", "Private key does not control input", Some(input_hash.clone())));
                }

                if !controls && input.bip32_derivations.is_empty() {
                    // If derivations is empty, we don't know who controls it. We'll fail to be safe.
                    return Err(to_napi_error("PRIVATE_KEY_DOES_NOT_CONTROL_INPUT", "sign", "ArgsError", "No Bip32 derivations found, cannot verify control", Some(input_hash.clone())));
                }

                let hash = calc_schnorr_signature_hash(&unsigned_tx.as_verifiable(), input_idx, sighashes[input_idx], &reused_values);
                
                let msg = match Message::from_digest_slice(hash.as_bytes().as_slice()) {
                    Ok(m) => m,
                    Err(_) => {
                        return Err(to_napi_error("PSKT_SIGN_FAILED", "sign", "Secp256k1Error", "Invalid digest slice", Some(input_hash.clone())));
                    }
                };

                let sig = keypair.sign_schnorr(msg);
                input.partial_sigs.insert(pubkey, Signature::Schnorr(sig));
            }
        }
        signed_inners.push(inner);
    }

    // secret_keys are zeroized on drop.

    let signed_bundle = Bundle::from(signed_inners.into_iter().map(PSKT::<Creator>::from).collect::<Vec<_>>());
    let output_str = match signed_bundle.serialize() {
        Ok(s) => s,
        Err(e) => return Err(to_napi_error("PSKT_SERIALIZATION_FAILED", "sign", "SerializeError", &e.to_string(), Some(input_hash))),
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
