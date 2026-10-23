// PART_TireType port. Built by F1MC_Catalog::vInit (@001ce580) from F1Com.bsp ("tyre.*"), 8 types = 4 compounds × {front, rear}.
// Field map of the original object (u32 index): [0x18]=coef_Fz curve (grip factor vs vertical load, N),
// [0x19]=coef_Fx curve, [0x1a]=coef_Fy curve (vs sliding coef in [-4,1]), [0x22]=front_Fy|rear_Fy curve (N vs slip angle, x in deg→rad),
// [0x21]=Fy0Max (vComputeFy0Max), [0x16]=grip_on_wet, [0x1b]=rolling resistance curve (vs speed, km/h→m/s, + shift, rear × rear_front_ratio),
// [0x1e]=camber curve (vs suspension travel), [0x1f]=toe curve, [0x20]=camber_force curve, [0x1c]=grip_from_pressure, [0x1d]=slip_from_pressure,
// [2..5]/[0xb..0x15] temperature & wear parameters.
import { Curve } from '../mth/curve';
import { Setup, DEG } from '../data/setup';

export const COMPOUNDS = ['soft', 'hard', 'intr', 'rain'] as const;
export type Compound = typeof COMPOUNDS[number];

export class TireType {
  coefFz!: Curve; coefFx!: Curve; coefFy!: Curve; fyCurve!: Curve; fy0Max = 0;
  gripOnWet = 0; rollingResistance!: Curve; camber!: Curve; toe!: Curve; camberForce!: Curve;
  gripFromPressure!: Curve; slipFromPressure!: Curve;
  tempRaiseWithSpeed = 0; tempRaiseWithSliping = 0; tempRaiseWithSliding = 0; invThermicInertia = 0;
  minOptTemp = 0; maxOptTemp = 0; maxTemp = 0; gripAt0 = 1; gripAtMax = 1;
  wearRaiseWithSliping = 0; wearRaiseWithSliding = 0; wearCoefMinOpt = 0; wearCoefMaxOpt = 0; wearCoefBusted = 0;
  gripAtWear0 = 1; gripAtWear100 = 1; gripForFlatTire = 1;
  constructor(readonly compound: Compound, readonly rear: boolean) {}

  /** PART_TireType::vComputeFy0Max: maximum of the Fy curve (used as the friction-circle radius before camber) */
  computeFy0Max(): void { let m = 0; for (const y of this.fyCurve.y) if (y > m) m = y; this.fy0Max = m; }
}

/** Static tyre data shared by every car (PART_TireType statics + F1MC_Catalog). */
export class TyreCatalog {
  types = new Map<string, TireType>();
  fyReducer = 0; deltaRotationSpeedReducer = 0; maxCarSpeed = 0; maxTireSlidingCoef = 0;
  minSpeedForCamberTemperature = 0; dirtyingSpeed = 0; cleaningSpeed = 0; totallyWetWearMultiplier = 0;
  rollingResistance!: Curve; rearFrontRatio = 1; rollingResistanceRainFactor = 0;
  frontWheelRadius = 0; rearWheelRadius = 0; frontWheelMass = 0; rearWheelMass = 0; inertiaFrontY = 0; inertiaRearY = 0; initialTemperature = 0;

  constructor(readonly s: Setup) {
    // F1MC_Catalog::vInit, in the original order
    this.rollingResistance = s.curve('tyre.rolling_resistance');
    // x axis is km/h in the file: scale to m/s (×0.277778), done on the curve domain in the original
    this.rollingResistance = new Curve(this.rollingResistance.xmin * 0.277778, this.rollingResistance.xmax * 0.277778, this.rollingResistance.y);
    this.rearFrontRatio = s.f('tyre.rear_front_ratio');
    this.rollingResistanceRainFactor = s.f('tyre.rolling_resistance_rain_factor');
    this.totallyWetWearMultiplier = s.f('tyre.totally_wet_wear_multiplier');
    // camber/toe vs suspension travel: VALUES are degrees → ×DEG (MTH_Curve::operator*=); camber_force and Fy: x-axis is degrees → domain ×DEG
    const camberF = s.curve('tyre.camber_front').scale(DEG), camberR = s.curve('tyre.camber_rear').scale(DEG);
    const camberForceF = degDomain(s.curve('tyre.camber_force_front')), camberForceR = degDomain(s.curve('tyre.camber_force_rear'));
    const toeF = s.curve('tyre.toe_front').scale(DEG), toeR = s.curve('tyre.toe_rear').scale(DEG);
    this.fyReducer = s.f('tyre.fy_reducer');
    this.deltaRotationSpeedReducer = s.f('tyre.delta_rotation_speed_reducer');
    this.maxCarSpeed = s.f('tyre.max_car_speed') / 3.6;
    this.maxTireSlidingCoef = s.f('tyre.max_tire_sliding_coef');
    this.minSpeedForCamberTemperature = s.f('tyre.min_speed_for_camber_temperature');
    const gripFromPressure = s.curve('tyre.pressure.grip_from_pressure'), slipFromPressure = s.curve('tyre.pressure.slip_from_pressure');
    this.dirtyingSpeed = s.f('tyre.dirtiness.wheel_dirtying_speed');
    this.cleaningSpeed = s.f('tyre.dirtiness.wheel_cleaning_speed');
    this.frontWheelRadius = s.f('tyre.wheel_properties.front_wheel_radius'); this.rearWheelRadius = s.f('tyre.wheel_properties.rear_wheel_radius');
    this.frontWheelMass = s.f('tyre.wheel_properties.front_wheel_mass'); this.rearWheelMass = s.f('tyre.wheel_properties.rear_wheel_mass');
    this.inertiaFrontY = s.f('tyre.wheel_properties.inertia_front_y'); this.inertiaRearY = s.f('tyre.wheel_properties.inertia_rear_y');
    this.initialTemperature = s.f('tyre.initial_temperature');
    for (const c of COMPOUNDS) {
      for (const rear of [false, true]) {
        const t = new TireType(c, rear), p = `tyre.${c}_tyre.`;
        t.coefFx = s.curve(p + 'coef_Fx'); t.coefFy = s.curve(p + 'coef_Fy'); t.coefFz = s.curve(p + 'coef_Fz');
        t.fyCurve = degDomain(s.curve(p + (rear ? 'rear_Fy' : 'front_Fy')));
        t.computeFy0Max();
        t.gripOnWet = s.f(p + 'grip_on_wet');
        const rr = new Curve(this.rollingResistance.xmin, this.rollingResistance.xmax, Float32Array.from(this.rollingResistance.y));
        const shift = s.f(p + 'rolling_resistance_shift');
        for (let i = 0; i < rr.y.length; i++) rr.y[i] += shift;        // MTH_Curve::operator+=
        if (rear) rr.scale(this.rearFrontRatio);                         // MTH_Curve::operator*=
        t.rollingResistance = rr;
        t.camber = rear ? camberR : camberF; t.camberForce = rear ? camberForceR : camberForceF; t.toe = rear ? toeR : toeF;
        t.gripFromPressure = gripFromPressure; t.slipFromPressure = slipFromPressure;
        t.tempRaiseWithSpeed = s.f(p + 'temperature.temperature_raise_with_speed') / this.maxCarSpeed;
        t.tempRaiseWithSliping = s.f(p + 'temperature.temperature_raise_with_sliping');
        t.tempRaiseWithSliding = s.f(p + 'temperature.temperature_raise_with_sliding');
        t.invThermicInertia = 1 / s.f(p + 'temperature.thermic_inertia');
        t.minOptTemp = s.f(p + 'temperature.min_opt_temperature'); t.maxOptTemp = s.f(p + 'temperature.max_opt_temperature'); t.maxTemp = s.f(p + 'temperature.max_temperature');
        t.gripAt0 = s.f(p + 'temperature.grip_at_0'); t.gripAtMax = s.f(p + 'temperature.grip_at_max');
        t.wearRaiseWithSliping = s.f(p + 'wear.wear_raise_with_sliping'); t.wearRaiseWithSliding = s.f(p + 'wear.wear_raise_with_sliding');
        t.wearCoefMinOpt = s.f(p + 'wear.wear_coef_min_opt'); t.wearCoefMaxOpt = s.f(p + 'wear.wear_coef_max_opt'); t.wearCoefBusted = s.f(p + 'wear.wear_coef_tire_busted');
        t.gripAtWear0 = s.f(p + 'wear.grip_at_wear_0'); t.gripAtWear100 = s.f(p + 'wear.grip_at_wear_100'); t.gripForFlatTire = s.f(p + 'wear.grip_for_flat_tire');
        this.types.set(`${c}:${rear ? 'rear' : 'front'}`, t);
      }
    }
  }
  get(c: Compound, rear: boolean): TireType { return this.types.get(`${c}:${rear ? 'rear' : 'front'}`)!; }
}
/** curves whose x axis is in degrees in the file: the original rescales xmin/xmax/step by DEG (MTH_Curve "already converted" flag at +0x20) */
function degDomain(c: Curve): Curve { return new Curve(c.xmin * DEG, c.xmax * DEG, c.y); }
