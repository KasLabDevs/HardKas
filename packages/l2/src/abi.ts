import { encodeDeployData, parseAbiItem } from "viem";

/**
 * Encodes deployment bytecode and constructor arguments using viem.
 * 
 * @param bytecode 0x-prefixed hex string
 * @param constructorSignature e.g. "constructor(address,uint256)"
 * @param args Array of argument strings from CLI
 */
export function encodeConstructorArgs(bytecode: string, constructorSignature: string, args: string[]): string {
  const formattedBytecode = bytecode.startsWith("0x") ? (bytecode as `0x${string}`) : (`0x${bytecode}` as `0x${string}`);
  
  const abiItem = parseAbiItem(constructorSignature);
  if (abiItem.type !== "constructor") {
    throw new Error("Invalid constructor signature. Must start with 'constructor'.");
  }

  // Basic type conversion for common EVM types
  const parsedArgs = args.map(arg => {
    const trimmed = arg.trim();
    // Hex (addresses, bytes)
    if (trimmed.startsWith("0x")) return trimmed;
    // Numbers/BigInts
    if (/^\d+$/.test(trimmed)) return BigInt(trimmed);
    // Booleans
    if (trimmed.toLowerCase() === "true") return true;
    if (trimmed.toLowerCase() === "false") return false;
    // Default to string
    return trimmed;
  });

  return encodeDeployData({
    abi: [abiItem],
    bytecode: formattedBytecode,
    args: parsedArgs
  });
}
