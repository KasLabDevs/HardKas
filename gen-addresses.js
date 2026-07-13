import crypto from "node:crypto";
import pkg from "kaspa";
const { PrivateKey } = pkg;

const SIMNET_DETERMINISTIC_SEED = "hardkas-deterministic-simnet-seed-v1";
const names = ["alice", "bob", "carol", "dave", "erin"];

console.log("Addresses:");
for (let index = 0; index < 5; index++) {
  const seedString = `${SIMNET_DETERMINISTIC_SEED}-${index}`;
  const privateKeyHex = crypto.createHash("sha256").update(seedString).digest("hex");
  const pk = new PrivateKey(privateKeyHex);
  const kp = pk.toKeypair();
  const address = kp.toAddress("simnet").toString();
  console.log(`"${address}", // ${names[index]}`);
}
