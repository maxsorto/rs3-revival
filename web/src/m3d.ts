// RS3 M3D render mesh (PC DCHK layout). Pools of vertex data followed by strip groups.
import { parseDchk, type Chunk } from './dchk';
export interface M3dGroup { base: number; count: number; indices: Uint16Array; texRef: number; center: number[]; bbox: number[] }
export interface M3dMaterial { id: number; ambient: number[]; diffuse: number[]; specular: number[]; texId: number; mipIds: number[]; layers: number }
// vertex records (0x78): u32 count, descriptor [nComponents, component ids...] padded to 4 bytes, then count × (nComponents × u16).
// Observed layouts: 3 components (ids 0,1,2) = (pos, nrm, uv); 4 (ids 0,1,3,2) = (pos, nrm, col, uv); 5 (ids 0,1,3,2,2) = (pos, nrm, col, uv, uv2).
// Group triangles (0x7f): u32 nTris, then nTris×3 u16 record indices (padded to 4 bytes), 0-based relative to the group's
// base record (0x36). Verified: every group in Albert Park has max(index) == recordCount-1.
export interface M3dPlacement { center: number[]; radius: number; bboxMin: number[]; bboxSize: number[] }
export interface M3dPool { indexBase: number; wide: boolean; placement?: M3dPlacement; pos: Float32Array; uv: Float32Array; nrm: Float32Array; col: Uint8Array; posIdx: Uint16Array; nrmIdx: Uint16Array; uvIdx: Uint16Array; colIdx: Uint16Array; uv2Idx?: Uint16Array; texRefs: number[]; matRefs: number[]; groups: M3dGroup[] }
export interface M3d { pools: M3dPool[]; materials: M3dMaterial[] }
export function parseM3d(b: Uint8Array, indexShift = 0): M3d {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const { root } = parseDchk(b);
  const top = root[0]?.children ?? [];
  const f32 = (c: Chunk, stride: number) => { const n = dv.getUint32(c.start, true); return new Float32Array(b.buffer.slice(b.byteOffset + c.start + 4, b.byteOffset + c.start + 4 + n * stride * 4)); };
  const pools: M3dPool[] = []; const materials: M3dMaterial[] = []; let cur: M3dPool | null = null; let matBlock = 0;
  const rgba = (p: number) => [b[p] / 255, b[p + 1] / 255, b[p + 2] / 255, b[p + 3] / 255];
  for (const c of top) {
    if (c.type === 0xf) {
      cur = { indexBase: 0, wide: false, pos: new Float32Array(0), uv: new Float32Array(0), nrm: new Float32Array(0), col: new Uint8Array(0), posIdx: new Uint16Array(0), nrmIdx: new Uint16Array(0), uvIdx: new Uint16Array(0), colIdx: new Uint16Array(0), texRefs: [], matRefs: [], groups: [] };
      for (const k of c.children) {
        if (k.type === 0x10) cur.pos = f32(k, 3);
        else if (k.type === 0x11) cur.uv = f32(k, 2);
        else if (k.type === 0x12) cur.nrm = f32(k, 3);
        else if (k.type === 0x13) { const n = dv.getUint32(k.start, true); cur.col = b.slice(k.start + 4, k.start + 4 + n * 4); }
        else if (k.type === 0x78) {
          // u32 count; descriptor = u8 nc, nc × u8 component id, padded to an even length; then count × (nc × u16).
          // component ids: 0 = position, 1 = normal, 2 = uv (a second 2 = second uv set), 3 = colour.
          // Verified on Albert Park, Monaco and car meshes: every field's max index is < its array length.
          const n = dv.getUint32(k.start, true), nc = b[k.start + 4], descLen = (1 + nc + 1) & ~1, base = k.start + 4 + descLen;
          const ids = Array.from(b.subarray(k.start + 5, k.start + 5 + nc));
          const fields = ids.map(() => new Uint16Array(n));
          for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) fields[c][i] = dv.getUint16(base + i * nc * 2 + c * 2, true);
          cur.posIdx = cur.nrmIdx = cur.uvIdx = cur.colIdx = new Uint16Array(n);
          let uvSeen = false;
          ids.forEach((id, c) => {
            if (id === 0) cur!.posIdx = fields[c];
            else if (id === 1) cur!.nrmIdx = fields[c];
            else if (id === 2) { if (!uvSeen) { cur!.uvIdx = fields[c]; uvSeen = true; } else cur!.uv2Idx = fields[c]; }
            else if (id === 3) cur!.colIdx = fields[c];
          });
          cur.wide = nc >= 4;
        }
        else if (k.type === 0x16 && k.ref) cur.texRefs.push(dv.getUint32(k.start + 4, true));
      }
      pools.push(cur);
    } else if (c.type === 0x19 && cur) {
      const g: M3dGroup = { base: 0, count: 0, indices: new Uint16Array(0), texRef: -1, center: [0, 0, 0], bbox: [] };
      for (const k of c.children) {
        if (k.type === 0x7f) { const n = dv.getUint32(k.start, true) * 3; g.indices = new Uint16Array(b.buffer.slice(b.byteOffset + k.start + 4, b.byteOffset + k.start + 4 + n * 2)); }
        else if (k.type === 0x36) g.base = dv.getUint32(k.start, true);
        else if (k.type === 0x37) g.count = dv.getUint32(k.start, true);
        else if (k.type === 0x80) g.center = [0, 1, 2].map(i => dv.getFloat32(k.start + i * 4, true));
        else if (k.type === 0x81) g.bbox = [0, 1, 2, 3, 4, 5].map(i => dv.getFloat32(k.start + i * 4, true));
      }
      cur.groups.push(g);
    } else if (c.type === 0x39) {
      // material-ref blocks come after all pools, one per pool in order
      const pool = pools[matBlock++];
      if (pool) for (const k of c.children) if (k.type === 0x3a && k.ref) pool.matRefs.push(dv.getUint32(k.start + 4, true));
    } else if (c.type === 0x22) {
      const m: M3dMaterial = { id: -1, ambient: [0.1, 0.1, 0.1, 1], diffuse: [1, 1, 1, 1], specular: [0, 0, 0, 0], texId: -1, mipIds: [], layers: 0 };
      for (const k of c.children) {
        if (k.type === 0x23) m.id = dv.getUint32(k.start, true);
        else if (k.type === 0x24) m.ambient = rgba(k.start);
        else if (k.type === 0x25) m.diffuse = rgba(k.start);
        else if (k.type === 0x26) m.specular = rgba(k.start);
        else if (k.type === 0x27) {
          m.layers++;
          if (m.texId >= 0) continue; // first layer only for now
          for (const l of k.children) {
            if (l.type === 0x91) m.texId = dv.getUint32(l.start, true);
            else if (l.type === 0x92) { const n = dv.getUint32(l.start, true); for (let i = 0; i < n; i++) m.mipIds.push(dv.getUint32(l.start + 4 + i * 4, true)); }
          }
        }
      }
      materials.push(m);
    }
  }
  for (const pool of pools) pool.groups.forEach((g, i) => { g.texRef = pool.matRefs[i] ?? -1; });
  for (const pool of pools) pool.indexBase = indexShift; // indices are 0-based for every pool; indexShift is a debug override
  // 0x1e placement records (one per pool, in pool order): 0x1f = bounding sphere (x,y,z,r), 0x20 = bbox (min xyz, size xyz)
  let pi = 0;
  for (const c of top) if (c.type === 0x1e) {
    const pl: M3dPlacement = { center: [0, 0, 0], radius: 0, bboxMin: [0, 0, 0], bboxSize: [0, 0, 0] };
    for (const k of c.children) {
      if (k.type === 0x1f) { pl.center = [0, 1, 2].map(i => dv.getFloat32(k.start + i * 4, true)); pl.radius = dv.getFloat32(k.start + 12, true); }
      else if (k.type === 0x20) { pl.bboxMin = [0, 1, 2].map(i => dv.getFloat32(k.start + i * 4, true)); pl.bboxSize = [3, 4, 5].map(i => dv.getFloat32(k.start + i * 4, true)); }
    }
    if (pools[pi]) pools[pi].placement = pl;
    pi++;
  }
  return { pools, materials };
}
