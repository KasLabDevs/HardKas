// Upstream reference encoder for HardKAS differential tests.
// Reads an artifact and a JSONL file of {entry, args}; prints one line per
// vector: the hex of encode_contract_entry_sig_script, or "ERR <message>".
use silverscript_abi::{ArtifactValue, SilAbiArtifact, encode_contract_entry_sig_script};

#[derive(serde::Deserialize)]
struct Vector {
    entry: String,
    args: Vec<ArtifactValue>,
}

fn main() {
    let mut argv = std::env::args().skip(1);
    let artifact_path = argv.next().expect("artifact path");
    let inputs_path = argv.next().expect("inputs path");
    let abi: SilAbiArtifact = serde_json::from_str(&std::fs::read_to_string(artifact_path).unwrap()).unwrap();
    let contract = abi.contracts.keys().next().unwrap().clone();
    for line in std::fs::read_to_string(inputs_path).unwrap().lines().filter(|l| !l.trim().is_empty()) {
        let v: Vector = serde_json::from_str(line).unwrap();
        match encode_contract_entry_sig_script(&abi, &contract, &v.entry, &v.args) {
            Ok(bytes) => println!("{}", faster_hex::hex_string(&bytes)),
            Err(e) => println!("ERR {e}"),
        }
    }
}
