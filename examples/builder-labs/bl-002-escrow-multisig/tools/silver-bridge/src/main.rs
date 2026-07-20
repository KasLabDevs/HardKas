use std::env;
use std::fs;
use serde::{Deserialize, Serialize};
use silverscript_lang::compiler::CompiledContract;

#[derive(Serialize)]
struct BridgeResult {
    unlocking_script_hex: String,
    compiler_version: String,
}

#[derive(Serialize)]
struct BridgeError {
    error: String,
}

fn main() {
    let args: Vec<String> = env::args().collect();
    if args.len() < 2 {
        eprintln!("Usage: silver-bridge <artifact.json|ctor> ...");
        std::process::exit(1);
    }

    if args[1] == "ctor" {
        // Mode ctor: silver-bridge ctor <hex> <hex> <hex> <hex> <hex> <int> <int>
        let mut exprs = Vec::new();
        for i in 2..7 {
            let bytes = hex::decode(&args[i]).unwrap();
            exprs.push(silverscript_lang::ast::Expr::bytes(bytes));
        }
        exprs.push(silverscript_lang::ast::Expr::int(args[7].parse().unwrap()));
        exprs.push(silverscript_lang::ast::Expr::int(args[8].parse().unwrap()));
        
        println!("{}", serde_json::to_string(&exprs).unwrap());
        return;
    }

    let artifact_path = &args[1];
    let entrypoint = &args[2];
    let signatures_hex = &args[3..];

    // Read artifact
    let artifact_json = match fs::read_to_string(artifact_path) {
        Ok(c) => c,
        Err(e) => {
            println!("{}", serde_json::to_string(&BridgeError { error: format!("Failed to read artifact: {}", e) }).unwrap());
            std::process::exit(1);
        }
    };

    let artifact: CompiledContract = match serde_json::from_str(&artifact_json) {
        Ok(a) => a,
        Err(e) => {
            println!("{}", serde_json::to_string(&BridgeError { error: format!("Failed to parse artifact: {}", e) }).unwrap());
            std::process::exit(1);
        }
    };

    let mut args_vec = Vec::new();
    for hex_sig in signatures_hex {
        let bytes = match hex::decode(hex_sig) {
            Ok(b) => b,
            Err(e) => {
                println!("{}", serde_json::to_string(&BridgeError { error: format!("Invalid signature hex: {}", e) }).unwrap());
                std::process::exit(1);
            }
        };
        args_vec.push(bytes);
    }

    // Convert to Expr
    let mut sig_args = Vec::new();
    for bytes in args_vec {
        sig_args.push(silverscript_lang::ast::Expr::bytes(bytes));
    }

    // Call build_sig_script
    let sig_script = match artifact.build_sig_script(entrypoint, sig_args) {
        Ok(s) => s,
        Err(e) => {
            println!("{}", serde_json::to_string(&BridgeError { error: format!("Failed to build sig script: {:?}", e) }).unwrap());
            std::process::exit(1);
        }
    };

    let result = BridgeResult {
        unlocking_script_hex: hex::encode(sig_script),
        compiler_version: artifact.compiler_version.clone(),
    };

    println!("{}", serde_json::to_string(&result).unwrap());
}
