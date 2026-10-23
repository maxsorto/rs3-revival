// MTH_Curve port: a uniformly sampled table. Layout in the original object (seen inline everywhere):
//   [0]=xmin [1]=xmax [3]=1/step [4]=y* [6]=y[0] [7]=y[n-1]; fInterCurveValue clamps then lerps.
export class Curve {
  readonly invStep: number;
  constructor(readonly xmin: number, readonly xmax: number, readonly y: Float32Array | number[]) {
    this.invStep = (y.length - 1) / (xmax - xmin);
  }
  /** MTH_Curve::fInterCurveValue */
  at(x: number): number {
    if (x >= this.xmax) return this.y[this.y.length - 1];
    if (x <= this.xmin) return this.y[0];
    const f = this.invStep * (x - this.xmin), i = Math.floor(f), y0 = this.y[i];
    return y0 - (f - i) * (y0 - this.y[i + 1]);
  }
  /** MTH_Curve::operator*=(k) (__amu) — used for aero: Cx/Cz curves are pre-multiplied by rho/2 */
  scale(k: number): this { for (let i = 0; i < this.y.length; i++) this.y[i] *= k; return this; }
  static fromSetup(v: { xmin: number; xmax: number; y: number[] }): Curve { return new Curve(v.xmin, v.xmax, Float32Array.from(v.y)); }
}
