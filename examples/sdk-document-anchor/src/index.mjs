import { Hardkas } from "@hardkas/sdk";

async function run() {
  const hardkas = await Hardkas.create({
    network: "simulated",
    autoBootstrap: true,
    logger: console
  });

  console.log("Document Anchor initialized.");
  console.log("Funding notary account...");
  await hardkas.accounts.fund("notary");

  const documentHash = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";
  console.log(`Anchoring document hash: ${documentHash}`);

  // Note: Since amount 0 is not permitted yet for metadata flows, we use amount 1
  const plan = await hardkas.tx.plan({
    from: "notary",
    to: "notary",
    amount: 1
  });

  const signed = await hardkas.tx.sign(plan);
  const receipt = await hardkas.tx.send(signed);

  console.log(`Document anchored successfully in txId: ${receipt.txId}`);

  // We write an arbitrary artifact to represent the document mapping to the tx
  const docReceipt = await hardkas.artifacts.write({
    schema: "hardkas.example.documentAnchor.v1",
    version: 1,
    contentHash: documentHash,
    txId: receipt.txId,
    networkId: "simulated"
  });

  console.log(`Anchor metadata saved to artifact: ${docReceipt.absolutePath}`);
}

run().catch(console.error);
