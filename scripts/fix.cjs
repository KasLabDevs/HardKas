const fs = require('fs');
let c = fs.readFileSync('examples/builder-labs/bl-003-silverscript-covenant/bl-003-b-deploy.test.ts', 'utf8');

c = c.replace(/signatureScript: "18" \+[\s\S]*?"87",  \/\/ OP_EQUAL,/, 'signatureScript,');

c = c.replace(/const covenantBytecodeHex =[\s\S]*?"87";  \/\/ OP_EQUAL/m, `const covenantBytecodeHex = 
            "b4" + // OP_TX_OUTPUT_COUNT
            "51" + // OP_1
            "9c" + // OP_NUMEQUALVERIFY
            "00" + // OP_0 (index 0)
            "c3" + // OP_TX_OUTPUT_SPK
            "24" + // OP_DATA_36 (36 bytes: 2 bytes version + 34 bytes script)
            "0000" + // Version 0
            "20" + identities.charlie.publicKeyHex + "ac" + // P2PK script for Charlie
            "87";  // OP_EQUAL`);

fs.writeFileSync('examples/builder-labs/bl-003-silverscript-covenant/bl-003-b-deploy.test.ts', c);
