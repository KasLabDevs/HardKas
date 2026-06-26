# AUDIT VERIFIERS STRENGTH

- **Tamper Detection**: STRONG. `lifecycle-trust.test.ts` and `tamper-detection.test.ts` actively catch hash mismatches and tampered policy refs.
- **Keystore**: STRONG. Catches corrupted ciphertexts and bad passwords.
- **CLI Commands**: MODERATE. The maturity system prevents accidental use of experimental commands, but some beta commands lack deep verification.
