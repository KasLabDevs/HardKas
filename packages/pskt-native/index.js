import { createRequire } from 'module';
import os from 'node:os';
const require = createRequire(import.meta.url);

let binding = null;
let loadError = null;
try {
  const platform = os.platform();
  const arch = os.arch();
  let target = 'linux-x64-gnu';
  if (platform === 'win32') target = 'win32-x64-msvc';
  else if (platform === 'darwin') target = arch === 'arm64' ? 'darwin-arm64' : 'darwin-x64';
  
  binding = require(`./hardkas-pskt-native.${target}.node`);
} catch (e) {
  try {
    binding = require('./hardkas-pskt-native.node'); // Fallback
  } catch (e2) {
    loadError = new Error(`Could not find native binding for ${os.platform()}-${os.arch()}. Errors: ${e.message} | ${e2.message}`);
  }
}

function getBinding() {
  if (!binding) {
    throw loadError || new Error(`Native binding not available for ${os.platform()}-${os.arch()}`);
  }
  return binding;
}

export const hasNativeBinding = !!binding;
export const psktProbe = (...args) => getBinding().psktProbe(...args);
export const psktInspect = (...args) => getBinding().psktInspect(...args);
export const psktDecodeEncodeRoundtrip = (...args) => getBinding().psktDecodeEncodeRoundtrip(...args);
export const psktCombine = (...args) => getBinding().psktCombine(...args);
export const psktFinalize = (...args) => getBinding().psktFinalize(...args);
export const psktExtract = (...args) => getBinding().psktExtract(...args);
export const psktSign = (...args) => getBinding().psktSign(...args);
