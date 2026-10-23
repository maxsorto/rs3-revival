// PART_ShockAbsorber port (vInit @001de3c0, fComputeForce @001de9e0, bLimitPosition @001de970, vSetRestPosition @001deb30,
// vSetRideHeight @001deae0, vSetBumpLength @001deac0).
// Geometry (chassis frame, z up): restPos (+0x34) = wheel-centre height at full extension; maxPos (+0x30) = restPos + min(rideHeight, maxTravel)
// = full compression. Compression x = z - restPos ≥ 0. Bump stop engages when x > maxTravel - bumpLength (+0x28).
// Damper: two-slope bounce (vz > 0) and rebound (vz < 0) characteristics built from the (velocity, force) pairs of the setup.
import { Setup } from '../data/setup';
export class ShockAbsorber {
  bounceSlope0 = 0; bounceSlope1 = 0; reboundSlope0 = 0; reboundSlope1 = 0; bounceV0 = 0; reboundV0 = 0; bounceC = 0; reboundC = 0;
  springStiffness = 0; bumpStiffness = 0; bumpThreshold = 0; maxTravel = 0; bumpLength = 0;
  restPos = 0; maxPos = 0; rideHeight = 0; rideHeightLimited = false; lastCompression = 0;
  init(s: Setup, rear: boolean): void {
    const p = rear ? 'rear' : 'front', d = `chassis.suspension.damper.${p}_damper_`;
    this.maxTravel = s.f(`chassis.suspension.spring.${p}_spring_max_travel`);
    this.springStiffness = s.f(`chassis.suspension.spring.${p}_spring_stiffness`);
    this.setBumpLength(s.f(`chassis.suspension.bump_stop.${p}_bump_length`));
    this.bumpStiffness = s.f(`chassis.suspension.bump_stop.${p}_bump_stiffness`);
    this.bounceV0 = s.f(d + 'bounce_velocity_0'); const bf0 = s.f(d + 'bounce_force_0');
    this.bounceSlope0 = -bf0 / this.bounceV0;
    this.reboundV0 = s.f(d + 'rebound_velocity_0'); const rf0 = s.f(d + 'rebound_force_0');
    this.reboundSlope0 = -rf0 / this.reboundV0;
    const bv1 = s.f(d + 'bounce_velocity_1'), bf1 = s.f(d + 'bounce_force_1');
    this.bounceSlope1 = -(bf1 - bf0) / (bv1 - this.bounceV0); this.bounceC = bf0 + this.bounceV0 * this.bounceSlope1;
    const rv1 = s.f(d + 'rebound_velocity_1'), rf1 = s.f(d + 'rebound_force_1');
    this.reboundSlope1 = -(rf1 - rf0) / (rv1 - this.reboundV0); this.reboundC = rf0 + this.reboundV0 * this.reboundSlope1;
  }
  setBumpLength(l: number): void { this.bumpLength = l; this.bumpThreshold = this.maxTravel - l; }
  /** vSetRestPosition(z): full-extension height; recompute the compression limit from the ride height */
  setRestPosition(z: number): void { this.restPos = z; this.applyRideHeight(); }
  /** vSetRideHeight(h): compression available = min(h, maxTravel) */
  setRideHeight(h: number): void { this.rideHeight = h; this.applyRideHeight(); }
  private applyRideHeight(): void { this.rideHeightLimited = this.rideHeight < this.maxTravel; this.maxPos = this.restPos + Math.min(this.rideHeight, this.maxTravel); }
  /** bLimitPosition: clamp z to [restPos, maxPos]; returns "touching ground" (false when the wheel would hang below full extension) */
  limitPosition(z: { v: number }): boolean {
    this.lastCompression = z.v - this.maxPos;
    if (z.v <= this.restPos) { z.v = this.restPos; return false; }
    if (this.lastCompression > 0) z.v = this.maxPos;
    return true;
  }
  /** fComputeForce(vz, z): spring + bump stop + damper. Negative = pushes the wheel down (i.e. the chassis is pushed up by -F). */
  computeForce(vz: number, z: number): number {
    const x = z - this.restPos;
    let f = -x * this.springStiffness;
    if (x > this.bumpThreshold) f -= this.bumpStiffness * (x - this.bumpThreshold);
    if (vz > 0) f += vz < this.bounceV0 ? -vz * this.bounceSlope0 : (this.bounceC - vz * this.bounceSlope1);
    else f += vz > this.reboundV0 ? -vz * this.reboundSlope0 : (this.reboundC - vz * this.reboundSlope1);
    return f;
  }
}
