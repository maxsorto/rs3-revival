// PART_Engine + F1MC_Engine port (vInit @001dd340, vUpdate @001dd570 / @001d0150, vUpdateIfUnclutched @001dd770, vSetRotationSpeed @001d0a30).
// Fields: +4 braking torque (from engine_braking_curve at ω), +8 full-throttle torque, +0xc minimum torque, +0x10 ω (rad/s),
// +0x14 output torque, +0x18 inertia, +0x1c max ω, +0x20 cut coef, +0x24 stalled flag, +0x28 min total torque, +0x2c full throttle curve, +0x30 braking curve
import { Setup, RPM } from '../data/setup';
import { Curve } from '../mth/curve';
export class Engine {
  brakingTorque = 0; fullTorque = 0; minimumTorque = 0; omega = 0; torque = 0; inertia = 0; maxOmega = 0; cutCoef = 0; stalled = false; minTotalTorque = 0;
  fullThrottle!: Curve; braking!: Curve;
  init(s: Setup): void {
    const rpmDomain = (c: Curve) => new Curve(c.xmin * RPM, c.xmax * RPM, c.y);
    this.braking = rpmDomain(s.curve('propulsion.engine.engine_braking_curve'));
    this.minTotalTorque = s.f('propulsion.engine.min_total_torque');
    this.minimumTorque = s.f('propulsion.engine.minimum_torque');
    for (let i = 0; i < this.braking.y.length; i++) this.braking.y[i] += -this.minimumTorque;   // __apl(-minimum_torque)
    this.fullThrottle = rpmDomain(s.curve('propulsion.engine.full_throttle_curve'));
    this.maxOmega = RPM * s.f('propulsion.engine.max_rotation_speed');
    this.cutCoef = s.f('propulsion.engine.cut_coef');
    this.inertia = s.f('propulsion.engine.inertia');
  }
  /** PART_Engine::vUpdate(throttle): output torque from the two curves; rev limiter cuts to -braking*cutCoef above max ω */
  update(throttle: number): void {
    if (this.stalled) { this.brakingTorque = 0; this.fullTorque = 0; this.torque = 0; this.omega = 0; return; }
    this.brakingTorque = this.braking.at(this.omega);
    this.fullTorque = this.fullThrottle.at(this.omega);
    this.torque = this.omega > this.maxOmega ? -this.brakingTorque * this.cutCoef : throttle * (this.fullTorque + this.brakingTorque) - this.brakingTorque;
    if (this.torque < this.minTotalTorque) this.torque = this.minTotalTorque;
  }
  /** PART_Engine::vUpdateIfUnclutched(throttle, dt): free-revving engine, ω += τ/I·dt, capped at max ω */
  updateIfUnclutched(throttle: number, dt: number): void {
    this.update(throttle);
    this.setRotationSpeed(this.omega + dt * this.torque / this.inertia);
    if (this.omega > this.maxOmega) this.omega = this.maxOmega;
  }
  /** F1MC_Engine::vSetRotationSpeed (damage/stall events omitted): clamp at zero */
  setRotationSpeed(w: number): void { this.omega = w < 0 ? 0 : w; }
}
