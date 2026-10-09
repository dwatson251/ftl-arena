/**
 * Reader/writer for FTL 1.6+'s PKG archive (ftl.dat). Big-endian.
 *   header: "PKG\n", u16 headerSize, u16 entrySize, u32 entryCount, u32 nameRegionSize
 *   entry:  u32 nameHash, u32 (flags<<24 | nameOffset), u32 dataOffset, u32 packedSize, u32 unpackedSize
 *   then the name region (NUL-terminated paths), then the data.
 * Flag 0x01 = deflate (zlib stream).
 */
import { inflateSync } from "node:zlib";

export interface PkgEntry {
  path: string;
  hash: number;
  flags: number;
  dataOffset: number;
  packedSize: number;
  unpackedSize: number;
}

export const PKG_DEFLATE = 0x01;

export class PkgArchive {
  readonly entries: PkgEntry[] = [];
  private byPath = new Map<string, PkgEntry>();

  constructor(private buf: Buffer) {
    if (buf.toString("latin1", 0, 4) !== "PKG\n") throw new Error("not a PKG archive (bad magic)");
    const headerSize = buf.readUInt16BE(4);
    const entrySize = buf.readUInt16BE(6);
    const count = buf.readUInt32BE(8);
    const nameRegionSize = buf.readUInt32BE(12);
    const namesAt = headerSize + count * entrySize;
    if (namesAt + nameRegionSize > buf.length) throw new Error("PKG name region out of bounds");
    for (let i = 0; i < count; i++) {
      const o = headerSize + i * entrySize;
      const hash = buf.readUInt32BE(o);
      const flagsName = buf.readUInt32BE(o + 4);
      const nameOffset = flagsName & 0x00ffffff;
      const flags = flagsName >>> 24;
      const dataOffset = buf.readUInt32BE(o + 8);
      const packedSize = buf.readUInt32BE(o + 12);
      const unpackedSize = buf.readUInt32BE(o + 16);
      if (dataOffset === 0 && packedSize === 0 && nameOffset === 0) continue; // empty slot
      const end = buf.indexOf(0, namesAt + nameOffset);
      const path = buf.toString("ascii", namesAt + nameOffset, end);
      const e = { path, hash, flags, dataOffset, packedSize, unpackedSize };
      this.entries.push(e);
      this.byPath.set(path, e);
    }
  }

  has(path: string): boolean {
    return this.byPath.has(path);
  }

  read(path: string): Buffer {
    const e = this.byPath.get(path);
    if (!e) throw new Error(`not in archive: ${path}`);
    return this.readEntry(e);
  }

  readEntry(e: PkgEntry): Buffer {
    const raw = this.buf.subarray(e.dataOffset, e.dataOffset + e.packedSize);
    if (e.flags & PKG_DEFLATE) {
      const out = inflateSync(raw);
      if (out.length !== e.unpackedSize) throw new Error(`size mismatch for ${e.path}`);
      return out;
    }
    return Buffer.from(raw);
  }

  /** The hash FTL stores per entry: a 32-bit string hash of the lower-cased path. */
  static hashPath(path: string): number {
    let h = 0;
    for (const ch of path.toLowerCase()) {
      h = ((h << 27) | (h >>> 5)) >>> 0;
      h = (h ^ ch.charCodeAt(0)) >>> 0;
      h = h & 0xffffffff;
    }
    return h >>> 0;
  }
}
