import os from "node:os";

/**
 * REMED-CLOSE · R-01 · runner images for the Linux start tests, built field by field so that each test makes only the
 * change it is about. Each image carries shell lines where a shell would read them; they create a marker file, which
 * shows whether /bin/sh ever interpreted the image.
 */
export const LINUX_MACHINE: Record<string, number> = { x64: 0x3e, arm64: 0xb7, riscv64: 0xf3, loong64: 0x102 };
/** Linux on a little-endian machine these images are built for. */
export const LINUX_LE = process.platform === "linux" && os.endianness() === "LE" && LINUX_MACHINE[process.arch] !== undefined;

/** A 64-byte ELF64 little-endian ET_EXEC header for this machine. */
export function elfHeader(o: { machine?: number; phoff?: number; phentsize?: number; phnum?: number } = {}): Buffer {
  const h = Buffer.alloc(64);
  h.set([0x7f, 0x45, 0x4c, 0x46], 0);
  h[4] = 2; // ELFCLASS64
  h[5] = 1; // little-endian
  h[6] = 1; // EV_CURRENT
  h.writeUInt16LE(2, 16); // ET_EXEC
  h.writeUInt16LE(o.machine ?? LINUX_MACHINE[process.arch] ?? 0x3e, 18);
  h.writeUInt32LE(1, 20);
  h.writeBigUInt64LE(BigInt(o.phoff ?? 64), 32);
  h.writeUInt16LE(64, 52);
  h.writeUInt16LE(o.phentsize ?? 56, 54);
  h.writeUInt16LE(o.phnum ?? 1, 56);
  return h;
}

/** One 56-byte ELF64 program header (PT_LOAD = 1, PT_INTERP = 3). */
export function programHeader(type: number, offset: number, filesz: number): Buffer {
  const p = Buffer.alloc(56);
  p.writeUInt32LE(type, 0);
  p.writeUInt32LE(5, 4);
  p.writeBigUInt64LE(BigInt(offset), 8);
  p.writeBigUInt64LE(0x400000n, 16);
  p.writeBigUInt64LE(0x400000n, 24);
  p.writeBigUInt64LE(BigInt(filesz), 32);
  p.writeBigUInt64LE(BigInt(filesz), 40);
  p.writeBigUInt64LE(0x1000n, 48);
  return p;
}

/** The lines a /bin/sh fallback would run: they create `markerFile` and end with `status`. */
export function shellLines(markerFile: string, status = 42): Buffer {
  return Buffer.from(`\ntouch ${markerFile}\nexit ${status}\n`);
}

/**
 * An ELF64 image every header check accepts (this machine, ET_EXEC, 56-byte entries, the whole table inside the file)
 * with 1171 program headers, more than Linux reads (65536 bytes): the kernel refuses it with ENOEXEC, the case the exec
 * family hands to /bin/sh. The shell lines sit right after the 64-byte header, before the table.
 */
export function elfOverProgramHeaderLimit(markerFile: string, status = 42): Buffer {
  const lines = shellLines(markerFile, status);
  return Buffer.concat([elfHeader({ phoff: 64 + lines.length, phnum: 1171 }), lines, Buffer.alloc(1171 * 56)]);
}

/**
 * An ELF64 image every header check accepts with one PT_INTERP segment of 1 byte (Linux requires 2 to PATH_MAX): the
 * kernel refuses it with ENOEXEC. It is small, its table well inside the first 4096 bytes, so it also passes the checks
 * as a #! interpreter.
 */
export function elfOneByteInterpSegment(markerFile: string, status = 42): Buffer {
  return Buffer.concat([elfHeader({ phoff: 64, phnum: 1 }), programHeader(3, 120, 1), Buffer.from([0]), shellLines(markerFile, status)]);
}
