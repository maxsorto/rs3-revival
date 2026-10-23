// PART_GearBox + PART_AutomaticGearBox + PART_Clutch port.
// GearBox: ratios[0]=reverse, ratios[1..n]=forward (each × diff_ratio); gear index: -1 = NEUTRAL, 0 = REVERSE, 1..n forward
// (PART_GearBox::vGearDown from 1 goes to -1; iGetGear()==-1 means no coupling in vDistributeEngineTorque).
// AutomaticGearBox (vInit @001dc360, vUpdateGear @001dc4b0, vComputeChangeGearRotationSpeeds @001dc9f0): up/down thresholds per gear.
// Clutch (vInit @001dcdc0, fTransformTorque @001dce70, fTransformRotationSpeed @001dd1a0): state 0 = open, 1 = closed, 2 = engaging.
import { Setup, RPM } from '../data/setup';
import { Curve } from '../mth/curve';
export const enum NextGear { Up = 0, Down = 1, None = 2 }
export class GearBox {
  static readonly NEUTRAL = -1; static readonly REVERSE = 0;
  nbGears = 0; ratios: number[] = []; gear = 0; diffRatio = 1; outputOmega = 0; outputTorque = 0;   // +0x14 gear, +4 ω in, +0x1c torque out
  init(s: Setup): void {
    this.nbGears = s.i('propulsion.gearbox.nb_gears'); this.diffRatio = s.f('propulsion.gearbox.diff_ratio');
    const names = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th'];
    this.ratios = new Array(this.nbGears + 1).fill(0);
    this.ratios[0] = this.diffRatio * s.f('propulsion.gearbox.backward_gear');
    for (let g = 1; g <= this.nbGears; g++) this.ratios[g] = this.diffRatio * s.f(`propulsion.gearbox.${names[g - 1]}_gear`);
  }
  /** ratio used for the current gear (index g, with -1 → reverse slot 0, 0 → neutral) */
  ratio(g = this.gear): number { return g === GearBox.NEUTRAL ? 0 : this.ratios[g]; }
  /** PART_GearBox::bNewGear; the F1MC_GearBox checks (over-rev, reverse speed, neutral/clutch) live in F1Car.newGear */
  setGear(g: number): boolean { if (g < -1 || g > this.nbGears) return false; this.gear = g; return true; }
  /** hook so F1MC_GearBox::bNewGear policy can veto/augment a change (set by the car) */
  onNewGear: ((g: number) => boolean) | null = null;
  newGear(g: number): boolean { if (this.onNewGear) return this.onNewGear(g); return this.setGear(g); }
  /** PART_GearBox::vGearUp */
  gearUp(): void { const g = this.gear; if (g === this.nbGears) return; if (g === GearBox.NEUTRAL) this.newGear(1); else if (g === GearBox.REVERSE) this.newGear(GearBox.NEUTRAL); else if (!this.newGear(g + 1)) this.newGear(g + 2); }
  /** PART_GearBox::vGearDown */
  gearDown(): void { const g = this.gear; if (g === GearBox.REVERSE) return; if (g < 2) { this.newGear(g === 1 ? GearBox.NEUTRAL : GearBox.REVERSE); } else if (!this.newGear(g - 1) && this.gear > 2) this.newGear(g - 2); }
}
export class Clutch {
  curve!: Curve; duration = 0; rearWheelsInertia = 0;
  state = 1; progress = 0; inputOmega = 0; torqueOut = 0; deltaOmega = 0; // +8 state, +0x10 progress time, +4 ω, +0xc torque, +0x18 Δω at start
  init(s: Setup): void { this.curve = s.curve('propulsion.clutch.clutch_curve'); this.duration = s.f('propulsion.clutch.clutch_duration'); this.rearWheelsInertia = s.f('propulsion.clutch.clutch_rear_wheels_inertia'); }
  /** PART_Clutch::vStartClutchProcess */
  start(engineOmega: number): void { this.state = 2; this.deltaOmega = engineOmega - this.inputOmega; this.progress = 0; }
  /** PART_Clutch::fTransformRotationSpeed: ω seen by the engine while engaging */
  transformRotationSpeed(w: number): number {
    this.inputOmega = w;
    if (this.state === 1) return w;
    if (this.state === 0) return 0;
    return w + this.deltaOmega * this.curve.at(this.progress / this.duration);
  }
  /**
   * PART_Clutch::fTransformTorque(engineTorque, dt): torque passed to the gearbox.
   * While engaging, blends engine torque with the inertia torque needed to synchronise (uses gearbox ratio, engine inertia, rear wheel feedback).
   */
  transformTorque(engineTorque: number, dt: number, gb: GearBox, engineInertia: number, rearWheelsTorqueTerm: number): number {
    if (this.state === 0) { this.torqueOut = 0; return 0; }
    if (this.state === 1) { this.torqueOut = engineTorque; return engineTorque; }
    const ratio = gb.ratio();
    const jw = this.rearWheelsInertia / (ratio * ratio);                       // wheels inertia seen at the clutch
    const jeq = (jw * engineInertia) / (jw + engineInertia);
    const c0 = this.curve.at(this.progress / this.duration);
    const d0 = this.deltaOmega;
    this.progress += dt; if (gb.gear === 1) this.progress += dt;
    const c1 = this.curve.at(this.progress / this.duration);
    this.torqueOut = jeq * (rearWheelsTorqueTerm / (ratio * jw) + (c0 * d0 - c1 * this.deltaOmega) / dt + engineTorque / engineInertia);
    if (this.progress >= this.duration) this.state = 1;
    return this.torqueOut;
  }
}
export class AutomaticGearBox {
  gearUpOmega = 0; hysteresis = 0; goToFirstOmega = 0; goToNeutralOmega = 0; gear2To1Omega = 0; mode = 0; autoClutch = true;   // +0x34: automatic clutch
  up: number[] = []; down: number[] = [];
  init(s: Setup, gb: GearBox): void {
    this.gearUpOmega = RPM * s.f('propulsion.automatic_gearbox.gear_up_RPM');
    this.hysteresis = s.f('propulsion.automatic_gearbox.histeresis_coef');
    this.goToFirstOmega = RPM * s.f('propulsion.automatic_gearbox.go_to_first_gear_RPM');
    this.goToNeutralOmega = RPM * s.f('propulsion.automatic_gearbox.go_to_neutral_RPM');
    this.gear2To1Omega = RPM * s.f('propulsion.automatic_gearbox.gear2_to_gear1_RPM');
    this.computeChangeGearRotationSpeeds(gb);
  }
  /** vComputeChangeGearRotationSpeeds: up[g] = gear-up ω; down[g] = gearUp × hysteresis × ratio[g] / ratio[g-1] */
  computeChangeGearRotationSpeeds(gb: GearBox): void {
    const n = gb.nbGears; this.up = new Array(n + 1).fill(this.gearUpOmega); this.down = new Array(n + 1).fill(-1e9);
    this.up[0] = 1e9; this.down[0] = -1e9; this.up[1] = this.gearUpOmega; this.down[1] = this.goToNeutralOmega; this.up[2] = this.gearUpOmega; this.down[2] = this.gear2To1Omega;
    for (let g = 3; g <= n; g++) this.down[g] = (this.gearUpOmega * this.hysteresis * gb.ratios[g]) / gb.ratios[g - 1];
  }
  /** vUpdateGear(cmd, carNearSpeedLimit, playerAssist): automatic mode 0/1; mode 2 = manual */
  updateGear(gb: GearBox, engineOmega: number, cmd: NextGear, blockUpshift: boolean, assist: boolean): void {
    if (this.mode === 2) { if (cmd === NextGear.Up) gb.gearUp(); else if (cmd === NextGear.Down) gb.gearDown(); return; }
    if (cmd === NextGear.Down && gb.gear === GearBox.NEUTRAL) gb.newGear(GearBox.REVERSE);
    else if (cmd === NextGear.Up && gb.gear === GearBox.REVERSE) gb.newGear(GearBox.NEUTRAL);
    if (gb.gear === GearBox.REVERSE) return;
    const w = engineOmega;
    if (w < this.goToNeutralOmega) { if (!assist || w < 10) gb.newGear(GearBox.NEUTRAL); return; }
    if (gb.gear === GearBox.NEUTRAL) { if (w > this.goToFirstOmega && (this.mode === 0 || cmd === NextGear.Up)) gb.gearUp(); return; }
    if (w <= this.up[gb.gear] || (this.mode !== 0 && cmd !== NextGear.Up)) { if (w < this.down[gb.gear]) gb.gearDown(); }
    else if (!blockUpshift) gb.gearUp();
  }
}
