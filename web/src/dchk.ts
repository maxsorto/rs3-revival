// Ubisoft DCHK chunk container (see tools/dchk.py and notes/README.md).
export interface Chunk { id: number; type: number; leaf: boolean; ref: boolean; start: number; size: number; children: Chunk[] }
export function parseDchk(b: Uint8Array): { tag: string; root: Chunk[] } {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const al = b[0], tag = String.fromCharCode(b[1], b[2], b[3]);
  const align = (p: number) => al <= 1 ? p : Math.ceil(p / al) * al;
  const walk = (pos: number, end: number, depth: number): Chunk[] => {
    const out: Chunk[] = [];
    while (pos < end) {
      pos = align(pos); if (pos + 8 > end) break;
      const id = dv.getUint32(pos, true), size = dv.getUint32(pos + 4, true);
      pos = align(pos + 8);
      const c: Chunk = { id, type: id & 0x7fffff, leaf: !!(id & 0x01000000), ref: !!(id & 0x02000000), start: pos, size, children: [] };
      if (!c.leaf && depth < 6 && c.type !== 0x7ffffe && c.type !== 0x7fffff) c.children = walk(pos, Math.min(pos + size, end), depth + 1);
      out.push(c); pos += size;
    }
    return out;
  };
  return { tag, root: walk(8, b.byteLength, 0) };
}
