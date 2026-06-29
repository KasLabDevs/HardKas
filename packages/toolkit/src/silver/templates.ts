export const SILVER_TEMPLATES: Record<string, string> = {
    "op-true": `OP_TRUE`,
    "timelock": `<locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP
<pubkey> OP_CHECKSIG`,
    "escrow": `OP_IF
  <buyer_pubkey> OP_CHECKSIGVERIFY
  <arbiter_pubkey> OP_CHECKSIG
OP_ELSE
  <seller_pubkey> OP_CHECKSIGVERIFY
  <arbiter_pubkey> OP_CHECKSIG
OP_ENDIF`,
    "htlc": `OP_IF
  OP_SHA256 <secret_hash> OP_EQUALVERIFY
  <receiver_pubkey> OP_CHECKSIG
OP_ELSE
  <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP
  <sender_pubkey> OP_CHECKSIG
OP_ENDIF`,
    "atomic-swap": `OP_IF
  OP_SHA256 <secret_hash> OP_EQUALVERIFY
  <participant_b_pubkey> OP_CHECKSIG
OP_ELSE
  <locktime> OP_CHECKLOCKTIMEVERIFY OP_DROP
  <participant_a_pubkey> OP_CHECKSIG
OP_ENDIF`,
    "multisig": `OP_2 <pubkey1> <pubkey2> <pubkey3> OP_3 OP_CHECKMULTISIG`
};
