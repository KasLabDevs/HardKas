use kaspa_consensus_core::tx::{TransactionOutput, ScriptPublicKey};
// Just a scratch to test compilation of a snippet
fn check_covenant(script: &ScriptPublicKey) -> bool {
    script.version() != 0
}
