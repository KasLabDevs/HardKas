use kaspa_consensus_core::tx::{
    ScriptPublicKey, Transaction, TransactionId, TransactionInput, TransactionOutpoint,
    TransactionOutput, UtxoEntry,
};
use kaspa_consensus_core::hashing::sighash::{SigHashReusedValuesUnsync, calc_schnorr_signature_hash};
use kaspa_consensus_core::hashing::sighash_type::SIG_HASH_ALL;
use kaspa_txscript::opcodes::codes::OpData32;
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::str::FromStr;

#[derive(Deserialize)]
struct SignP2pkRequest {
    private_key_hex: String,
    utxo: UtxoDef,
    outputs: Vec<OutputDef>,
}

#[derive(Deserialize)]
struct UtxoDef {
    txid: String,
    index: u32,
    amount: u64,
    script_public_key_hex: String,
    block_daa_score: u64,
    is_coinbase: bool,
}

#[derive(Deserialize)]
struct OutputDef {
    amount: u64,
    script_public_key_hex: String,
}

#[derive(Serialize)]
struct SignedResult {
    transaction_id: String,
    transaction: SignedTransaction,
}

#[derive(Serialize)]
struct SignedTransaction {
    version: u16,
    inputs: Vec<SignedInput>,
    outputs: Vec<SignedOutput>,
    lock_time: u64,
    subnetwork_id: String,
    gas: u64,
    payload: String,
    mass: u64,
}

#[derive(Serialize)]
struct SignedInput {
    previous_outpoint: SignedOutpoint,
    signature_script: String,
    sequence: u64,
    sig_op_count: u8,
}

#[derive(Serialize)]
struct SignedOutpoint {
    transaction_id: String,
    index: u32,
}

#[derive(Serialize)]
struct SignedOutput {
    value: u64,
    script_public_key: SignedSpk,
}

#[derive(Serialize)]
struct SignedSpk {
    version: u16,
    script_public_key: String,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: sign-p2pk-tx <request.json>");
        std::process::exit(1);
    }

    let json_str = fs::read_to_string(&args[1]).unwrap();
    let req: SignP2pkRequest = serde_json::from_str(&json_str).unwrap();

    // Parse private key
    let secret_bytes = hex::decode(&req.private_key_hex).unwrap();
    let secret_key = secp256k1::SecretKey::from_slice(&secret_bytes).unwrap();
    let secp = secp256k1::Secp256k1::new();
    let keypair = secp256k1::Keypair::from_secret_key(&secp, &secret_key);
    let (x_only, _parity) = keypair.x_only_public_key();

    // Build UTXO entry
    let utxo_spk_bytes = hex::decode(&req.utxo.script_public_key_hex).unwrap();
    let utxo_spk = ScriptPublicKey::new(0, utxo_spk_bytes.into());

    let utxo_entry = UtxoEntry::new(
        req.utxo.amount,
        utxo_spk,
        req.utxo.block_daa_score,
        req.utxo.is_coinbase,
        None,
    );

    // Build transaction
    let txid = TransactionId::from_str(&req.utxo.txid).unwrap();
    let outpoint = TransactionOutpoint::new(txid, req.utxo.index);

    let input = TransactionInput::new(outpoint, vec![], 0, 1);

    let outputs: Vec<TransactionOutput> = req
        .outputs
        .iter()
        .map(|o| {
            let spk_bytes = hex::decode(&o.script_public_key_hex).unwrap();
            let spk = ScriptPublicKey::new(0, spk_bytes.into());
            TransactionOutput::new(o.amount, spk)
        })
        .collect();

    let mut tx = Transaction::new(
        0,                       // version
        vec![input],             // inputs
        outputs,                 // outputs
        0,                       // locktime
        kaspa_consensus_core::subnets::SUBNETWORK_ID_NATIVE, // subnetwork
        0,                       // gas
        vec![],                  // payload
    );

    // Build MutableTransaction for sighash computation
    let mutable_tx = kaspa_consensus_core::tx::MutableTransaction::with_entries(
        tx.clone(),
        vec![utxo_entry],
    );

    // Compute sighash and sign
    let reused = SigHashReusedValuesUnsync::new();
    let sighash = calc_schnorr_signature_hash(
        &mutable_tx.as_verifiable(),
        0, // input index
        SIG_HASH_ALL,
        &reused,
    );

    let msg = secp256k1::Message::from_digest_slice(sighash.as_bytes().as_slice()).unwrap();
    let sig = secp.sign_schnorr(&msg, &keypair);

    // Build signatureScript: <sig> <pubkey>
    let sig_bytes = sig.serialize();
    let pub_bytes = x_only.serialize();

    // Kaspa signatureScript format for P2PK:
    // [sig_hash_type(1)] [sig(64)] => 65 bytes pushed
    let mut sig_script = Vec::new();
    // Push 65 bytes (sig + sighash_type)
    sig_script.push(65u8); // push opcode for 65 bytes
    sig_script.extend_from_slice(&sig_bytes);
    sig_script.push(0x01); // SIG_HASH_ALL

    tx.inputs[0].signature_script = sig_script.clone();

    let tx_id = tx.id();

    let result = SignedResult {
        transaction_id: tx_id.to_string(),
        transaction: SignedTransaction {
            version: 0,
            inputs: vec![SignedInput {
                previous_outpoint: SignedOutpoint {
                    transaction_id: req.utxo.txid.clone(),
                    index: req.utxo.index,
                },
                signature_script: hex::encode(&sig_script),
                sequence: 0,
                sig_op_count: 1,
            }],
            outputs: req
                .outputs
                .iter()
                .map(|o| SignedOutput {
                    value: o.amount,
                    script_public_key: SignedSpk {
                        version: 0,
                        script_public_key: o.script_public_key_hex.clone(),
                    },
                })
                .collect(),
            lock_time: 0,
            subnetwork_id: "0000000000000000000000000000000000000000".to_string(),
            gas: 0,
            payload: "".to_string(),
            mass: 0,
        },
    };

    println!("{}", serde_json::to_string_pretty(&result).unwrap());
}
