use kaspa_consensus_core::tx::{ScriptPublicKey, UtxoEntry};
use kaspa_wallet_pskt::bundle::Bundle;
use kaspa_wallet_pskt::pskt::Input;
use serde::Deserialize;
use std::env;
use std::fs;
use std::str::FromStr;

#[derive(Deserialize)]
struct PsktInputDef {
    txid: String,
    index: u32,
    amount: u64,
    script_hex: String,
    sequence: u64,
    signers: Vec<String>, // hex pubkeys
    sig_op_count: u8,
    redeem_script_hex: Option<String>,
}

#[derive(Deserialize)]
struct PsktOutputDef {
    amount: u64,
    script_hex: String,
}

#[derive(Deserialize)]
struct PsktDef {
    inputs: Vec<PsktInputDef>,
    outputs: Vec<PsktOutputDef>,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: generate_pskt <pskt_def.json>");
        std::process::exit(1);
    }

    let json_str = fs::read_to_string(&args[1]).unwrap();
    let def: PsktDef = serde_json::from_str(&json_str).unwrap();

    let mut inner = kaspa_wallet_pskt::pskt::Inner::default();

    for in_def in def.inputs {
        let mut input = Input::default();
        let script_bytes = hex::decode(&in_def.script_hex).unwrap();

        let spk = ScriptPublicKey::new(0, script_bytes.clone().into());

        input.utxo_entry = Some(UtxoEntry::new(in_def.amount, spk, 0, false, None));

        let txid = kaspa_consensus_core::tx::TransactionId::from_str(&in_def.txid).unwrap();
        input.previous_outpoint =
            kaspa_consensus_core::tx::TransactionOutpoint::new(txid, in_def.index);
        input.sequence = Some(in_def.sequence);

        for signer_hex in in_def.signers {
            if let Ok(pk) = secp256k1::PublicKey::from_str(&signer_hex) {
                input.bip32_derivations.insert(pk, None);
            }
        }

        if let Some(rs_hex) = in_def.redeem_script_hex {
            input.redeem_script = Some(hex::decode(rs_hex).unwrap());
        }

        input.sig_op_count = Some(in_def.sig_op_count);
        inner.inputs.push(input);
    }

    for out_def in def.outputs {
        let script_bytes = hex::decode(&out_def.script_hex).unwrap();
        let out = kaspa_wallet_pskt::pskt::Output {
            amount: out_def.amount,
            script_public_key: ScriptPublicKey::new(0, script_bytes.into()),
            ..Default::default()
        };
        inner.outputs.push(out);
    }

    let pskt: kaspa_wallet_pskt::pskt::PSKT<kaspa_wallet_pskt::pskt::Creator> =
        kaspa_wallet_pskt::pskt::PSKT::from(inner);
    let mut bundle = Bundle::new();
    bundle.add_pskt(pskt);

    match bundle.serialize() {
        Ok(s) => {
            use base64::{engine::general_purpose, Engine as _};
            let b64 = general_purpose::STANDARD.encode(s.as_bytes());

            let json = serde_json::json!({
                "payloadBase64": b64
            });
            println!("{}", serde_json::to_string_pretty(&json).unwrap());
        }
        Err(e) => eprintln!("Error serializing bundle: {:?}", e),
    }
}
