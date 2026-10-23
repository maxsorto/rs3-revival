// PART_Wheel + F1MC_Wheel port. Sources (PS2 RS3.ELF): vInit @001ded00, vComputeWheelPosition @001defc0, vComputeWheelSpeed @001df110,
// vComputeZForce @001df290, vComputeBrakeTorque @001df3a0, vComputeXYForce @001df3e0, vComputeForceImposedY @001dfaf0,
// vComputeForceImposedX @001e0060, vApplyCircleCouplingConstraint @001e0170, vComputeSlipAngle @001e1520, vComputeSlidingCoef @001e0810,
// vComputeRotationSpeed @001e0970, vSetSteeringAngle @001e10e0, vSetPressure @001e13a0, bComputeIsTorqueActive @001e0480, vDoesSlidingStart @001e07d0.
// Original field map (PART_Wheel): +4 touching, +5 sliding, +8 slidingCoef, +0xc gripCoef, +0x10 flags (bit0 rear, bit1 right),
// +0x30 local pos (x,y,z), +0x38 z, +0x90 ω, +0x94 Δω, +0x98 steer, +0x9c cos, +0xa0 sin, +0xa4 rotation angle, +0xa8 camber (static+travel),
// +0xac camber vs ground, +0xb0 static camber, +0xb4 static toe, +0xb8 rest z, +0xbc radius, +0xc0 1/radius, +0xc4 slip angle,
// +0xc8 vertical speed, +0xd0 x axis (world), +0xe0 y axis (world), +0x100 drive torque, +0x104 Fy camber, +0x108 brake torque,
// +0x10c Fmax, +0x110 1/Fmax, +0x120 Fx imposed, +0x124 Fy imposed, +0x128/+0x12c Fx/Fy after friction circle, +0x130/+0x134 final Fx/Fy,
// +0x138 circle exceeded, +0x13c mass, +0x140 weight, +0x148 inertia, +0x14c grip-from-pressure, +0x150 slip-from-pressure,
// +0x158 oversteer Fy multiplier, +0x15c oversteer slip multiplier, +0x164 CMD_Helps (traction control, ABS), +0x170 wheel speed (world)
import { Vec3 } from '../mth/vec3';
import { Setup, DEG, G } from '../data/setup';
import { TireType, TyreCatalog } from './tiretype';
import { ShockAbsorber } from './shock';
import { Brake } from './brake';
import { PhysicalState, Torsor } from '../mec/solid';
import { RoadMesh, type RoadPlane, type RoadMaterial } from '../road';

const SIN_TABLE_PI_2 = 1.5708;
/** asin approximation of the original (aASinTable lookup on 2001 samples of [-1,1]) */
function asinTable(x: number): number { if (x >= 1) return SIN_TABLE_PI_2; if (x <= -1) return -SIN_TABLE_PI_2; return Math.asin(x); }

export interface Helps { tractionControl: number; abs: number }   // CMD_Helps as read by PART_Wheel (+0x164)[0], [1]

export class Wheel {
  readonly rear: boolean; readonly right: boolean;
  touching = false; sliding = false; slidingCoef = 0; gripCoef = 1;
  local = new Vec3();           // +0x30 (z is the live suspension position)
  restZ = 0; radius = 0; invRadius = 0; mass = 0; weight = 0; inertia = 0;
  omega = 0; deltaOmega = 0; steer = 0; cosSteer = 1; sinSteer = 0; rotation = 0;
  camberStatic = 0; toeStatic = 0; camber = 0; camberGround = 0; slipAngle = 0; verticalSpeed = 0;
  xAxis = new Vec3(1, 0, 0); yAxis = new Vec3(0, 1, 0);
  driveTorque = 0; brakeTorque = 0; fyCamber = 0; fMax = 0; invFMax = 1;
  fxImposed = 0; fyImposed = 0; fxCircle = 0; fyCircle = 0; fx = 0; fy = 0; circleExceeded = false;
  gripFromPressure = 1; slipFromPressure = 1; pressure = 0; oversteerFy = 0; oversteerSlip = 0;
  speed = new Vec3();           // +0x170
  center = new Vec3();          // +0x80 wheel centre (world)
  torsor = new Torsor();        // +0x20
  plane: RoadPlane = { n: new Vec3(0, 0, 1), z: 0, material: 1, tri: -1 };
  hasPlane = false; lastContactX = 0; lastContactY = 0;
  temperature = 0; wear = 0; dirt = 0;
  tire!: TireType;
  shock = new ShockAbsorber();
  brake = new Brake();
  constructor(readonly id: number, readonly helps: Helps) { this.rear = (id & 1) !== 0; this.right = (id & 2) !== 0; }   // NOTE: 'right' = flag bit 2 as in the original code; geometrically those wheels sit at +y, which is the LEFT side (right-handed, x forward, z up)

  /** PART_Wheel::vInit + F1MC_Wheel::vInit */
  init(s: Setup, cat: TyreCatalog, tire: TireType): void {
    this.tire = tire;
    const wb = s.f(this.rear ? 'chassis.geometrie.rear_wheel_base' : 'chassis.geometrie.front_wheel_base');
    let ht = s.f(this.rear ? 'chassis.geometrie.rear_half_track' : 'chassis.geometrie.front_half_track');
    if (!this.right) ht = -ht;
    this.local.set(wb, ht, 0);
    this.camberStatic = DEG * s.vec('chassis.cinematic.wheel_static_camber')[this.id];
    this.toeStatic = DEG * s.vec('chassis.cinematic.wheel_static_toe')[this.id];
    this.oversteerFy = s.f('chassis.wheels.oversteer_Fy_multiplier');
    this.oversteerSlip = s.f('chassis.wheels.oversteer_Fy_slip_multiplier');
    this.mass = this.rear ? cat.rearWheelMass : cat.frontWheelMass; this.weight = G * this.mass;
    this.inertia = this.rear ? cat.inertiaRearY : cat.inertiaFrontY;
    this.radius = this.rear ? cat.rearWheelRadius : cat.frontWheelRadius; this.invRadius = 1 / this.radius;
    this.temperature = cat.initialTemperature;
    this.setPressure(s.vec('chassis.wheels.pressure')[this.id]);
    this.shock.init(s, this.rear);
    this.brake.init(s, this.rear, this.radius);
  }
  /** vSetPressure */
  setPressure(p: number): void { this.pressure = p; this.gripFromPressure = this.tire.gripFromPressure.at(p); this.slipFromPressure = this.tire.slipFromPressure.at(p); }
  /** F1MC_F1Car::vSetRestRideHeight (per wheel): rest z = radius - CG height - ride height */
  setRestRideHeight(cgHeight: number, rideHeight: number): void {
    this.restZ = this.radius - cgHeight - rideHeight; this.local.z = this.restZ;
    this.shock.setRestPosition(this.restZ); this.shock.setRideHeight(rideHeight);
  }
  /** vSetSteeringAngle(angle): front wheels add toe (static + from travel), sign by side */
  setSteeringAngle(a: number): void {
    if (!this.rear) {
      const toe = this.toeStatic + this.tire.toe.at(this.restZ - this.local.z);
      this.steer = this.local.y < 0 ? a - toe : a + toe;
    } else this.steer = a;
    this.cosSteer = Math.cos(this.steer); this.sinSteer = Math.sin(this.steer);
  }
  /** vComputeWheelPosition: wheel centre from the road plane under the wheel, limited by the shock travel */
  computePosition(st: PhysicalState, road: RoadMesh): void {
    const up = st.R.axis(2);
    const w = st.R.mulVec(new Vec3(this.local.x, this.local.y, this.restZ)).add(st.pos);     // wheel xy from the rigid attachment at rest
    // F1CL_CollidingSphere keeps its last triangle when the 2D search fails (edge of the collision mesh): reuse the last plane
    const found = road.planeAt(w.x, w.y, w.z, this.plane);
    if (!found && !this.hasPlane) { const z = { v: this.restZ }; this.touching = this.shock.limitPosition(z); this.local.z = z.v; this.center.copy(w); return; }
    if (found) this.hasPlane = true;
    else this.plane.z = this.plane.z + (this.plane.n.x * (this.lastContactX - w.x) + this.plane.n.y * (this.lastContactY - w.y)) / this.plane.n.z;   // extend the last plane
    this.lastContactX = w.x; this.lastContactY = w.y;
    // contact point on the plane under the wheel, wheel centre = contact + up·radius
    this.center.set(w.x, w.y, this.plane.z).addScaled(up, this.radius);
    const loc = st.R.mulTransposedVec(Vec3.sub(this.center, st.pos));
    const z = { v: loc.z };
    this.touching = this.shock.limitPosition(z);
    this.local.z = z.v;
    if (!this.touching || z.v !== loc.z) this.center.copy(st.R.mulVec(new Vec3(this.local.x, this.local.y, this.local.z)).add(st.pos));
  }
  /** vComputeWheelSpeed: speed of the wheel centre, vertical (suspension) component removed along the car's up axis */
  computeSpeed(st: PhysicalState): void {
    if (!this.touching) { this.speed.copy(st.v); this.verticalSpeed = 0; return; }
    st.speedAtPoint(this.center, this.speed);
    const up = st.R.axis(2), n = this.plane.n, d = up.dot(n);
    this.verticalSpeed = d === 0 ? 0 : this.speed.dot(n) / -d;
    this.speed.addScaled(up, this.verticalSpeed);
  }
  /** vComputeZForce: vertical force on the chassis (car frame z), spring/damper when touching */
  computeZForce(st: PhysicalState): void {
    const wz = -this.weight * st.R.m[8];     // wheel weight along the car's up axis
    if (!this.touching) {
      this.torsor.force.set(0, 0, wz * 4); this.torsor.point.copy(this.local); this.torsor.pointIsRelative = true;
    } else {
      const f = this.shock.computeForce(this.verticalSpeed, this.local.z);
      this.torsor.force.set(0, 0, wz - f);
      this.torsor.point.copy(Vec3.sub(this.center, st.pos)); this.torsor.pointIsRelative = false;  // application point: contact, world-relative
    }
  }
  /** vComputeBrakeTorque(brakeCmd) */
  computeBrakeTorque(cmd: number): void { this.brakeTorque = this.brake.torque * cmd; if (this.omega > 0) this.brakeTorque = -this.brakeTorque; }
  /** bComputeIsTorqueActive(neutral) */
  isTorqueActive(neutral: boolean): boolean { return Math.abs(this.driveTorque) >= Math.abs(this.brakeTorque) && neutral !== this.driveTorque > 0; }
  /** F1MC_Wheel::vUpdateGripCoef: tarmac-like surfaces use temperature/wear grip, grass/sand use the material adhesion */
  updateGripCoef(mats: RoadMaterial[], wetness: number): void {
    if (!this.hasPlane || !this.touching) { this.gripCoef = 0; return; }
    const m = mats[this.plane.material] ?? mats[1];
    if (this.plane.material < 6) this.gripCoef = this.gripFromRainWear(wetness);
    else this.gripCoef = wetness * m.wetAdhesion + (1 - wetness) * m.dryAdhesion;
  }
  /** F1MC_Wheel::fComputeGripFromRainWear — dry case: grip from wear (0..1) with temperature window. TODO(verify against decomp) */
  private gripFromRainWear(wetness: number): number {
    const t = this.tire;
    const wearGrip = t.gripAtWear0 + (t.gripAtWear100 - t.gripAtWear0) * Math.min(1, this.wear);
    let tempGrip: number;
    if (this.temperature < t.minOptTemp) tempGrip = t.gripAt0 + (t.gripAtMax - t.gripAt0) * (this.temperature / t.minOptTemp);
    else if (this.temperature <= t.maxOptTemp) tempGrip = t.gripAtMax;
    else tempGrip = t.gripAtMax - (t.gripAtMax - t.gripAt0) * Math.min(1, (this.temperature - t.maxOptTemp) / (t.maxTemp - t.maxOptTemp));
    const dry = wearGrip * tempGrip;
    return wetness > 0 ? dry * (1 - wetness) + t.gripOnWet * wetness : dry;
  }
  /** vComputeSlipAngle(|v|, vx, vy): piecewise asin of vy/|v|, large angles via vx */
  computeSlipAngle(vn: number, vx: number, vy: number): void {
    let r = vn > 1e-5 ? vy / vn : 0; const a = Math.abs(r);
    if (r >= 1) this.slipAngle = SIN_TABLE_PI_2;
    else if (r <= -1) this.slipAngle = -SIN_TABLE_PI_2;
    else if (a < 0.17453) this.slipAngle = r;
    else if (a < 0.5) this.slipAngle = r * (0.166667 * r * r + 1);
    else {
      let c = Math.abs(vx / vn);
      if (c < 0.17453) { const v = Math.abs(SIN_TABLE_PI_2 - c); this.slipAngle = r >= 0 ? v : -v; }
      else if (c < 0.5) { const v = Math.abs(SIN_TABLE_PI_2 - c * (0.166667 * c * c + 1)); this.slipAngle = r >= 0 ? v : -v; }
      else { let f = a / (c + 1); const f2 = f * f; f = f * (0.2 * f2 * f2 + (1 - 0.333333 * f2)); if (r < 0) f = -f; this.slipAngle = f * 2; }
    }
  }
  /** vComputeForceImposedY(fzFactor, limiter, vy, simplified) */
  computeForceImposedY(fzFactor: number, limiter: number, vy: number, simplified: boolean): void {
    const useRaw = simplified || this.rear;
    let slip = this.slipFromPressure * Math.abs(this.slipAngle), grip: number;
    if (!useRaw) { slip /= this.oversteerSlip * this.gripCoef + (1 - this.oversteerSlip); grip = this.gripCoef * (1 - this.oversteerFy) + this.oversteerFy; }
    else grip = this.gripCoef;
    const scale = fzFactor * this.gripFromPressure * grip;
    let fy = this.tire.fyCurve.at(slip); if (this.slipAngle >= 0) fy = -fy;
    const camberGround = asinTable(this.plane.n.dot(this.yAxis));
    this.camber = this.camberStatic + this.tire.camber.at(this.restZ - this.local.z);
    this.camberGround = !this.right ? camberGround + this.camber : this.camber - camberGround;   // flags < 2 = left side
    this.fyCamber = this.tire.camberForce.at(!this.right ? -this.camberGround : this.camberGround);
    let f = scale * (fy + this.fyCamber);
    this.fMax = scale * (this.tire.fy0Max + Math.abs(this.fyCamber)); this.invFMax = this.fMax === 0 ? 1 : 1 / this.fMax;
    const lim = limiter * this.radius * Math.abs(vy);
    if (lim < Math.abs(f)) f = this.slipAngle >= 0 ? -lim : lim;
    this.fyImposed = f;
  }
  /** vComputeForceImposedX(torque) */
  computeForceImposedX(torque: number): void {
    if (!this.sliding) { this.fxImposed = torque * this.invRadius; return; }
    let r = this.fMax === 0 ? 1 : (this.fyImposed * this.invFMax) ** 2;
    const avail = r >= 1 ? 0 : this.fMax * Math.sqrt(1 - r);
    let f = Math.abs(torque) * this.invRadius; if (f <= avail) f = avail;
    if (this.deltaOmega < 0) f = -f;
    this.fxImposed = f;
  }
  /** vApplyCircleCouplingConstraint(simplified, torqueActive): friction circle */
  applyCircleCoupling(fyReducer: number, simplified: boolean, torqueActive: boolean): void {
    const fx2 = this.fxImposed ** 2, fy2 = this.fyImposed ** 2, fm2 = this.fMax ** 2;
    this.circleExceeded = fm2 < fx2 + fy2;
    if (!this.circleExceeded) { this.fxCircle = this.fxImposed; this.fyCircle = this.fyImposed; return; }
    if (simplified) { const fx = fm2 - fy2 > 0 ? Math.sqrt(fm2 - fy2) : 0; this.fxCircle = this.fxImposed > 0 ? fx : -fx; this.fyCircle = this.fyImposed; return; }
    if (torqueActive) {
      const fy = (1 - this.helps.abs * fyReducer) * this.fyImposed;    // original indexes CMD_Helps[1]
      if (fm2 < fx2 + fy * fy) { const d = fm2 - fy * fy, fx = d > 0 ? Math.sqrt(d) : 0; this.fxCircle = this.fxImposed > 0 ? fx : -fx; this.fyCircle = fy; }
      else { const d = fm2 - fx2, f = d > 0 ? Math.sqrt(d) : 0; this.fxCircle = this.fxImposed; this.fyCircle = this.fyImposed > 0 ? f : -f; }
      return;
    }
    let fx = Math.abs(this.fxImposed) > this.fMax ? (this.fxImposed > 0 ? this.fMax : -this.fMax) : this.fxImposed;
    const den = fy2 + fx * fx, k = den === 0 ? 0 : Math.sqrt(fm2 / den);
    this.fxCircle = fx * k; this.fyCircle = this.fyImposed * k;
  }
  /** vDoesSlidingStart(freeRollOmega) */
  doesSlidingStart(freeRoll: number): void { if (!this.sliding && this.circleExceeded) { this.slidingCoef = 0; this.sliding = true; this.deltaOmega = 0; this.omega = freeRoll; } }
  /** vComputeSlidingCoef(freeRollOmega): 1 - ω_free/ω (wheel spin/lock ratio), clamped to 1 */
  computeSlidingCoef(freeRoll: number): void {
    if (!this.sliding) { this.slidingCoef = 0; return; }
    if (this.omega - freeRoll === 0 || Math.abs(freeRoll) < 1e-5) this.slidingCoef = 0;
    else if (Math.abs(this.omega) <= 0.1 || (freeRoll < 0) === (this.omega < 0)) this.slidingCoef = 1 - this.omega / freeRoll;
    else this.slidingCoef = -Math.abs(this.omega - freeRoll) / 0.1;
    if (this.slidingCoef > 1) this.slidingCoef = 1;
  }
  /** vComputeRotationSpeed(dt, freeRoll, torque, torqueActive, reducer) */
  computeRotationSpeed(dt: number, freeRoll: number, torque: number, torqueActive: boolean, reducerDefault: number): void {
    if (!this.touching) {
      this.slidingCoef = 0; this.sliding = false;
      let w = this.omega + dt * torque / this.inertia;
      if (!torqueActive) { if (this.omega < 0) { if (w > 0) w = -1e-5; } else if (w < 0) w = 1e-5; }
      this.omega = w; this.deltaOmega = 0; return;
    }
    if (!this.sliding) { this.omega = freeRoll; return; }
    const fxR = this.fxCircle * this.radius;
    if (Math.abs(torque) < Math.abs(fxR)) torqueActive = true;
    let ex = this.radius * (Math.hypot(this.fyImposed, this.fxImposed) - this.fMax);
    if (ex <= 0) ex = torque - fxR; else if (torque - fxR < 0) ex = -ex;
    const prev = this.deltaOmega, dw = dt * ex / this.inertia;
    let red = reducerDefault;
    if (dw > 0 === prev > 0) red = torqueActive ? this.helps.tractionControl : this.helps.abs;
    let nd = red * dw + prev;
    if (!torqueActive) { if (this.omega < 0) { if (nd + freeRoll > 0) nd = -freeRoll - 1e-5; } else if (nd + freeRoll < 0) nd = 1e-5 - freeRoll; }
    if (this.sliding && !this.circleExceeded && prev !== 0 && (prev > 0) !== (nd > 0)) { this.slidingCoef = 0; this.sliding = false; }
    if (!this.sliding) { this.deltaOmega = 0; this.omega = freeRoll; } else { this.deltaOmega = nd; this.omega = nd + freeRoll; }
  }
  /** vUpdateRotationAngle(dt) */
  updateRotationAngle(dt: number): void { this.rotation = (this.rotation + dt * this.omega) % (2 * Math.PI); if (this.rotation < 0) this.rotation += 2 * Math.PI; }

  /**
   * vComputeXYForce(dt, rollingResistance, fzFactor, brakeCmd, limiter, st, torqueActive, simplified):
   * tyre forces in the car frame written to torsor.force.x/y (z was set by computeZForce).
   */
  computeXYForce(dt: number, rollingRes: number, fzFactor: number, brakeCmd: number, limiter: number, st: PhysicalState, torqueActive: boolean, simplified: boolean, fyReducer: number, deltaReducer: number): void {
    const torque = this.brakeTorque + this.driveTorque;
    if (!this.touching) {
      this.fMax = 0; this.computeRotationSpeed(dt, 0, torque, torqueActive, deltaReducer);
      this.torsor.force.x = 0; this.torsor.force.y = 0; return;
    }
    st.R.mulVec(new Vec3(this.cosSteer, this.sinSteer, 0), this.xAxis);
    st.R.mulVec(new Vec3(-this.sinSteer, this.cosSteer, 0), this.yAxis);
    const vx = this.speed.dot(this.xAxis), vy = this.speed.dot(this.yAxis), vn = this.speed.norm();
    const freeRoll = vx * this.invRadius;
    this.computeSlipAngle(vn, vx, vy);
    this.computeForceImposedY(fzFactor, limiter, vy, simplified);
    this.computeForceImposedX(torque);
    this.applyCircleCoupling(fyReducer, simplified, torqueActive);
    this.doesSlidingStart(freeRoll);
    this.computeRotationSpeed(dt, freeRoll, torque, torqueActive, deltaReducer);
    let limitedByX = true;
    if (!this.sliding) {
      this.fy = this.fyCircle;
      const rr = rollingRes * this.tire.rollingResistance.at(Math.abs(vx));
      this.fx = vx > 0 ? this.fxCircle - rr : this.fxCircle + rr;
      if (torqueActive && rr < Math.abs(this.fxCircle)) limitedByX = false;
    } else {
      this.computeSlidingCoef(freeRoll);
      this.fx = this.fxCircle * this.tire.coefFx.at(this.slidingCoef);
      this.fy = this.fyCircle * this.tire.coefFy.at(this.slidingCoef);
      limitedByX = !torqueActive;
    }
    if (limitedByX) { const lim = limiter * this.radius * Math.abs(vx); if (lim < Math.abs(this.fx)) this.fx = this.fx > 0 ? lim : -lim; else limitedByX = false; }
    this.torsor.force.x = this.fx * this.cosSteer - this.fy * this.sinSteer;
    this.torsor.force.y = this.fy * this.cosSteer + this.fx * this.sinSteer;
    // end of vComputeXYForce: a braked wheel that exceeds the friction circle (and is not torque-driven) pushes straight back with
    // the full available grip, opposite to its rolling direction. Without this the slip-ratio sign can turn braking into thrust.
    if ((simplified || (this.helps.abs === 0 && this.helps.tractionControl === 0)) && this.circleExceeded && brakeCmd > 0.01 && !torqueActive && !limitedByX)
      this.torsor.force.x = vx >= 0 ? -this.fMax : this.fMax;
  }
}
