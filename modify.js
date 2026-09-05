const fs = require('fs');
const file = 'C:\\Users\\jrodr\\AppData\\Local\\Temp\\hardkas-npm-registry-qual-1788544209099\\qualify-docker-public-surface.js';
let code = fs.readFileSync(file, 'utf8');
code = code.replace(
  'await hk.tx.send(setupSigned);',
  'try { await hk.tx.send(setupSigned); console.log(\"SEND SUCCESS\"); } catch(e) { console.error(\"SEND THREW\", e); throw e; }'
);
code = code.replace(
  'await mineBlock(hk, alice.address);',
  'try { await mineBlock(hk, alice.address); console.log(\"MINE SUCCESS\"); } catch(e) { console.error(\"MINE THREW\", e); throw e; }'
);
fs.writeFileSync(file, code);
