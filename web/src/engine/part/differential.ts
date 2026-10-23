// F1MC_TorqueTransfertDifferential port (vInit @001d2fe0, vDistributeTorque @001d3290). 5 settings; selected by "setting".
import { Setup, RPM } from '../data/setup';
export class Differential {
  noDiffRotSpeed = 0; setting = 0; begin: number[] = []; max: number[] = []; maxCoef: number[] = []; minSliding: number[] = [];
  init(s: Setup): void {
    this.noDiffRotSpeed = RPM * s.f('propulsion.differential.no_differential_rot_speed');
    this.setting = s.i('propulsion.differential.setting');
    this.begin = s.vec('propulsion.differential.begin_transfert_rot_speed').map(v => v * RPM);
    this.max = s.vec('propulsion.differential.max_transfert_rot_speed').map(v => v * RPM);
    this.maxCoef = s.vec('propulsion.differential.max_transfert_coef');
    this.minSliding = s.vec('propulsion.differential.min_sliding_transfert');
  }
  /** fGatherRotationSpeeds */
  gather(wl: number, wr: number): number { return (wl + wr) * 0.5; }
  /**
   * vDistributeTorque(torque, ωL, ωR, throttle): returns [torqueL, torqueR].
   * Below the no-diff threshold or under engine braking: 50/50. Otherwise transfers a share (ramp between begin/max) to the slower wheel.
   * The "wheel at friction limit" branch of the original (uses Fmax·radius of the wheel) is simplified to the ramp. TODO(verify)
   */
  distribute(torque: number, wl: number, wr: number, throttle: number): [number, number] {
    const d = wl - wr, half = torque * 0.5, ad = Math.abs(d), k = this.setting;
    if (ad < this.noDiffRotSpeed || torque < 0) return [half, half];
    if (throttle < 0.01) return [-Math.abs(half), -Math.abs(half)];
    let coef = 0;
    if (ad - this.begin[k] >= 0) coef = ad > this.max[k] ? this.maxCoef[k] : (this.maxCoef[k] / (this.max[k] - this.begin[k])) * (ad - this.begin[k]);
    return d > 0 ? [half * (1 - coef), half * (1 + coef)] : [half * (1 + coef), half * (1 - coef)];
  }
}
