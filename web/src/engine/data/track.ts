// Track-side data for the simulation: collision mesh (MMB) → RoadMesh, grid slots (entry 0x216d).
import { parseDchk } from '../../dchk';
import { Mfd } from '../../mfd';
import { RoadMesh } from '../road';
import { Vec3 } from '../mth/vec3';
export interface GridSlot { pos: Vec3; dir: Vec3 }
export function buildRoad(mmb: Uint8Array): RoadMesh {
  const dv = new DataView(mmb.buffer, mmb.byteOffset, mmb.byteLength);
  const { root } = parseDchk(mmb);
  const leaves = new Map(root[0].children.filter(c => c.leaf).map(c => [c.type, c]));
  const l0 = leaves.get(0)!; let p = l0.start;
  const nv = dv.getUint32(p, true); p += 4;
  const pos = new Float32Array(nv * 3); for (let i = 0; i < nv * 3; i++) pos[i] = dv.getFloat32(p + i * 4, true); p += nv * 12;
  const nt = dv.getUint32(p, true); p += 4;
  const tris = new Uint32Array(nt * 3), mat = new Uint16Array(nt);
  for (let i = 0; i < nt; i++) { tris[i * 3] = dv.getUint32(p, true); tris[i * 3 + 1] = dv.getUint32(p + 4, true); tris[i * 3 + 2] = dv.getUint32(p + 8, true); mat[i] = dv.getUint16(p + 12, true); p += 16; }
  const road = new RoadMesh(pos, tris, mat);
  const l3 = leaves.get(3);
  if (l3) {
    p = l3.start; const np = dv.getUint32(p, true); p += 4;
    const pts = new Float32Array(np * 2); for (let i = 0; i < np * 2; i++) pts[i] = dv.getFloat32(p + i * 4, true); p += np * 8;
    const nw = dv.getUint32(p, true); p += 4;
    const idx = new Int32Array(nw * 2), mats = new Uint32Array(nw);
    for (let i = 0; i < nw; i++) { idx[i * 2] = dv.getInt32(p, true); idx[i * 2 + 1] = dv.getInt32(p + 4, true); mats[i] = dv.getUint32(p + 8, true); p += 12; }
    const h = new Float32Array(nw * 2); for (let i = 0; i < nw * 2; i++) h[i] = dv.getFloat32(p + i * 4, true);
    road.setWalls(pts, idx, mats, h);
  }
  return road;
}
/** grid entry (id differs per track; header u32s (22, 11, 22, 1), 1364 bytes): 16-byte header then 22 × { vec3 pos, vec3 dir } */
export function parseGrid(b: Uint8Array): GridSlot[] {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); const n = dv.getUint32(0, true); const out: GridSlot[] = [];
  for (let i = 0; i < n; i++) { const o = 16 + i * 24; out.push({ pos: new Vec3(dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)), dir: new Vec3(dv.getFloat32(o + 12, true), dv.getFloat32(o + 16, true), dv.getFloat32(o + 20, true)) }); }
  return out;
}
export function trackRoad(t: Mfd): RoadMesh { const e = t.entries.find(x => t.magic(x) === 'MMB')!; return buildRoad(t.bytes(e)); }
export function findGridEntry(t: Mfd) {
  return t.entries.find(e => { if (e.size !== 1364) return false; const b = t.bytes(e); const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); return dv.getUint32(0, true) === 22 && dv.getUint32(4, true) === 11 && dv.getUint32(8, true) === 22 && dv.getUint32(12, true) === 1; });
}
export function trackGrid(t: Mfd): GridSlot[] { const e = findGridEntry(t); return e ? parseGrid(t.bytes(e)) : []; }

/** Track sectors (entry like 0x3c8a): u32 n, then n × { u32 flag, u32 idxA, vec3 A, u32 idxB, vec3 B } where idx are racing-line waypoint
 *  indices (increasing around the lap) and A/B the waypoint positions; record 0 is the degenerate start/finish sector. A trailer follows. */
export interface TrackSector { a: Vec3; b: Vec3; ia: number; ib: number }
export function trackSectors(t: Mfd): TrackSector[] {
  for (const e of t.entries) {
    if (e.size < 4 + 36 * 3 || e.size > 20000) continue;
    const b = t.bytes(e); const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); const n = dv.getUint32(0, true);
    if (n < 3 || n > 200 || e.size < 4 + n * 36) continue;
    const out: TrackSector[] = []; let ok = true;
    for (let i = 0; i < n && ok; i++) {
      const o = 4 + i * 36; const flag = dv.getUint32(o, true), ia = dv.getUint32(o + 4, true), ib = dv.getUint32(o + 20, true);
      if (flag === 1 && i >= 3) break;                      // trailing flag-1 records (pit lane sectors) end the lap list
      if (flag !== 0 || ia > 100000 || ib > 100000) { ok = false; break; }
      out.push({ ia, ib, a: new Vec3(dv.getFloat32(o + 8, true), dv.getFloat32(o + 12, true), dv.getFloat32(o + 16, true)), b: new Vec3(dv.getFloat32(o + 24, true), dv.getFloat32(o + 28, true), dv.getFloat32(o + 32, true)) });
    }
    if (ok && out.length >= 3) return out;
  }
  return [];
}

/** Centre-line waypoints (entry like 0x523e): u32 n, vec3 start, then n × { u32 kind, vec3 pos, vec3 dir, f32 distanceToFinish }. */
export interface Waypoint { pos: Vec3; dir: Vec3; dist: number; kind: number }
export function trackWaypoints(t: Mfd): Waypoint[] {
  for (const e of t.entries) {
    if (e.size < 16 + 32 * 4 || e.size > 20000) continue;
    const b = t.bytes(e); const dv = new DataView(b.buffer, b.byteOffset, b.byteLength); const n = dv.getUint32(0, true);
    if (n < 4 || e.size !== 16 + n * 32) continue;
    const out: Waypoint[] = []; let ok = true;
    for (let i = 0; i < n; i++) {
      const o = 16 + i * 32; const kind = dv.getUint32(o, true);
      const dir = new Vec3(dv.getFloat32(o + 16, true), dv.getFloat32(o + 20, true), dv.getFloat32(o + 24, true));
      if (kind > 64 || Math.abs(dir.norm() - 1) > 0.05) { ok = false; break; }
      out.push({ kind, pos: new Vec3(dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true), dv.getFloat32(o + 12, true)), dir, dist: dv.getFloat32(o + 28, true) });
    }
    if (ok) return out;
  }
  return [];
}
