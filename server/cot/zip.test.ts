import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32, extractZipEntry, listZipEntries, ZipError } from './zip.ts';
import { buildZip } from './__fixtures__/buildZip.ts';

const TEXT = 'Market_and_Exchange_Names,Open_Interest_All\n"CORN - CHICAGO BOARD OF TRADE",1979758\n'.repeat(50);

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  assert.equal(crc32(Buffer.alloc(0)), 0);
});

test('reads stored and deflated entries (with an archive comment)', () => {
  const zip = buildZip(
    [
      { name: 'stored.txt', data: TEXT, method: 0 },
      { name: 'f_year.txt', data: TEXT, method: 8 },
      { name: 'empty.txt', data: '', method: 8 },
    ],
    'archive comment'
  );
  const entries = listZipEntries(zip);
  assert.deepEqual(entries.map((e) => [e.name, e.method]), [
    ['stored.txt', 0],
    ['f_year.txt', 8],
    ['empty.txt', 8],
  ]);
  assert.ok(entries[1].compressedSize < entries[1].uncompressedSize);
  for (const e of entries.slice(0, 2)) assert.equal(extractZipEntry(zip, e).toString('utf8'), TEXT);
  assert.equal(extractZipEntry(zip, entries[2]).length, 0);
});

function corrupt(zip: Buffer, mutate: (b: Buffer) => void): Buffer {
  const b = Buffer.from(zip);
  mutate(b);
  return b;
}

test('rejects corrupted data: CRC mismatch, bad deflate stream, size mismatch, truncation, garbage', () => {
  const zip = buildZip([{ name: 'a.txt', data: TEXT, method: 0 }]);
  const [e] = listZipEntries(zip);
  // Flip one payload byte of a stored entry → CRC mismatch.
  const dataStart = 30 + 'a.txt'.length;
  const flipped = corrupt(zip, (b) => {
    b[dataStart + 5] ^= 0xff;
  });
  assert.throws(() => extractZipEntry(flipped, e), (err: unknown) => err instanceof ZipError && /CRC-32 mismatch/.test(err.message));

  const dz = buildZip([{ name: 'a.txt', data: TEXT, method: 8 }]);
  const [de] = listZipEntries(dz);
  const badDeflate = corrupt(dz, (b) => {
    b.fill(0xff, 30 + 5, 30 + 5 + 8);
  });
  assert.throws(() => extractZipEntry(badDeflate, de), ZipError);

  // Central directory lies about the uncompressed size (bigger output than declared → bomb guard trips).
  assert.throws(
    () => extractZipEntry(dz, { ...de, uncompressedSize: 10 }),
    (err: unknown) => err instanceof ZipError && /beyond its declared size/.test(err.message)
  );
  assert.throws(() => extractZipEntry(dz, { ...de, uncompressedSize: de.uncompressedSize + 10 }), /expected/);

  assert.throws(() => listZipEntries(zip.subarray(0, zip.length - 5)), /end-of-central-directory/);
  assert.throws(() => listZipEntries(Buffer.from('<html>Not found</html>')), ZipError);
  assert.throws(() => extractZipEntry(zip.subarray(0, 40), e), /runs past the end|bad local header/);
});

test('rejects encrypted, unsupported-method, zip64, multi-disk and oversized entries', () => {
  const zip = buildZip([{ name: 'a.txt', data: TEXT, method: 8 }]);
  const [e] = listZipEntries(zip);
  assert.throws(() => extractZipEntry(zip, { ...e, flags: e.flags | 1 }), /encrypted/);
  assert.throws(() => extractZipEntry(zip, { ...e, method: 12 }), /unsupported compression method 12/);
  assert.throws(() => extractZipEntry(zip, e, { maxUncompressedBytes: 100 }), /above the 100-byte cap/);

  const eocd = zip.length - 22;
  const multiDisk = corrupt(zip, (b) => b.writeUInt16LE(1, eocd + 4));
  assert.throws(() => listZipEntries(multiDisk), /Multi-disk/);
  const zip64 = corrupt(zip, (b) => b.writeUInt32LE(0xffffffff, eocd + 16));
  assert.throws(() => listZipEntries(zip64), /Zip64/);
  const zip64Entry = corrupt(zip, (b) => b.writeUInt32LE(0xffffffff, b.readUInt32LE(eocd + 16) + 24));
  assert.throws(() => listZipEntries(zip64Entry), /Zip64 entry/);
});
