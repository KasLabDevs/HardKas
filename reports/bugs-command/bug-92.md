# Bug in Command: status --help

## Execution Status
- **Type**: CLI
- **Exit Code**: 1
- **Duration**: 4290ms

## Error Output
```
npm warn exec The following package was not found and will be installed: status@0.0.13
npm warn deprecated coffee-script@1.12.7: CoffeeScript on NPM has moved to "coffeescript" (no hyphen)
C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\loggo\lib\package.coffee:14
        if (!this["package"] && path.existsSync(place)) {
                                     ^

TypeError: path.existsSync is not a function
    at Object.exports.load (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\loggo\lib\package.coffee:8:95)
    at Object.<anonymous> (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\loggo\lib\logger.coffee:3:29)
    at Object.<anonymous> (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\loggo\lib\logger.coffee:1:1)
    at Module._compile (node:internal/modules/cjs/loader:1830:14)
    at Object.loadFile (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\coffee-script\lib\coffee-script\register.js:16:19)
    at Module.load (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\coffee-script\lib\coffee-script\register.js:45:36)
    at Module._load (node:internal/modules/cjs/loader:1355:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.require (node:internal/modules/cjs/loader:1576:12)
    at require (node:internal/modules/helpers:153:16)
    at Object.<anonymous> (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\loggo\index.js:2:18)
    at Module._compile (node:internal/modules/cjs/loader:1830:14)
    at Object..js (node:internal/modules/cjs/loader:1961:10)
    at Module.load (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\coffee-script\lib\coffee-script\register.js:45:36)
    at Module._load (node:internal/modules/cjs/loader:1355:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.require (node:internal/modules/cjs/loader:1576:12)
    at require (node:internal/modules/helpers:153:16)
    at Object.<anonymous> (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\status\lib\command.coffee:2:7)
    at Object.<anonymous> (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\status\lib\command.coffee:1:1)
    at Module._compile (node:internal/modules/cjs/loader:1830:14)
    at Object.loadFile (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\coffee-script\lib\coffee-script\register.js:16:19)
    at Module.load (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\coffee-script\lib\coffee-script\register.js:45:36)
    at Module._load (node:internal/modules/cjs/loader:1355:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.require (node:internal/modules/cjs/loader:1576:12)
    at require (node:internal/modules/helpers:153:16)
    at Object.<anonymous> (C:\Users\jrodr\AppData\Local\npm-cache\_npx\df3dbdbf1630f9f3\node_modules\status\bin\status:4:1)
    at Module._compile (node:internal/modules/cjs/loader:1830:14)
    at Object..js (node:internal/modules/cjs/loader:1961:10)
    at Module.<anonymous> (node:internal/modules/cjs/loader:1553:32)
    at Module._load (node:internal/modules/cjs/loader:1355:12)
    at wrapModuleLoad (node:internal/modules/cjs/loader:255:19)
    at Module.executeUserEntryPoint [as runMain] (node:internal/modules/run_main:154:5)
    at node:internal/main/run_main_module:33:47


Node.js v24.15.0

```