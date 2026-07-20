use kaspa_wallet_pskt::bundle::Bundle;
use kaspa_wallet_pskt::pskt::Creator;
use kaspa_wallet_pskt::pskt::PSKT;

fn main() {
    let mut bundle = Bundle::new();
    let pskt: PSKT<Creator> = PSKT::default();

    // Add to bundle
    bundle.add_pskt(pskt);

    match bundle.serialize() {
        Ok(s) => {
            // s is PSKB + hex. We encode it to base64
            use base64::{engine::general_purpose, Engine as _};
            let b64 = general_purpose::STANDARD.encode(s.as_bytes());
            println!("{}", b64);
        }
        Err(e) => eprintln!("Error serializing bundle: {:?}", e),
    }
}
