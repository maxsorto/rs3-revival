// F1MC_F1Car port: vMove @001c7c10 (full-simulation mode 0), vInit @001c67d0, vComputeWheelZForces @001cb680,
// vComputeWheelXYForces @001cb820, vAddReactionForceInSlope @001cba60, vDistributeEngineTorque @001cbbc0, vApplyCommands @001cbf00,
// vUpdateAeroForces @001cc090, vEnsureCarIsAboveGround @001cc290, vSetSpeedState @001cd560, vSetRestRideHeight @001cd370.
// Car frame: x forward, y left, z up. CoG at the origin.
import { Vec3 } from '../mth/vec3';
import { Mat3 } from '../mth/mat3';
import { PhysicalSolid, Torsor } from '../mec/solid';
import { Setup, DEG, G } from '../data/setup';
import { Catalog } from '../data/catalog';
import { Wheel, type Helps } from '../part/wheel';
import { Engine } from '../part/engine';
import { GearBox, Clutch, AutomaticGearBox, NextGear } from '../part/gearbox';
import { Differential } from '../part/differential';
import { Wing, Body } from '../part/aero';
import { RoadMesh } from '../road';
import type { Compound } from '../part/tiretype';
import { CollisionModel, type WallMaterial } from '../f1cl/collision';

export interface Commands { steering: number; throttle: number; brake: number; nextGear: NextGear }   // CMD_CarCommands: +4 steer (rad), +8 brake, +0xc throttle, +0x10 gear cmd

export class F1Car extends PhysicalSolid {
  wheels: Wheel[] = [];
  engine = new Engine(); gearbox = new GearBox(); clutch = new Clutch(); autoBox = new AutomaticGearBox(); diff = new Differential();
  wings: Wing[] = []; body = new Body(); frontWing!: Wing; rearWing!: Wing;
  cgHeight = 0; rhoAir = 0; maxSteering = 0; antiRollFront = 0; antiRollRear = 0;
  maxSpeed = 0;                  // +0x2b4: tyre.max_car_speed
  cmd: Commands = { steering: 0, throttle: 0, brake: 0, nextGear: NextGear.None };
  helps: Helps = { tractionControl: 0, abs: 0 };
  gravity = new Vec3(0, 0, -G);
  wetness = 0;
  torsors: Torsor[] = [];
  gravityTorsor = new Torsor();
  aeroTorsors: Torsor[] = [];
  simplified = false;
  collision = new CollisionModel(); wallMaterials: WallMaterial[] = [];

  constructor(readonly setup: Setup, readonly catalog: Catalog, compound: Compound = 'soft') {
    super();
    for (let i = 0; i < 4; i++) this.wheels.push(new Wheel(i, this.helps));
    this.init(compound);
  }
  /** F1MC_F1Car::vInit (subset: no damage model, no replay, no force feedback) */
  private init(compound: Compound): void {
    const s = this.setup;
    this.setMass(s.f('chassis.geometrie.mass'));
    const I = new Mat3(); I.setDiagonal(s.f('chassis.geometrie.Jx'), s.f('chassis.geometrie.Jy'), s.f('chassis.geometrie.Jz'));
    const jyz = s.f('chassis.geometrie.Jyz'); I.m[5] = jyz; I.m[7] = jyz;
    this.setLocalInertia(I);
    this.cgHeight = s.f('chassis.geometrie.CG_height');
    const frontRide = s.f('chassis.suspension.front_ride_height'), rearRide = s.f('chassis.suspension.rear_ride_height');
    for (const w of this.wheels) w.init(s, this.catalog.tyres, this.catalog.tyres.get(compound, w.rear));
    for (const w of this.wheels) w.setRestRideHeight(this.cgHeight, w.rear ? rearRide : frontRide);
    this.engine.init(s); this.gearbox.init(s); this.clutch.init(s); this.autoBox.init(s, this.gearbox); this.diff.init(s);
    this.gearbox.onNewGear = g => this.newGear(g);
    this.antiRollFront = s.f('chassis.suspension.roll_bar.front_antirollbar_stiffness');
    this.antiRollRear = s.f('chassis.suspension.roll_bar.rear_antirollbar_stiffness');
    this.rhoAir = s.f('chassis.aerodynamism.rho_air');
    for (const name of ['front_wing_slow', 'front_wing_medium', 'front_wing_fast', 'rear_wing_slow', 'rear_wing_medium', 'rear_wing_fast']) { const w = new Wing(); w.init(s, name, this.rhoAir); this.wings.push(w); }
    this.body.init(s, this.rhoAir);
    const typeF = s.i('chassis.aerodynamism.wing_setting.type_front'), typeR = s.i('chassis.aerodynamism.wing_setting.type_rear');
    this.frontWing = this.wings[typeF]; this.rearWing = this.wings[3 + typeR];
    this.frontWing.setIncidence(s.f('chassis.aerodynamism.wing_setting.front_x_incidence'));
    this.rearWing.setIncidence(s.f('chassis.aerodynamism.wing_setting.rear_x_incidence'));
    this.maxSteering = DEG * s.f('Commands.Steering.Max_Steering');
    this.collision.init(s, this.catalog.tyres.frontWheelRadius, this.catalog.tyres.rearWheelRadius);
    const c = this.catalog.common;
    this.wallMaterials = ['concrete', 'tire', 'rail'].map(n => ({ rebound: c.f(`material.wall.${n}.rebound`), friction: c.f(`material.wall.${n}.friction`) }));
    this.maxSpeed = this.catalog.tyres.maxCarSpeed;
    this.gravityTorsor.force.copy(this.gravity).scale(this.mass); this.gravityTorsor.point.set(0, 0, 0);
    this.aeroTorsors = [new Torsor(), new Torsor(), new Torsor()];
    this.torsors = [this.gravityTorsor, ...this.wheels.map(w => w.torsor), ...this.aeroTorsors];
  }

  /** vInitWithPositionAndSpeed + vSetSpeedState: place on the track, wheels rolling, gear chosen for the speed */
  place(pos: Vec3, dir: Vec3, speed: number): void {
    this.initWithPositionAndSpeed(pos, dir, speed);
    for (const w of this.wheels) { w.omega = speed / w.radius; w.deltaOmega = 0; w.slidingCoef = 0; w.sliding = false; }
    let gear = GearBox.NEUTRAL;
    if (speed !== 0) { gear = 1; let we = this.wheels[1].omega * this.gearbox.ratios[1]; while (gear < this.gearbox.nbGears && this.autoBox.up[gear] < we) { gear++; we = this.wheels[1].omega * this.gearbox.ratios[gear]; } }
    this.clutch.state = 0; this.gearbox.setGear(gear); this.newGear(gear); this.cmd.throttle = 1;
    this.engine.setRotationSpeed(speed === 0 ? 300 : this.wheels[1].omega * this.gearbox.ratio());
    this.clutch.state = this.clutch.deltaOmega <= 10 ? 1 : 2; this.clutch.progress = 10;
  }

  /**
   * F1MC_GearBox::bNewGear(g): refuse a downshift that would over-rev, reverse above walking pace, or leaving neutral with the
   * clutch closed; on success reflect the engine inertia into the rear wheels and set the rev limiter / top speed for the gear.
   */
  newGear(g: number): boolean {
    const gb = this.gearbox, wFree = this.v.dot(this.R.axis(0)) * this.wheels[1].invRadius, cur = gb.gear;
    if (g < cur && g > 0 && cur > 1 && this.engine.maxOmega < wFree * gb.ratios[g]) return false;
    if (g === GearBox.REVERSE && wFree * gb.ratios[0] < -200) return false;
    if (cur === GearBox.NEUTRAL && !this.autoBox.autoClutch && this.clutch.state !== 0) return false;   // with a manual clutch, leaving neutral needs the clutch open
    if (g === 1 && cur === GearBox.NEUTRAL && wFree * gb.ratios[1] < -200) return false;
    gb.setGear(g);
    const ratio = gb.ratio(), jr = ratio * ratio * this.engine.inertia;
    for (const w of [this.wheels[1], this.wheels[3]]) w.inertia = (w.rear ? this.catalog.tyres.inertiaRearY : this.catalog.tyres.inertiaFrontY) + jr;
    if (ratio === 0) { this.limiterOmega = 0; this.maxSpeed = 0; }
    else { const wl = (this.engine.maxOmega - 1) / ratio; this.limiterOmega = 2 * wl; this.maxSpeed = Math.abs(wl) * this.wheels[1].radius; }
    return true;
  }
  limiterOmega = 0;
  /** PART_Limiter::vLimitWheelSpeed(freeRollOmega): keep the sum of the rear wheel speeds under the engine limit */
  limitWheelSpeed(wFree: number): void {
    const lim = this.limiterOmega; if (lim === 0) return;
    const rl = this.wheels[1], rr = this.wheels[3];
    let wl = rl.omega, wr = rr.omega;
    if (wl > 0 && lim < 0 && wFree < 0) wl = 0; else if (wl < 0 && lim > 0 && wFree > 0) wl = 0;
    if (wr > 0 && lim < 0 && wFree < 0) wr = 0; else if (wr < 0 && lim > 0 && wFree > 0) wr = 0;
    if (Math.abs(lim) < Math.abs(wl + wr)) {
      if (!rl.touching && !rr.touching) { wl = wr = lim * 0.5; }
      else if (Math.abs(wr) < Math.abs(wl)) { wl = lim - wr; if (rl.sliding) { if (Math.abs(wl) <= Math.abs(wFree)) { rl.deltaOmega = 0; rl.slidingCoef = 0; rl.sliding = false; } else rl.deltaOmega = wl - wFree; } }
      else { wr = lim - wl; if (rr.sliding) { if (Math.abs(wr) <= Math.abs(wFree)) { rr.deltaOmega = 0; rr.slidingCoef = 0; rr.sliding = false; } else rr.deltaOmega = wr - wFree; } }
    }
    rl.omega = wl; rr.omega = wr;
  }

  /** vApplyCommands: steering to the wheels, automatic gearbox, clutch */
  applyCommands(): void {
    const a = this.cmd.steering;
    this.wheels[2].setSteeringAngle(a); this.wheels[0].setSteeringAngle(a); this.wheels[3].setSteeringAngle(0); this.wheels[1].setSteeringAngle(0);
    // upshifts are blocked while the clutch engages or the rear wheels spin (below 95% of the top speed)
    let blockUpshift = this.clutch.state === 2;
    if (!blockUpshift && this.speedNorm() < 0.95 * this.maxSpeed) blockUpshift = this.wheels[1].sliding || this.wheels[3].sliding;
    this.autoBox.updateGear(this.gearbox, this.engine.omega, this.cmd.nextGear, blockUpshift, false);
    this.cmd.nextGear = NextGear.None;
    // PART_AutomaticGearBox::eUpdateClutch (automatic clutch)
    const w = this.engine.omega;
    if (w >= this.autoBox.goToNeutralOmega) { if (this.clutch.state === 0 && w > this.autoBox.goToFirstOmega) this.clutch.start(w); }
    else this.clutch.state = 0;
  }

  /** vDistributeEngineTorque(dt): engine ↔ clutch ↔ gearbox ↔ differential → rear wheel drive torque */
  distributeEngineTorque(dt: number): void {
    const rl = this.wheels[1], rr = this.wheels[3];
    this.limitWheelSpeed(this.v.dot(this.R.axis(0)) * rl.invRadius);
    const wAxle = this.diff.gather(rl.omega, rr.omega);
    this.gearbox.outputOmega = wAxle;
    const ratio = this.gearbox.ratio();
    const wGear = ratio === 0 ? 0 : wAxle * ratio;
    const wEngine = this.clutch.transformRotationSpeed(wGear);
    if (this.gearbox.gear === GearBox.NEUTRAL || this.clutch.state === 0) {
      this.engine.updateIfUnclutched(this.cmd.throttle, dt);
      rl.driveTorque = 0; rr.driveTorque = 0;
      return;
    }
    this.engine.setRotationSpeed(wEngine);
    this.engine.update(this.cmd.throttle);
    const rearTerm = this.wheels[1].radius * (rl.fxCircle + rr.fxCircle);
    const tq = this.clutch.transformTorque(this.engine.torque, dt, this.gearbox, this.engine.inertia, rearTerm);
    this.gearbox.outputTorque = ratio === 0 ? 0 : tq * ratio;
    const [tl, tr] = this.diff.distribute(this.gearbox.outputTorque, rl.omega, rr.omega, this.cmd.throttle);
    rl.driveTorque = tl; rr.driveTorque = tr;
  }

  /** vComputeWheelZForces: positions, speeds, suspension forces, then anti-roll bars */
  computeWheelZForces(road: RoadMesh): void {
    let touching = 0;
    for (const w of this.wheels) { w.computePosition(this, road); w.computeSpeed(this); w.computeZForce(this); if (w.touching) touching++; }
    if (touching === 1 || touching === 2) for (const w of this.wheels) if (w.touching) { const k = w.shock.springStiffness; w.shock.springStiffness = k * 5; w.computeZForce(this); w.shock.springStiffness = k; }
    for (let axle = 0; axle < 2; axle++) {
      const l = this.wheels[axle], r = this.wheels[axle + 2], k = axle === 0 ? this.antiRollFront : this.antiRollRear;
      const f = -k * (r.local.z - l.local.z);
      l.torsor.force.z += f * (l.local.z - l.restZ);
      r.torsor.force.z -= f * (r.local.z - r.restZ);
    }
  }

  /** vComputeWheelXYForces(dt) */
  computeWheelXYForces(dt: number): void {
    const limiter = 0.15 * this.mass / dt;
    const neutral = this.gearbox.gear === GearBox.NEUTRAL;
    let brake = this.cmd.brake;
    if (this.cmd.throttle === 0) brake += 5.88235e-5 * this.engine.brakingTorque;   // engine braking adds to the brakes when off throttle
    for (const w of this.wheels) {
      w.updateGripCoef(this.catalog.materials, this.wetness);
      w.computeBrakeTorque(brake);
      const active = w.isTorqueActive(neutral);
      const fz = w.tire.coefFz.at(w.torsor.force.z);
      const mat = this.catalog.materials[w.plane.material] ?? this.catalog.materials[1];
      w.computeXYForce(dt, mat.rollingResistance, fz, brake, limiter, this, active, this.simplified, this.catalog.tyres.fyReducer, this.catalog.tyres.deltaRotationSpeedReducer);
    }
  }

  /** vUpdateAeroForces: body + two wings, in the car frame */
  updateAeroForces(): void {
    const air = this.v.clone().scale(-1), xAxis = this.R.axis(0), yAxis = this.R.axis(1);
    this.body.updateTorsor(air, xAxis, yAxis);
    const forms = [this.body, this.frontWing, this.rearWing];
    for (let i = 0; i < 3; i++) {
      const f = forms[i];
      if (i > 0) { const p = this.R.mulVec(f.pos).add(this.pos); const a = this.speedAtPoint(p).scale(-1); f.updateTorsor(a, xAxis, yAxis); }
      this.aeroTorsors[i].force.copy(f.force); this.aeroTorsors[i].point.copy(f.pos); this.aeroTorsors[i].pointIsRelative = true;
    }
  }

  /** vSumTorsors for this car: torsor forces are expressed in the car frame (wheels, aero) except gravity (world) */
  sumCarTorsors(): void {
    this.sumForce.set(0, 0, 0); this.sumTorque.set(0, 0, 0);
    const fw = new Vec3(), r = new Vec3(), t = new Vec3();
    this.sumForce.add(this.gravityTorsor.force);
    for (const ts of this.torsors) {
      if (ts === this.gravityTorsor) continue;
      this.R.mulVec(ts.force, fw);
      this.sumForce.add(fw);
      if (ts.pointIsRelative) this.R.mulVec(ts.point, r); else r.copy(ts.point);
      this.sumTorque.add(t.cross(r, fw));
    }
  }

  /** vAddReactionForceInSlope: below 1 m/s, cancel the gravity component along the car axes (keeps a parked car still on a slope) */
  addReactionForceInSlope(): void {
    const s = this.speedNorm(); if (s >= 1) return;
    const k = -(1 - s), g = this.gravityTorsor.force;
    const x = this.R.axis(0), y = this.R.axis(1);
    const gx = g.dot(x) * k, gy = g.dot(y) * k;
    this.sumForce.addScaled(x, gx).addScaled(y, gy);
  }

  /** vEnsureCarIsAboveGround: if a wheel is over-compressed, lift the car along its up axis */
  ensureCarIsAboveGround(): void {
    let d = 0;
    for (const w of this.wheels) if (w.touching && w.shock.lastCompression > d) d = w.shock.lastCompression;
    if (d > 0) this.pos.addScaled(this.R.axis(2), d);
  }

  /** vMove(dt) — full simulation */
  move(dt: number, road: RoadMesh): void {
    this.computeAnnexData();
    this.applyCommands();
    this.distributeEngineTorque(dt);
    this.computeWheelZForces(road);
    this.computeWheelXYForces(dt);
    this.updateAeroForces();
    this.sumCarTorsors();
    this.addReactionForceInSlope();
    this.fpm(dt, this.sumForce, this.sumTorque);
    if (this.q.x * this.q.x + this.q.y * this.q.y > 0.15) { /* rolled over: original freezes angular motion; kept */ }
    const s = this.speedNorm();
    if (this.maxSpeed > 0 && s > this.maxSpeed) { this.v.scale(this.maxSpeed / s); this.invalidateSpeedNorm(); }
    this.collision.computeCollisionsWithWall(this, road, dt, this.wallMaterials);
    this.ensureCarIsAboveGround();
    for (const w of this.wheels) w.updateRotationAngle(dt);
  }
}
