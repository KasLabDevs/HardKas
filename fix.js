const fs = require("fs");
const path = require("path");
const dir = "packages/cli/src/runners";

const files = fs.readdirSync(dir).filter((f) => f.endsWith(".ts"));
for (const file of files) {
  const p = path.join(dir, file);
  let c = fs.readFileSync(p, "utf8");
  if (c.includes('"../../cli-errors.js"')) {
    c = c.replace(/"\.\.\/\.\.\/cli-errors\.js"/g, '"../cli-errors.js"');
    fs.writeFileSync(p, c, "utf8");
  }
}
