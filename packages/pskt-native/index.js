import { createRequire } from 'module';
import os from 'node:os';
const require = createRequire(import.meta.url);

let binding;
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
    throw new Error(`Could not find native binding for ${os.platform()}-${os.arch()}. Errors: ${e.message} | ${e2.message}`);
  }
}

export const psktProbe = binding.psktProbe;
export const psktInspect = binding.psktInspect;
export const psktDecodeEncodeRoundtrip = binding.psktDecodeEncodeRoundtrip;
export const psktCombine = binding.psktCombine;
export const psktFinalize = binding.psktFinalize;
export const psktExtract = binding.psktExtract;
export const psktSign = binding.psktSign;