// MTH_Vector3D / VECT3D_* port. Game space: x,y ground plane, z up (right/left-handedness handled at render).
export class Vec3 {
  constructor(public x = 0, public y = 0, public z = 0) {}
  set(x: number, y: number, z: number): this { this.x = x; this.y = y; this.z = z; return this; }
  copy(v: Vec3): this { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone(): Vec3 { return new Vec3(this.x, this.y, this.z); }
  add(v: Vec3): this { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v: Vec3): this { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  scale(s: number): this { this.x *= s; this.y *= s; this.z *= s; return this; }
  addScaled(v: Vec3, s: number): this { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  dot(v: Vec3): number { return this.x * v.x + this.y * v.y + this.z * v.z; }
  cross(a: Vec3, b: Vec3): this { const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x; this.x = x; this.y = y; this.z = z; return this; }
  norm(): number { return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z); }   // VECT3D_xNorm
  norm2(): number { return this.x * this.x + this.y * this.y + this.z * this.z; }
  normalize(): this { const n = this.norm(); if (n !== 0) this.scale(1 / n); return this; }
  static sub(a: Vec3, b: Vec3, out = new Vec3()): Vec3 { return out.set(a.x - b.x, a.y - b.y, a.z - b.z); }
  static add(a: Vec3, b: Vec3, out = new Vec3()): Vec3 { return out.set(a.x + b.x, a.y + b.y, a.z + b.z); }
}
