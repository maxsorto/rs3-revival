// RS3 MMB collision mesh: verts + triangles (road) from leaf type 0.
import { parseDchk } from './dchk';
export interface Mmb { pos: Float32Array; tris: Uint32Array; mat: Uint16Array }
export function parseMmb(b: Uint8Array): Mmb {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const { root } = parseDchk(b);
  const leaf0 = root[0].children.find(c => c.type === 0 && c.leaf)!;
  let p = leaf0.start;
  const nv = dv.getUint32(p, true); p += 4;
  const pos = new Float32Array(b.buffer.slice(b.byteOffset + p, b.byteOffset + p + nv * 12)); p += nv * 12;
  const nt = dv.getUint32(p, true); p += 4;
  const tris = new Uint32Array(nt * 3), mat = new Uint16Array(nt);
  for (let i = 0; i < nt; i++) { tris[i*3] = dv.getUint32(p, true); tris[i*3+1] = dv.getUint32(p+4, true); tris[i*3+2] = dv.getUint32(p+8, true); mat[i] = dv.getUint16(p+12, true); p += 16; }
  return { pos, tris, mat };
}
