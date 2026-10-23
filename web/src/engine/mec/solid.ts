// MEC_PhysicalState + MEC_PhysicalSolid port (PS2 RS3.ELF: vFPM @001e3b40, vSumTorsors, vComputeSpeedAtPoint).
// Field map of the original (offsets from the F1MC_F1Car object, which embeds the state at +0x60):
//   +0x20 mass                 +0x60 speed v (world)        +0x70 angular speed ω (world)
//   +0x80 angular momentum L   +0x90 world inverse inertia  +0xc0 quaternion (w @c0, xyz @d0)
//   +0xe0 validity flags       +0xf0 basis R (3 rows)        +0x120 position
//   +0x1a0 local inverse inertia  +0x1d0 cached |v|, +0x1d4 cache flag
import { Vec3 } from '../mth/vec3';
import { Mat3 } from '../mth/mat3';
import { Quat } from '../mth/quat';

export class Torsor {           // MEC_Torsor: a force and the point it is applied at (world coordinates)
  force = new Vec3();
  point = new Vec3();
  pointIsRelative = true;       // +0x25 in the original: application point given relative to the CoG
}

export class PhysicalState {
  v = new Vec3();               // linear speed
  w = new Vec3();               // angular speed
  L = new Vec3();               // angular momentum
  q = new Quat();               // orientation
  R = new Mat3();               // rotation matrix, world = R·local; axes = columns (x forward, y left, z up)
  pos = new Vec3();
  /** MEC_PhysicalState::vComputeSpeedAtPoint: speed of a world point rigidly attached to the body */
  speedAtPoint(worldPoint: Vec3, out = new Vec3()): Vec3 {
    const r = Vec3.sub(worldPoint, this.pos);
    return out.cross(this.w, r).add(this.v);
  }
  syncMatrixFromQuat(): void { this.q.toMatrix(this.R); }
  syncQuatFromMatrix(): void { this.q.fromMatrix(this.R).normalize(); }
}

export class PhysicalSolid extends PhysicalState {
  mass = 1;
  invMass = 1;
  localInvInertia = new Mat3();
  worldInvInertia = new Mat3();
  private speedNormCache = 0; private speedNormValid = false;
  sumForce = new Vec3();        // torsor sum, +0x270
  sumTorque = new Vec3();       // +0x280

  /** MEC_PhysicalSolid::vSetLocalInertiaMatrix */
  setLocalInertia(I: Mat3): void { this.localInvInertia.copy(I).invert(); this.computeAnnexData(); }
  setMass(m: number): void { this.mass = m; this.invMass = 1 / m; }
  speedNorm(): number { if (!this.speedNormValid) { this.speedNormCache = this.v.norm(); this.speedNormValid = true; } return this.speedNormCache; }
  invalidateSpeedNorm(): void { this.speedNormValid = false; }

  /** MEC_PhysicalSolid::vComputeAnnexData: world inverse inertia = R * Iinv_local * R^T, then ω = Iinv_world * L */
  computeAnnexData(): void {
    const Rt = this.R.clone().transpose();
    this.worldInvInertia.mul(new Mat3().mul(this.R, this.localInvInertia), Rt);
    this.worldInvInertia.mulVec(this.L, this.w);
  }

  /** MEC_PhysicalSolid::vSumTorsors: accumulate force/torque of every torsor around the centre of gravity */
  sumTorsors(torsors: Iterable<Torsor>): void {
    this.sumForce.set(0, 0, 0); this.sumTorque.set(0, 0, 0);
    const r = new Vec3(), t = new Vec3();
    for (const ts of torsors) {
      this.sumForce.add(ts.force);
      if (ts.pointIsRelative) r.copy(ts.point); else Vec3.sub(ts.point, this.pos, r);
      this.sumTorque.add(t.cross(r, ts.force));
    }
  }

  /**
   * MEC_PhysicalSolid::vFPM (Fundamental Principle of Mechanics), dt in seconds.
   * Semi-implicit Euler exactly as the original: a = F/m with z-acceleration clamped to [-50, +20] m/s²,
   * v += a·dt, pos += v·dt, L += τ·dt, q += ½·dt·(ω ⊗ q) then renormalise, R from q, ω = Iinv_world·L.
   */
  fpm(dt: number, force: Vec3, torque: Vec3): void {
    this.computeAnnexData();
    const ax = force.x * this.invMass, ay = force.y * this.invMass;
    let az = force.z * this.invMass;
    if (az > 20) az = 20; else if (az < -50) az = -50;
    this.v.x += ax * dt; this.v.y += ay * dt; this.v.z += az * dt;
    this.speedNormValid = false;
    this.pos.addScaled(this.v, dt);
    this.L.addScaled(torque, dt);
    // quaternion integration: dq = (0, ω) * q ; q += 0.5*dt*dq
    const dq = new Quat().mul(new Quat(0, this.w.x, this.w.y, this.w.z), this.q);
    const h = dt * 0.5;
    this.q.w += dq.w * h; this.q.x += dq.x * h; this.q.y += dq.y * h; this.q.z += dq.z * h;
    this.q.normalize();
    this.q.toMatrix(this.R);
    this.computeAnnexData();
  }

  /** MEC_PhysicalSolid::vInitWithPositionAndSpeed (subset): place the body, reset momenta */
  initWithPositionAndSpeed(pos: Vec3, forward: Vec3, speed: number): void {
    this.pos.copy(pos);
    const x = forward.clone(); x.z = 0; x.normalize();
    const z = new Vec3(0, 0, 1), y = new Vec3().cross(z, x);
    this.R.setAxes(x, y, z);
    this.syncQuatFromMatrix();
    this.v.copy(x).scale(speed); this.w.set(0, 0, 0); this.L.set(0, 0, 0);
    this.speedNormValid = false;
    this.computeAnnexData();
  }
}
