// F1CL_F1CollisionModel / COL_CollisionSolver port (structure from vInitCollisionModel @001d87f0, vBuildWallList @001d7340,
// bComputeCollisionsWithWall @001d79e0, MGEO_CollisionDetector::b2DIntersectSphereWithWall @001f0200, vApplyImpulsion @001eaea0,
// vComputeAndApplyImpulsion1 @001e97d0). The car is a set of spheres (chassis.collision.*) grouped front / middle / rear; walls are
// vertical segments (MMB type 3). Contact response: impulse along the wall normal with the material's rebound (restitution) and a
// Coulomb friction impulse along the tangent, applied to the rigid body (linear + angular), as COL_CollisionSolver does.
import { Vec3 } from '../mth/vec3';
import { PhysicalSolid } from '../mec/solid';
import { Setup } from '../data/setup';
import { RoadMesh } from '../road';
export interface Sphere { local: Vec3; r: number; world: Vec3 }
export interface WallMaterial { rebound: number; friction: number }
export class CollisionModel {
  spheres: Sphere[] = [];
  boundingRadius = 0;
  /** F1CL_F1CollisionModel::vInitCollisionModel: 3 sphere sets (front: big + small + wheel spheres + wings + nose; middle; rear) */
  init(s: Setup, frontWheelRadius: number, rearWheelRadius: number): void {
    const g = (n: string) => s.f('chassis.collision.' + n);
    const add = (x: number, y: number, z: number, r: number) => this.spheres.push({ local: new Vec3(x, y, z), r, world: new Vec3() });
    const fwb = s.f('chassis.geometrie.front_wheel_base'), fht = s.f('chassis.geometrie.front_half_track');
    const rwb = s.f('chassis.geometrie.rear_wheel_base'), rht = s.f('chassis.geometrie.rear_half_track');
    add(g('front_small_sphere_x'), 0, 0, g('front_small_sphere_radius'));
    add(fwb, -(fht + 0.1), 0, frontWheelRadius); add(fwb, fht + 0.1, 0, frontWheelRadius);            // front wheels (y pushed out by 0.1)
    add(g('front_wing_x'), -g('front_wing_y'), 0, g('front_wing_radius')); add(g('front_wing_x'), g('front_wing_y'), 0, g('front_wing_radius'));
    add(g('nose_x'), 0, 0, g('nose_radius'));
    add(g('middle_front_sphere_x'), 0, 0, g('middle_front_sphere_radius')); add(g('middle_rear_sphere_x'), 0, 0, g('middle_rear_sphere_radius'));
    add(g('rear_small_sphere_x'), 0, 0, g('rear_small_sphere_radius'));
    add(rwb, -(rht + 0.1), 0, rearWheelRadius); add(rwb, rht + 0.1, 0, rearWheelRadius);
    add(g('rear_wing_x'), -g('rear_wing_y'), 0, g('rear_wing_radius')); add(g('rear_wing_x'), g('rear_wing_y'), 0, g('rear_wing_radius'));
    add(g('top_sphere_x'), 0, g('top_sphere_z'), g('top_sphere_radius'));
    for (const sp of this.spheres) { const d = sp.local.norm() + sp.r; if (d > this.boundingRadius) this.boundingRadius = d; }
  }
  /**
   * bComputeCollisionsWithWall(dt): test every sphere against nearby walls; on penetration push the body out and apply the impulse.
   * Returns true when a collision happened (the original then re-integrates the remaining fraction of the step).
   */
  computeCollisionsWithWall(body: PhysicalSolid, road: RoadMesh, dt: number, wallMats: WallMaterial[]): boolean {
    const speed = body.speedNorm();
    const cands = road.wallsNear(body.pos.x, body.pos.y, this.boundingRadius + speed * dt + 0.1);
    if (!cands.length) return false;
    let hit = false;
    for (const sp of this.spheres) body.R.mulVec(sp.local, sp.world).add(body.pos);
    for (let iter = 0; iter < 4; iter++) {
      let any = false;
      for (const wi of cands) {
        const w = road.walls[wi];
        for (const sp of this.spheres) {
          const c = sp.world;
          if (c.z + sp.r < w.zb || c.z - sp.r > w.zt) continue;
          // closest point on the segment (2D)
          const dx = w.x2 - w.x1, dy = w.y2 - w.y1, len2 = dx * dx + dy * dy;
          let t = ((c.x - w.x1) * dx + (c.y - w.y1) * dy) / (len2 || 1); if (t < 0) t = 0; else if (t > 1) t = 1;
          const px = w.x1 + t * dx, py = w.y1 + t * dy;
          let nx = c.x - px, ny = c.y - py; const d = Math.hypot(nx, ny);
          if (d >= sp.r) continue;
          if (d < 1e-6) { nx = w.nx; ny = w.ny; } else { nx /= d; ny /= d; }
          const pen = sp.r - d;
          // push out along the normal
          body.pos.x += nx * pen; body.pos.y += ny * pen;
          for (const q of this.spheres) q.world.x += nx * pen, q.world.y += ny * pen;
          const n = new Vec3(nx, ny, 0), contact = new Vec3(px, py, c.z);
          const vrel = body.speedAtPoint(contact); const vn = vrel.dot(n);
          if (vn < 0) {
            const mat = wallMats[Math.min(w.material - 8, wallMats.length - 1)] ?? wallMats[0];
            const r = Vec3.sub(contact, body.pos);
            const rn = new Vec3().cross(r, n), iw = body.worldInvInertia.mulVec(rn), ang = new Vec3().cross(iw, r).dot(n);
            const jn = -(1 + mat.rebound) * vn / (body.invMass + ang);
            const impulse = n.clone().scale(jn);
            // friction along the tangential relative velocity, clamped by μ·jn
            const vt = vrel.clone().addScaled(n, -vn); const vtn = vt.norm();
            if (vtn > 1e-4) { const tdir = vt.scale(1 / vtn); const rt = new Vec3().cross(r, tdir), it = body.worldInvInertia.mulVec(rt), angt = new Vec3().cross(it, r).dot(tdir); let jt = -vtn / (body.invMass + angt); const max = mat.friction * Math.abs(jn); if (jt < -max) jt = -max; impulse.addScaled(tdir, jt); }
            this.applyImpulse(body, impulse, r);
            hit = true; any = true;
          }
        }
      }
      if (!any) break;
    }
    return hit;
  }
  /** COL_CollisionSolver::vApplyImpulsion: v += J/m (vz capped at 4 m/s), L += r × J, ω = Iinv·L */
  applyImpulse(body: PhysicalSolid, J: Vec3, r: Vec3): void {
    body.v.addScaled(J, body.invMass); if (body.v.z > 4) body.v.z = 4; body.invalidateSpeedNorm();
    body.L.add(new Vec3().cross(r, J)); body.worldInvInertia.mulVec(body.L, body.w);
  }
}
