use kaspa_consensus_core::tx::{ScriptPublicKey, UtxoEntry};
use kaspa_wallet_pskt::bundle::Bundle;
use kaspa_wallet_pskt::pskt::Input;
use secp256k1::Secp256k1;

fn main() {
    let secp = Secp256k1::new();
    let (secret_key, public_key) = secp.generate_keypair(&mut secp256k1::rand::thread_rng());

    let mut inner = kaspa_wallet_pskt::pskt::Inner::default();

    let mut input = Input::default();
    input.utxo_entry = Some(UtxoEntry::new(
        1000,
        ScriptPublicKey::new(0, vec![].into()),
        0,
        false,
        None,
    ));
    input.bip32_derivations.insert(public_key, None);
    inner.inputs.push(input);

    let pskt: kaspa_wallet_pskt::pskt::PSKT<kaspa_wallet_pskt::pskt::Creator> =
        kaspa_wallet_pskt::pskt::PSKT::from(inner);

    let mut bundle = Bundle::new();
    bundle.add_pskt(pskt);

    match bundle.serialize() {
        Ok(s) => {
            use base64::{engine::general_purpose, Engine as _};
            let b64 = general_purpose::STANDARD.encode(s.as_bytes());

            let json = serde_json::json!({
                "privateKeyHex": hex::encode(secret_key.secret_bytes()),
                "publicKeyHex": hex::encode(public_key.serialize()),
                "payloadBase64": b64
            });
            println!("{}", serde_json::to_string_pretty(&json).unwrap());
        }
        Err(e) => eprintln!("Error serializing bundle: {:?}", e),
    }
}
