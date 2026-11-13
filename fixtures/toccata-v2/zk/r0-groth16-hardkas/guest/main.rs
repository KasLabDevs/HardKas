// hk-r0-probe: reads a private 32-byte input and commits
//   journal = LABEL (19 bytes) || SHA-256(input) (32 bytes)   -> 51 bytes.
// The input itself never leaves the zkVM; only its SHA-256 is public.
use risc0_zkvm::guest::env;
use risc0_zkvm::sha::{Impl, Sha256};

const LABEL: &[u8] = b"hardkas-r0-probe-v1";

fn main() {
    let secret: [u8; 32] = env::read();
    let digest = Impl::hash_bytes(&secret);
    let mut journal = Vec::with_capacity(LABEL.len() + 32);
    journal.extend_from_slice(LABEL);
    journal.extend_from_slice(digest.as_bytes());
    env::commit_slice(&journal);
}
