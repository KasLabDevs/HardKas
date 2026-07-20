import { createRequire } from 'module';
const require = createRequire(import.meta.url);

let binding;
try {
  binding = require('./hardkas-pskt-native.win32-x64-msvc.node');
} catch (e) {
  binding = require('./hardkas-pskt-native.node'); // Fallback
}

export const psktProbe = binding.psktProbe;
export const psktInspect = binding.psktInspect;
export const psktDecodeEncodeRoundtrip = binding.psktDecodeEncodeRoundtrip;
export const psktCombine = binding.psktCombine;
export const psktFinalize = binding.psktFinalize;
export const psktExtract = binding.psktExtract;
export const psktSign = binding.psktSign;