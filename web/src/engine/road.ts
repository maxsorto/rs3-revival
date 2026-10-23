// Road surface for the physics: BKGD_BoundTriangleList / F1CL_CollidingSphere static plane search / MGEO walls.
// Built from the MMB chunk (collision mesh, see tools/dchk.py). Triangles live in a uniform 2D grid for lookup
// (the original uses a quadtree, BKGD_QuadTreeNode; same result).
import { Vec3 } from './mth/vec3';
export interface RoadPlane { n: Vec3; z: number; material: number; tri: number }
export class RoadMesh {
  readonly pos: Float32Array; readonly tris: Uint32Array; readonly mat: Uint16Array;
  private cell = 8; private minx = 0; private miny = 0; private nx = 1; private ny = 1; private grid: Int32Array[] = [];
  walls: { x1: number; y1: number; x2: number; y2: number; zb: number; zt: number; material: number; nx: number; ny: number; len: number }[] = [];
  private wallGrid = new Map<number, number[]>();
  constructor(pos: Float32Array, tris: Uint32Array, mat: Uint16Array) {
    this.pos = pos; this.tris = tris; this.mat = mat;
    let minx = Infinity, miny = Infinity, maxx = -Infinity, maxy = -Infinity;
    for (let i = 0; i < pos.length; i += 3) { const x = pos[i], y = pos[i + 1]; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
    this.minx = minx; this.miny = miny; this.nx = Math.ceil((maxx - minx) / this.cell) + 1; this.ny = Math.ceil((maxy - miny) / this.cell) + 1;
    const buckets: number[][] = new Array(this.nx * this.ny);
    const nt = tris.length / 3;
    for (let t = 0; t < nt; t++) {
      const a = tris[t * 3] * 3, b = tris[t * 3 + 1] * 3, c = tris[t * 3 + 2] * 3;
      const x0 = Math.min(pos[a], pos[b], pos[c]), x1 = Math.max(pos[a], pos[b], pos[c]), y0 = Math.min(pos[a + 1], pos[b + 1], pos[c + 1]), y1 = Math.max(pos[a + 1], pos[b + 1], pos[c + 1]);
      for (let gy = this.gy(y0); gy <= this.gy(y1); gy++) for (let gx = this.gx(x0); gx <= this.gx(x1); gx++) { const k = gy * this.nx + gx; (buckets[k] ??= []).push(t); }
    }
    this.grid = buckets.map(b => b ? Int32Array.from(b) : new Int32Array(0));
  }
  private gx(x: number): number { return Math.min(this.nx - 1, Math.max(0, Math.floor((x - this.minx) / this.cell))); }
  private gy(y: number): number { return Math.min(this.ny - 1, Math.max(0, Math.floor((y - this.miny) / this.cell))); }
  /**
   * Plane under a 2D point (F1CL_CollidingSphere::b2DSearchForTriangleWithList + vStaticallySearchForPlane).
   * When several triangles contain the point (bridges), prefer the highest one that is still below zRef + 2/3 m
   * (the original compares vertex-height sums against 3·z + 2).
   */
  planeAt(x: number, y: number, zRef: number, out: RoadPlane): boolean {
    const bucket = this.grid[this.gy(y) * this.nx + this.gx(x)]; if (!bucket) return false;
    const p = this.pos, tr = this.tris; let best = -1, bestZ = -Infinity;
    for (let i = 0; i < bucket.length; i++) {
      const t = bucket[i], a = tr[t * 3] * 3, b = tr[t * 3 + 1] * 3, c = tr[t * 3 + 2] * 3;
      const ax = p[a], ay = p[a + 1], bx = p[b], by = p[b + 1], cx = p[c], cy = p[c + 1];
      const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by), d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy), d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
      const neg = d1 < 0 || d2 < 0 || d3 < 0, pos = d1 > 0 || d2 > 0 || d3 > 0;
      if (neg && pos) continue;
      const zsum = p[a + 2] + p[b + 2] + p[c + 2];
      if (best < 0 || (zsum < zRef * 3 + 2 && zsum > bestZ)) { best = t; bestZ = zsum; }
    }
    if (best < 0) return false;
    const a = tr[best * 3] * 3, b = tr[best * 3 + 1] * 3, c = tr[best * 3 + 2] * 3;
    const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2], vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz); if (l === 0) return false; nx /= l; ny /= l; nz /= l; if (nz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    out.n.set(nx, ny, nz);
    out.z = p[a + 2] - (nx * (x - p[a]) + ny * (y - p[a + 1])) / nz;   // plane height at (x, y)
    out.material = this.mat[best]; out.tri = best;
    return true;
  }
  /** MMB type-3 walls: 2D segments with a vertical extent (MGEO_VerticalWall) */
  setWalls(points: Float32Array, idx: Int32Array, mats: Uint32Array, heights: Float32Array): void {
    this.walls = [];
    for (let i = 0; i < idx.length / 2; i++) {
      const p1 = idx[i * 2] * 2, p2 = idx[i * 2 + 1] * 2;
      const x1 = points[p1], y1 = points[p1 + 1], x2 = points[p2], y2 = points[p2 + 1];
      const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1;
      const w = { x1, y1, x2, y2, zb: heights[i * 2], zt: heights[i * 2 + 1], material: mats[i], nx: -dy / len, ny: dx / len, len };
      const wi = this.walls.push(w) - 1;
      for (let gy = this.gy(Math.min(y1, y2)); gy <= this.gy(Math.max(y1, y2)); gy++) for (let gx = this.gx(Math.min(x1, x2)); gx <= this.gx(Math.max(x1, x2)); gx++) { const k = gy * this.nx + gx; let l = this.wallGrid.get(k); if (!l) this.wallGrid.set(k, l = []); l.push(wi); }
    }
  }
  /** walls whose grid cells overlap the circle (x, y, r) — candidates for sphere/wall tests (F1CL_CollisionModel::vBuildWallList) */
  wallsNear(x: number, y: number, r: number): number[] {
    const out: number[] = []; const seen = new Set<number>();
    for (let gy = this.gy(y - r); gy <= this.gy(y + r); gy++) for (let gx = this.gx(x - r); gx <= this.gx(x + r); gx++) { const l = this.wallGrid.get(gy * this.nx + gx); if (l) for (const w of l) if (!seen.has(w)) { seen.add(w); out.push(w); } }
    return out;
  }
}
/** COL_MaterialList / F1CL_RoadMaterial: per surface id (triangle material 1..7) -> adhesion, rolling resistance, rebound, friction */
export interface RoadMaterial { name: string; dryAdhesion: number; wetAdhesion: number; rollingResistance: number; rebound: number; friction: number; bumpAmplitude: number; bumpWaveLength: number }
