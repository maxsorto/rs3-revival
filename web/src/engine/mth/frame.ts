// MTH_FrameOfReference: rotation (Mat3, rows) + origin. vCompose(parent, local): world = parent ∘ local.
import { Vec3 } from './vec3';
import { Mat3 } from './mat3';
export class Frame {
  rot = new Mat3();
  pos = new Vec3();
  copy(f: Frame): this { this.rot.copy(f.rot); this.pos.copy(f.pos); return this; }
  /** this = parent ∘ local  (MTH_FrameOfReference::vCompose) */
  compose(parent: Frame, local: Frame): this {
    const r = new Mat3().mul(parent.rot, local.rot);
    const p = parent.rot.mulVec(local.pos).add(parent.pos);
    this.rot.copy(r); this.pos.copy(p); return this;
  }
  toWorld(local: Vec3, out = new Vec3()): Vec3 { return this.rot.mulVec(local, out).add(this.pos); }
  toLocal(world: Vec3, out = new Vec3()): Vec3 { return this.rot.mulTransposedVec(Vec3.sub(world, this.pos, out), out); }
}
