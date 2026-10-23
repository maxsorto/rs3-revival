// MTH_Matrix3D / MAT3D_* port. Row-major 3x3 standard rotation matrix: world = R·local, local = Rᵀ·world,
// local axis i in world = column i (the original keeps the three basis vectors at +0xf0/+0x100/+0x110). m[r*3+c].
import { Vec3 } from './vec3';
export class Mat3 {
  m = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  identity(): this { this.m.set([1, 0, 0, 0, 1, 0, 0, 0, 1]); return this; }
  copy(o: Mat3): this { this.m.set(o.m); return this; }
  clone(): Mat3 { return new Mat3().copy(this); }
  row(i: number, out = new Vec3()): Vec3 { return out.set(this.m[i * 3], this.m[i * 3 + 1], this.m[i * 3 + 2]); }
  col(i: number, out = new Vec3()): Vec3 { return out.set(this.m[i], this.m[3 + i], this.m[6 + i]); }
  /** local axis i expressed in world coordinates (column i of the rotation matrix; the original's MTH_Basis vectors) */
  axis(i: number, out = new Vec3()): Vec3 { return this.col(i, out); }
  setAxes(x: Vec3, y: Vec3, z: Vec3): this { this.m.set([x.x, y.x, z.x, x.y, y.y, z.y, x.z, y.z, z.z]); return this; }
  /** MAT3D_vMulVector: out = M * v */
  mulVec(v: Vec3, out = new Vec3()): Vec3 { const m = this.m; return out.set(m[0] * v.x + m[1] * v.y + m[2] * v.z, m[3] * v.x + m[4] * v.y + m[5] * v.z, m[6] * v.x + m[7] * v.y + m[8] * v.z); }
  /** vMulTransposed: out = M^T * v */
  mulTransposedVec(v: Vec3, out = new Vec3()): Vec3 { const m = this.m; return out.set(m[0] * v.x + m[3] * v.y + m[6] * v.z, m[1] * v.x + m[4] * v.y + m[7] * v.z, m[2] * v.x + m[5] * v.y + m[8] * v.z); }
  /** MAT3D_vMulMatrix: this = a * b */
  mul(a: Mat3, b: Mat3): this {
    const x = a.m, y = b.m, o = new Float64Array(9);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = x[r * 3] * y[c] + x[r * 3 + 1] * y[3 + c] + x[r * 3 + 2] * y[6 + c];
    this.m.set(o); return this;
  }
  transpose(): this { const m = this.m; let t = m[1]; m[1] = m[3]; m[3] = t; t = m[2]; m[2] = m[6]; m[6] = t; t = m[5]; m[5] = m[7]; m[7] = t; return this; }
  /** MTH_Matrix3D::vSetWithRoll(angle): rotation about the local x (longitudinal) axis */
  setWithRoll(a: number): this { const c = Math.cos(a), s = Math.sin(a); this.m.set([1, 0, 0, 0, c, -s, 0, s, c]); return this; }
  /** MTH_Matrix3D::vSetWithYaw(sin, cos): rotation about z */
  setWithYaw(s: number, c: number): this { this.m.set([c, -s, 0, s, c, 0, 0, 0, 1]); return this; }
  setDiagonal(a: number, b: number, c: number): this { this.m.set([a, 0, 0, 0, b, 0, 0, 0, c]); return this; }
  /** inverse of a symmetric positive-definite 3x3 (inertia tensors) */
  invert(): this {
    const m = this.m, a = m[0], b = m[1], c = m[2], d = m[3], e = m[4], f = m[5], g = m[6], h = m[7], i = m[8];
    const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    const inv = 1 / det;
    this.m.set([A * inv, -(b * i - c * h) * inv, (b * f - c * e) * inv, B * inv, (a * i - c * g) * inv, -(a * f - c * d) * inv, C * inv, -(a * h - b * g) * inv, (a * e - b * d) * inv]);
    return this;
  }
}
