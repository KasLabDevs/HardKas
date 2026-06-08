# Quickstart

The fastest way to experience HardKAS is in deterministic simulated mode.

1. **Initialize Workspace**
   \`\`\`bash
   hardkas init .
   \`\`\`
   *This bootstraps your directory with \`hardkas.config.ts\` and local state.*

2. **Create an Account**
   \`\`\`bash
   hardkas accounts real init
   \`\`\`
   *For simulation, HardKAS also automatically provisions dev accounts like \`kaspa:sim_alice\`. You can also generate random fixtures using:*
   \`\`\`bash
   hardkas dev fixture generate --type random
   \`\`\`

3. **Plan a Transaction**
   \`\`\`bash
   hardkas tx plan --from alice --to bob --amount 10
   \`\`\`
   *Outputs a deterministic \`txPlan\` artifact containing exact routing and selected UTXOs.*

4. **Verify and Inspect the Artifact**
   \`\`\`bash
   hardkas artifact inspect .hardkas/artifacts/*.plan.json
   \`\`\`
   *This is a critical boundary: you should visually or programmatically assert that the destination and amount are correct before your private key is ever decrypted.*

5. **Sign the Transaction**
   \`\`\`bash
   hardkas tx sign .hardkas/artifacts/*.plan.json --account alice
   \`\`\`
   *This loads the key, hashes the plan, produces a \`signedTx\` artifact, and destroys the key in memory.*

6. **Send and Settle**
   \`\`\`bash
   hardkas tx send .hardkas/artifacts/*.signed.json
   \`\`\`
   *Because you are in simulated mode, this settles locally and returns a receipt. If you were configured for \`rpc\`, it would broadcast the hex payload to a Kaspa node.*
