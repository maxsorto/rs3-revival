// PART_AeroForm / PART_Wing / F1MC_Wing port (vUpdateTorsor @001dc050; F1MC_F1Car::vInit wing setup; vUpdateAeroForces @001cc090).
// Torsor force in the car frame: Fx = -kx·vx|vx|, Fy = ky·vy|vy|, Fz = -kz·vx|vx| (downforce), with k = ½ρ·S·C.
import { Vec3 } from '../mth/vec3';
import { Curve } from '../mth/curve';
import { Setup } from '../data/setup';
export class AeroForm {
  pos = new Vec3();           // application point, car frame (+0x30)
  kx = 0; ky = 0; kz = 0;     // +0xc, +0x10, +0x14
  force = new Vec3();         // +0x20 (car frame)
  /** PART_AeroForm::vUpdateTorsor(airSpeed (world, = -v), xAxis, yAxis) */
  updateTorsor(air: Vec3, xAxis: Vec3, yAxis: Vec3): void {
    const vx = air.dot(xAxis), vy = air.dot(yAxis);
    this.force.set(this.kx * vx * Math.abs(vx), this.ky * vy * Math.abs(vy), -this.kz * Math.abs(vx * Math.abs(vx)));
  }
}
export class Wing extends AeroForm {
  surfaceX = 0; surfaceY = 0; cy = 0; cxCurve!: Curve; czCurve!: Curve; incidence = 0;
  /** F1MC_F1Car::vInit wing block: "chassis.aerodynamism.<front|rear>_wing_<slow|medium|fast>.*", curves pre-multiplied by ρ/2 */
  init(s: Setup, name: string, rho: number): void {
    const p = `chassis.aerodynamism.${name}.${name.split('_')[0]}_wing_`;
    const c = s.vec(p + 'coordinates'); this.pos.set(c[0], c[1], c[2]);
    this.surfaceX = s.f(p + 'surface_x'); this.surfaceY = s.f(p + 'surface_y'); this.cy = s.f(p + 'Cy');
    this.cxCurve = s.curve(p + 'Cx_curve').scale(rho * 0.5); this.czCurve = s.curve(p + 'Cz_curve').scale(rho * 0.5);
    this.ky = rho * 0.5 * this.surfaceY * this.cy;
  }
  /** wing setting: incidence in degrees selects Cx/Cz on the curves (vSetGarageSettings) */
  setIncidence(deg: number): void { this.incidence = deg; this.kx = this.surfaceX * this.cxCurve.at(deg); this.kz = this.surfaceX * this.czCurve.at(deg); }
}
export class Body extends AeroForm {
  init(s: Setup, rho: number): void {
    const p = 'chassis.aerodynamism.body.';
    this.kx = rho * 0.5 * s.f(p + 'body_surface_x') * s.f(p + 'body_Cx');
    this.kz = rho * 0.5 * s.f(p + 'body_surface_x') * s.f(p + 'body_Cz');
    this.ky = rho * 0.5 * s.f(p + 'body_surface_y') * s.f(p + 'body_Cy');
  }
}
