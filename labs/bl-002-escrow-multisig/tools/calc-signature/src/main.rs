use kaspa_consensus_core::hashing::sighash::{
    calc_schnorr_signature_hash, SigHashReusedValuesUnsync,
};
use kaspa_consensus_core::hashing::sighash_type::SIG_HASH_ALL;
use kaspa_consensus_core::tx::{
    MutableTransaction, ScriptPublicKey, Transaction, TransactionId, TransactionInput,
    TransactionOutpoint, TransactionOutput, UtxoEntry,
};
use serde::{Deserialize, Serialize};
use std::env;
use std::fs;
use std::str::FromStr;

#[derive(Deserialize)]
struct CalcSigRequest {
    private_key_hex: String,
    utxo: UtxoDef,
    tx: TxDef,
    input_index: usize,
}

#[derive(Deserialize)]
struct UtxoDef {
    amount: u64,
    script_public_key_hex: String,
    block_daa_score: u64,
    is_coinbase: bool,
}

#[derive(Deserialize)]
struct TxDef {
    version: u16,
    inputs: Vec<InputDef>,
    outputs: Vec<OutputDef>,
    lock_time: u64,
    subnetwork_id: String,
    gas: u64,
    payload: String,
}

#[derive(Deserialize)]
struct InputDef {
    txid: String,
    index: u32,
    sequence: u64,
    sig_op_count: Option<u8>,
}

#[derive(Deserialize)]
struct OutputDef {
    amount: u64,
    script_public_key_hex: String,
}

#[derive(Serialize)]
struct CalcSigResponse {
    signature_hex: String,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: calc-signature <request.json>");
        std::process::exit(1);
    }

    let json_str = fs::read_to_string(&args[1]).unwrap();
    let req: CalcSigRequest = serde_json::from_str(&json_str).unwrap();

    // Parse private key
    let secret_bytes = hex::decode(&req.private_key_hex).unwrap();
    let secret_key = secp256k1::SecretKey::from_slice(&secret_bytes).unwrap();
    let keypair = secp256k1::Keypair::from_secret_key(secp256k1::SECP256K1, &secret_key);

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

    // Build Tx
    let inputs: Vec<TransactionInput> = req
        .tx
        .inputs
        .into_iter()
        .map(|i| {
            let outpoint =
                TransactionOutpoint::new(TransactionId::from_str(&i.txid).unwrap(), i.index);
            TransactionInput::new(outpoint, vec![], i.sequence, i.sig_op_count.unwrap_or(1))
        })
        .collect();

    let outputs: Vec<TransactionOutput> = req
        .tx
        .outputs
        .into_iter()
        .map(|o| {
            let spk_bytes = hex::decode(&o.script_public_key_hex).unwrap();
            TransactionOutput::new(o.amount, ScriptPublicKey::new(0, spk_bytes.into()))
        })
        .collect();

    let subnet_bytes = hex::decode(&req.tx.subnetwork_id).unwrap();
    let mut subnet_array = [0u8; 20];
    subnet_array.copy_from_slice(&subnet_bytes);

    let tx = Transaction::new(
        req.tx.version,
        inputs,
        outputs,
        req.tx.lock_time,
        kaspa_consensus_core::subnets::SubnetworkId::from_bytes(subnet_array),
        req.tx.gas,
        hex::decode(&req.tx.payload).unwrap(),
    );

    let mutable_tx = MutableTransaction::with_entries(tx, vec![utxo_entry]);

    let reused = SigHashReusedValuesUnsync::new();
    let sighash = calc_schnorr_signature_hash(
        &mutable_tx.as_verifiable(),
        req.input_index,
        SIG_HASH_ALL,
        &reused,
    );
    let msg = secp256k1::Message::from_digest_slice(sighash.as_bytes().as_slice()).unwrap();
    let sig = secp256k1::SECP256K1.sign_schnorr(&msg, &keypair);

    // Convert signature to bytes and append sighash type
    let sig_bytes = sig.serialize();
    let mut final_sig = sig_bytes.to_vec();
    final_sig.push(SIG_HASH_ALL.to_u8());

    let res = CalcSigResponse {
        signature_hex: hex::encode(final_sig),
    };

    println!("{}", serde_json::to_string(&res).unwrap());
}
