import fs from "fs";
import path from "path";

function findTsFiles(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(findTsFiles(filePath));
    } else if (filePath.endsWith(".ts")) {
      results.push(filePath);
    }
  }
  return results;
}

const files = findTsFiles("packages/tx-builder/test");
for (const file of files) {
  let content = fs.readFileSync(file, "utf8");
  
  content = content.replace(/selectCoins\(\{/g, "selectCoins({ coinbaseMaturity: 100n,");
  content = content.replace(/new TxPlanService\(\)/g, "new TxPlanService({ coinbaseMaturity: 100n })");
  content = content.replace(/new TxPlanService\(\{/g, "new TxPlanService({ coinbaseMaturity: 100n,");
  content = content.replace(/new TxPlanService\(\{ coinbaseMaturity: 100n, coinbaseMaturity: 100n,/g, "new TxPlanService({ coinbaseMaturity: 100n,");
  
  fs.writeFileSync(file, content);
}
console.log("Replaced in " + files.length + " files");
