const fs = require("fs");
const path = require("path");

const goldenDir = path.join(__dirname, "packages", "testing", "src", "fixtures", "golden");
const files = fs.readdirSync(goldenDir);

for (const file of files) {
  if (!file.endsWith(".json")) continue;
  const filePath = path.join(goldenDir, file);
  let data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
  
  let modified = false;
  if (data.mode === "simulated") {
    data.mode = "simulator";
    modified = true;
  }
  
  if (data.mode === "simulator" && !data.execution) {
    data.execution = { mode: "simulator", domain: "kaspa-l1", network: "simnet" };
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log("Patched", file);
  }
}
