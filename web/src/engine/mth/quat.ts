// QUAT_* port. Stored as (w, x, y, z) like the original (+0xc0 w, +0xd0 xyz).
import { Vec3 } from './vec3';
import { Mat3 } from './mat3';
export class Quat {
  constructor(public w = 1, public x = 0, public y = 0, public z = 0) {}
  set(w: number, x: number, y: number, z: number): this { this.w = w; this.x = x; this.y = y; this.z = z; return this; }
  copy(q: Quat): this { return this.set(q.w, q.x, q.y, q.z); }
  norm(): number { return Math.sqrt(this.w * this.w + this.x * this.x + this.y * this.y + this.z * this.z); }
  /** QUAT_eNormalizeItself */
  normalize(): this { const n = this.norm(); if (n !== 0) { this.w /= n; this.x /= n; this.y /= n; this.z /= n; } return this; }
  /** QUAT_vMulQuaternion: this = a * b */
  mul(a: Quat, b: Quat): this {
    const w = a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z;
    const x = a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y;
    const y = a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x;
    const z = a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w;
    return this.set(w, x, y, z);
  }
  /** QUAT_vQuaternionToMatrixConversion -> rotation matrix (rows = basis vectors expressed in world) */
  toMatrix(out = new Mat3()): Mat3 {
    const { w, x, y, z } = this;
    out.m.set([1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y),
               2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x),
               2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)]);
    return out;
  }
  /** QUAT_vMatrixToQuaternionConversion */
  fromMatrix(r: Mat3): this {
    const m = r.m, tr = m[0] + m[4] + m[8];
    if (tr > 0) { const s = Math.sqrt(tr + 1) * 2; return this.set(0.25 * s, (m[7] - m[5]) / s, (m[2] - m[6]) / s, (m[3] - m[1]) / s); }
    if (m[0] > m[4] && m[0] > m[8]) { const s = Math.sqrt(1 + m[0] - m[4] - m[8]) * 2; return this.set((m[7] - m[5]) / s, 0.25 * s, (m[1] + m[3]) / s, (m[2] + m[6]) / s); }
    if (m[4] > m[8]) { const s = Math.sqrt(1 + m[4] - m[0] - m[8]) * 2; return this.set((m[2] - m[6]) / s, (m[1] + m[3]) / s, 0.25 * s, (m[5] + m[7]) / s); }
    const s = Math.sqrt(1 + m[8] - m[0] - m[4]) * 2; return this.set((m[3] - m[1]) / s, (m[2] + m[6]) / s, (m[5] + m[7]) / s, 0.25 * s);
  }
  fromAxisAngle(axis: Vec3, angle: number): this { const s = Math.sin(angle / 2); return this.set(Math.cos(angle / 2), axis.x * s, axis.y * s, axis.z * s); }
}
