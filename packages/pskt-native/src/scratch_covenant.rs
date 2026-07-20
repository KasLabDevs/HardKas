use kaspa_consensus_core::tx::{TransactionOutput, ScriptPublicKey};

fn check_covenant(script: &ScriptPublicKey) -> u16 {
    script.version()
}
