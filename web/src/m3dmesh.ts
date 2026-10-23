// Shared M3D → three.js mesh builder (used by the track viewer and the car model).
import * as THREE from 'three';
import { type M3d } from './m3d';
import { Mfd } from './mfd';
import { decodeTga } from './tga';
export class TextureSource {
  private cache = new Map<number, THREE.Texture | null>();
  constructor(private archives: Mfd[]) {}
  get(id: number): THREE.Texture | null {
    if (this.cache.has(id)) return this.cache.get(id)!;
    let tex: THREE.Texture | null = null;
    for (const a of this.archives) {
      const e = a.byId(id); if (!e) continue;
      const tga = decodeTga(a.bytes(e));
      tex = new THREE.DataTexture(tga.rgba, tga.width, tga.height, THREE.RGBAFormat);
      tex.flipY = false; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
      (tex as unknown as { hasAlpha: boolean }).hasAlpha = tga.hasAlpha && tga.rgba.some((v, i) => (i & 3) === 3 && v < 250);
      break;
    }
    this.cache.set(id, tex); return tex;
  }
  get size(): number { return this.cache.size; }
}
/** key identifying a group's geometry (bbox + index count) so duplicate groups across the two track chunks can be skipped */
export function groupKey(g: { bbox: number[]; indices: Uint16Array }): string { return g.bbox.map(v => v.toFixed(1)).join(',') + ':' + g.indices.length; }
interface Batch { pos: number[]; nrm: number[]; col: number[]; uv: number[]; hasNrm: boolean }
export interface BuildOptions {
  /** per-group callback (used by the car to attach groups to part nodes); when absent all groups of a material are merged into one mesh */
  onMesh?: (mesh: THREE.Mesh, poolIndex: number) => void;
  /** dedupe set shared across the two track chunks */
  seen?: Set<string>;
  tag?: string;
}
const matCache = new WeakMap<M3d, Map<string, THREE.Material>>();   // per file: material ids are reused across files with different meanings
function materialFor(file: M3d, texSrc: TextureSource, m: M3d['materials'][number] | undefined, tag: string): THREE.Material {
  let cache = matCache.get(file); if (!cache) { cache = new Map(); matCache.set(file, cache); }
  const key = `${tag}:${m ? m.id : -1}`;
  let mat = cache.get(key);
  if (!mat) {
    const tex = m ? texSrc.get(m.texId) : null;
    const alpha = !!tex && (tex as unknown as { hasAlpha: boolean }).hasAlpha;
    const side = new URLSearchParams(location.search).has('double') ? THREE.DoubleSide : THREE.FrontSide;
    mat = new THREE.MeshLambertMaterial({ map: tex ?? undefined, color: tex ? 0xffffff : 0x808080, side, transparent: alpha, alphaTest: alpha ? 0.4 : 0, vertexColors: false });
    mat.name = key; cache.set(key, mat);
  }
  return mat;
}
function makeGeometry(b: Batch): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(b.pos, 3));
  geo.setAttribute('normal', new THREE.Float32BufferAttribute(b.nrm, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(b.col, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
  if (!b.hasNrm) geo.computeVertexNormals();
  return geo;
}
export function buildM3dMeshes(m3d: M3d, texSrc: TextureSource, tagOrOpts: string | BuildOptions = '', onMeshLegacy?: (mesh: THREE.Mesh, poolIndex: number) => void, seenLegacy?: Set<string>): THREE.Mesh[] {
  const opts: BuildOptions = typeof tagOrOpts === 'string' ? { tag: tagOrOpts, onMesh: onMeshLegacy, seen: seenLegacy } : tagOrOpts;
  const { pools, materials } = m3d; const out: THREE.Mesh[] = []; const tag = opts.tag ?? '';
  const merged = new Map<number, Batch>();   // material index → batch (track mode)
  for (let pIdx = 0; pIdx < pools.length; pIdx++) { const pool = pools[pIdx]; for (const g of pool.groups) {
    if (opts.seen) { const k = groupKey(g); if (opts.seen.has(k)) continue; opts.seen.add(k); }
    const n = g.indices.length; if (n < 3) continue;
    let batch: Batch;
    if (opts.onMesh) batch = { pos: [], nrm: [], col: [], uv: [], hasNrm: pool.nrm.length > 0 };
    else { let b = merged.get(g.texRef); if (!b) { b = { pos: [], nrm: [], col: [], uv: [], hasNrm: pool.nrm.length > 0 }; merged.set(g.texRef, b); } batch = b; }
    const { pos, nrm, col, uv } = batch;
    for (let i = 0; i < n; i++) {
      const r = Math.max(0, g.base + g.indices[i] + pool.indexBase), ni = pool.nrmIdx[r], ci = pool.colIdx[r] & 0xff, ti = pool.uvIdx[r], pi = pool.posIdx[r];
      pos.push(pool.pos[pi * 3], pool.pos[pi * 3 + 1], pool.pos[pi * 3 + 2]);
      if (pool.nrm.length) nrm.push(pool.nrm[ni * 3], pool.nrm[ni * 3 + 1], pool.nrm[ni * 3 + 2]); else nrm.push(0, 0, 1);
      if (pool.uv.length) { const u0 = pool.uv[ti * 2], v0 = pool.uv[ti * 2 + 1]; uv.push(Math.abs(u0) < 1e4 ? u0 : 0, Math.abs(v0) < 1e4 ? v0 : 0); } else uv.push(0, 0);
      if (pool.col.length >= (ci + 1) * 4) col.push(pool.col[ci * 4] / 255, pool.col[ci * 4 + 1] / 255, pool.col[ci * 4 + 2] / 255); else col.push(0.8, 0.8, 0.8);
    }
    if (opts.onMesh) {
      const mesh = new THREE.Mesh(makeGeometry(batch), materialFor(m3d, texSrc, materials[g.texRef], tag)); opts.onMesh(mesh, pIdx); out.push(mesh);
    }
  } }
  for (const [mi, b] of merged) { const mesh = new THREE.Mesh(makeGeometry(b), materialFor(m3d, texSrc, materials[mi], tag)); out.push(mesh); }
  return out;
}
