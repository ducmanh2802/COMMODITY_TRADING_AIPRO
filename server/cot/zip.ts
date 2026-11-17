/**
 * Minimal, dependency-free ZIP reader for CFTC's historical COT archives.
 *
 * Scope (deliberately narrow): single-disk, non-zip64, unencrypted archives whose entries are either
 * stored (method 0) or deflated (method 8). Everything else is rejected with a ZipError explaining why.
 * Every extracted entry is checked against the central-directory sizes and CRC-32, and the declared
 * uncompressed size is capped (default 200 MB) BEFORE inflating, with the inflater itself limited to the
 * declared size, so a zip bomb cannot expand past the cap.
 */
import { inflateRawSync } from 'node:zlib';

export const DEFAULT_MAX_UNCOMPRESSED_BYTES = 200 * 1024 * 1024;

const SIG_LOCAL = 0x04034b50;
const SIG_CENTRAL = 0x02014b50;
const SIG_EOCD = 0x06054b50;
const SIG_ZIP64_LOCATOR = 0x07064b50;
const EOCD_MIN = 22;
const MAX_COMMENT = 0xffff;

export class ZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ZipError';
  }
}

// ---------------------------------------------------------------------------------------------- CRC-32
const CRC_TABLE: Uint32Array = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE 802.3, reflected polynomial 0xEDB88320) as used by ZIP. */
export function crc32(data: Uint8Array, seed = 0): number {
  let c = (seed ^ 0xffffffff) >>> 0;
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

// ------------------------------------------------------------------------------------------- Structure
export interface ZipEntry {
  name: string;
  method: number;
  flags: number;
  crc32: number;
  compressedSize: number;
  uncompressedSize: number;
  localHeaderOffset: number;
}

export interface ZipReadOptions {
  /** Cap on the declared and actual uncompressed size of a single entry. */
  maxUncompressedBytes?: number;
}

function view(buf: Uint8Array): DataView {
  return new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
}

function findEocd(buf: Uint8Array): number {
  if (buf.length < EOCD_MIN) throw new ZipError('Not a zip archive (too short for an end-of-central-directory record)');
  const dv = view(buf);
  const stop = Math.max(0, buf.length - EOCD_MIN - MAX_COMMENT);
  for (let i = buf.length - EOCD_MIN; i >= stop; i -= 1) {
    if (dv.getUint32(i, true) === SIG_EOCD && i + EOCD_MIN + dv.getUint16(i + 20, true) === buf.length) return i;
  }
  throw new ZipError('Not a zip archive (end-of-central-directory record not found)');
}

function decodeName(bytes: Uint8Array, utf8: boolean): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(utf8 ? 'utf8' : 'latin1');
}

/** Parse the end-of-central-directory record and the central directory. */
export function listZipEntries(buf: Uint8Array): ZipEntry[] {
  const dv = view(buf);
  const eocd = findEocd(buf);
  if (eocd >= 20 && dv.getUint32(eocd - 20, true) === SIG_ZIP64_LOCATOR) {
    throw new ZipError('Zip64 archives are not supported');
  }
  const diskNo = dv.getUint16(eocd + 4, true);
  const cdDisk = dv.getUint16(eocd + 6, true);
  const entriesOnDisk = dv.getUint16(eocd + 8, true);
  const totalEntries = dv.getUint16(eocd + 10, true);
  const cdSize = dv.getUint32(eocd + 12, true);
  const cdOffset = dv.getUint32(eocd + 16, true);
  if (totalEntries === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    throw new ZipError('Zip64 archives are not supported');
  }
  if (diskNo !== 0 || cdDisk !== 0 || entriesOnDisk !== totalEntries) {
    throw new ZipError('Multi-disk (spanned/split) zip archives are not supported');
  }
  if (cdOffset + cdSize > eocd) throw new ZipError('Corrupt zip: central directory lies outside the archive');

  const entries: ZipEntry[] = [];
  let p = cdOffset;
  for (let i = 0; i < totalEntries; i += 1) {
    if (p + 46 > cdOffset + cdSize) throw new ZipError('Corrupt zip: central directory truncated');
    if (dv.getUint32(p, true) !== SIG_CENTRAL) throw new ZipError('Corrupt zip: bad central directory signature');
    const flags = dv.getUint16(p + 8, true);
    const method = dv.getUint16(p + 10, true);
    const crc = dv.getUint32(p + 16, true);
    const compressedSize = dv.getUint32(p + 20, true);
    const uncompressedSize = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const diskStart = dv.getUint16(p + 34, true);
    const localHeaderOffset = dv.getUint32(p + 42, true);
    if (p + 46 + nameLen + extraLen + commentLen > cdOffset + cdSize) {
      throw new ZipError('Corrupt zip: central directory entry overruns the directory');
    }
    const name = decodeName(buf.subarray(p + 46, p + 46 + nameLen), (flags & 0x0800) !== 0);
    if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff || localHeaderOffset === 0xffffffff) {
      throw new ZipError(`Zip64 entry "${name}" is not supported`);
    }
    if (diskStart !== 0) throw new ZipError('Multi-disk (spanned/split) zip archives are not supported');
    entries.push({ name, method, flags, crc32: crc, compressedSize, uncompressedSize, localHeaderOffset });
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Extract one entry, verifying method, sizes, CRC-32 and the uncompressed-size cap. */
export function extractZipEntry(buf: Uint8Array, entry: ZipEntry, options: ZipReadOptions = {}): Buffer {
  const cap = options.maxUncompressedBytes ?? DEFAULT_MAX_UNCOMPRESSED_BYTES;
  const name = entry.name;
  if (entry.flags & 0x0001 || entry.flags & 0x0040 || entry.method === 99) {
    throw new ZipError(`Entry "${name}" is encrypted; encrypted zip archives are not supported`);
  }
  if (entry.method !== 0 && entry.method !== 8) {
    throw new ZipError(`Entry "${name}" uses unsupported compression method ${entry.method} (only stored/deflate)`);
  }
  if (entry.uncompressedSize > cap) {
    throw new ZipError(`Entry "${name}" declares ${entry.uncompressedSize} bytes uncompressed, above the ${cap}-byte cap`);
  }
  const dv = view(buf);
  const lh = entry.localHeaderOffset;
  if (lh + 30 > buf.length || dv.getUint32(lh, true) !== SIG_LOCAL) {
    throw new ZipError(`Corrupt zip: bad local header for "${name}"`);
  }
  const localMethod = dv.getUint16(lh + 8, true);
  if (localMethod !== entry.method) throw new ZipError(`Corrupt zip: local/central method mismatch for "${name}"`);
  const start = lh + 30 + dv.getUint16(lh + 26, true) + dv.getUint16(lh + 28, true);
  const end = start + entry.compressedSize;
  if (end > buf.length) throw new ZipError(`Corrupt zip: data for "${name}" runs past the end of the archive`);
  const raw = buf.subarray(start, end);

  let out: Buffer;
  if (entry.method === 0) {
    if (entry.compressedSize !== entry.uncompressedSize) {
      throw new ZipError(`Corrupt zip: stored entry "${name}" has differing compressed/uncompressed sizes`);
    }
    out = Buffer.from(raw);
  } else {
    try {
      // Limit the inflater to the declared size: an entry that expands further fails here (zip-bomb guard).
      out = inflateRawSync(raw, { maxOutputLength: Math.max(1, entry.uncompressedSize) });
    } catch (err) {
      const why = err instanceof RangeError ? 'expands beyond its declared size' : 'is not valid deflate data';
      throw new ZipError(`Corrupt zip: entry "${name}" ${why}`);
    }
  }
  if (out.length !== entry.uncompressedSize) {
    throw new ZipError(`Corrupt zip: entry "${name}" is ${out.length} bytes, expected ${entry.uncompressedSize}`);
  }
  const actual = crc32(out);
  if (actual !== entry.crc32) {
    throw new ZipError(
      `Corrupt zip: CRC-32 mismatch for "${name}" (got ${actual.toString(16)}, expected ${entry.crc32.toString(16)})`
    );
  }
  return out;
}
