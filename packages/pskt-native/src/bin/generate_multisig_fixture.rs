use kaspa_consensus_core::tx::UtxoEntry;
use kaspa_wallet_pskt::bundle::Bundle;
use kaspa_wallet_pskt::pskt::Input;
use std::env;
use std::str::FromStr;

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 7 {
        eprintln!("Usage: generate_multisig_fixture <pubkey1> <pubkey2> <pubkey3> <redeem_script_hex> <amount> <sequence>");
        std::process::exit(1);
    }

    let pk1_hex = &args[1];
    let pk2_hex = &args[2];
    let pk3_hex = &args[3];
    let redeem_script_hex = &args[4];
    let amount: u64 = u64::from_str(&args[5]).unwrap();
    let sequence: u64 = u64::from_str(&args[6]).unwrap();

    let mut txid_hex =
        "0000000000000000000000000000000000000000000000000000000000000000".to_string();
    let mut index: u32 = 0;
    if args.len() >= 9 {
        txid_hex = args[7].clone();
        index = u32::from_str(&args[8]).unwrap();
    }

    let mut inner = kaspa_wallet_pskt::pskt::Inner::default();

    let mut input = Input::default();

    // The script_public_key would be the P2SH script, which is aa20 <script_hash> 87
    let script_bytes = hex::decode(redeem_script_hex).unwrap();
    let p2sh_spk = kaspa_txscript::pay_to_script_hash_script(&script_bytes);

    input.utxo_entry = Some(UtxoEntry::new(amount, p2sh_spk.clone(), 0, false, None));

    let txid = kaspa_consensus_core::tx::TransactionId::from_str(&txid_hex).unwrap();
    input.previous_outpoint = kaspa_consensus_core::tx::TransactionOutpoint::new(txid, index);
    input.sequence = Some(sequence);

    // Add derivations for all 3 signers so they know they can sign
    let pk1 = secp256k1::PublicKey::from_str(pk1_hex).unwrap();
    let pk2 = secp256k1::PublicKey::from_str(pk2_hex).unwrap();
    let pk3 = secp256k1::PublicKey::from_str(pk3_hex).unwrap();

    input.bip32_derivations.insert(pk1, None);
    input.bip32_derivations.insert(pk2, None);
    input.bip32_derivations.insert(pk3, None);

    // We must provide the redeem_script so they can sign!
    input.redeem_script = Some(script_bytes);

    // Set sig_op_count for the 2-of-3 multisig script as per Kaspa node rules (must match num pubkeys exactly)
    input.sig_op_count = Some(3);

    inner.inputs.push(input);

    let mut out_amount = amount;
    if args.len() >= 10 {
        out_amount = u64::from_str(&args[9]).unwrap();
    }

    let out = kaspa_wallet_pskt::pskt::Output {
        amount: out_amount,
        script_public_key: p2sh_spk.clone(),
        ..Default::default()
    };
    inner.outputs.push(out);

    let pskt: kaspa_wallet_pskt::pskt::PSKT<kaspa_wallet_pskt::pskt::Creator> =
        kaspa_wallet_pskt::pskt::PSKT::from(inner);

    let mut bundle = Bundle::new();
    bundle.add_pskt(pskt);

    let address =
        kaspa_txscript::extract_script_pub_key_address(&p2sh_spk, kaspa_addresses::Prefix::Simnet)
            .unwrap();

    match bundle.serialize() {
        Ok(s) => {
            use base64::{engine::general_purpose, Engine as _};
            let b64 = general_purpose::STANDARD.encode(s.as_bytes());

            let json = serde_json::json!({
                "payloadBase64": b64,
                "address": address.to_string()
            });
            println!("{}", serde_json::to_string_pretty(&json).unwrap());
        }
        Err(e) => eprintln!("Error serializing bundle: {:?}", e),
    }
}
