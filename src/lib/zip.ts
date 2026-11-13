/**
 * A minimal ZIP writer (store method, no compression).
 *
 * Multi-file export needs a zip container, and the files that go into it are
 * already compressed media (photos, videos) or small documents — deflating
 * them again costs a lot of CPU for almost no gain. Storing them keeps the
 * writer small, dependency-free and fast, and every unzip tool reads stored
 * entries.
 *
 * The format is the classic one: a local header + data per entry, a central
 * directory, and an end-of-central-directory record.
 */

export interface ZipEntry {
  /** The name inside the archive. */
  name: string;
  data: Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

/** CRC-32 (IEEE) of a byte sequence. */
export function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < data.length; i++) {
    crc = CRC_TABLE[(crc ^ data[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeU16(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff);
}

function writeU32(target: number[], value: number): void {
  target.push(value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff);
}

/** MS-DOS date and time, as the ZIP format wants them. */
function dosDateTime(date: Date): { time: number; date: number } {
  const year = Math.max(1980, date.getFullYear());
  return {
    time:
      (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

/**
 * Builds a ZIP archive.
 *
 * The bit 11 of the general purpose flags marks the names as UTF-8, so
 * non-ASCII file names survive the round trip.
 */
export function buildZip(entries: ZipEntry[], now: Date = new Date()): Uint8Array {
  const encoder = new TextEncoder();
  const { time, date } = dosDateTime(now);

  const local: number[] = [];
  const central: number[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const crc = crc32(entry.data);
    const size = entry.data.length;

    // Local file header.
    writeU32(local, 0x04034b50);
    writeU16(local, 20); // version needed
    writeU16(local, 0x0800); // UTF-8 names
    writeU16(local, 0); // stored
    writeU16(local, time);
    writeU16(local, date);
    writeU32(local, crc);
    writeU32(local, size);
    writeU32(local, size);
    writeU16(local, nameBytes.length);
    writeU16(local, 0); // extra length
    for (const byte of nameBytes) local.push(byte);
    for (const byte of entry.data) local.push(byte);

    // Central directory entry.
    writeU32(central, 0x02014b50);
    writeU16(central, 20); // version made by
    writeU16(central, 20); // version needed
    writeU16(central, 0x0800);
    writeU16(central, 0);
    writeU16(central, time);
    writeU16(central, date);
    writeU32(central, crc);
    writeU32(central, size);
    writeU32(central, size);
    writeU16(central, nameBytes.length);
    writeU16(central, 0); // extra length
    writeU16(central, 0); // comment length
    writeU16(central, 0); // disk number
    writeU16(central, 0); // internal attributes
    writeU32(central, 0); // external attributes
    writeU32(central, offset);
    for (const byte of nameBytes) central.push(byte);

    offset += 30 + nameBytes.length + size;
  }

  const end: number[] = [];
  writeU32(end, 0x06054b50);
  writeU16(end, 0); // this disk
  writeU16(end, 0); // disk with the central directory
  writeU16(end, entries.length);
  writeU16(end, entries.length);
  writeU32(end, central.length);
  writeU32(end, offset);
  writeU16(end, 0); // comment length

  const total = local.length + central.length + end.length;
  const out = new Uint8Array(total);
  out.set(local, 0);
  out.set(central, local.length);
  out.set(end, local.length + central.length);
  return out;
}

/**
 * Makes the names inside the archive unique: two files can share a name
 * ("IMG_1.jpg" from two folders), and the archive would keep only one.
 */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((name) => {
    const count = seen.get(name) ?? 0;
    seen.set(name, count + 1);
    if (count === 0) return name;
    const dot = name.lastIndexOf('.');
    if (dot <= 0) return `${name} (${count + 1})`;
    return `${name.slice(0, dot)} (${count + 1})${name.slice(dot)}`;
  });
}
