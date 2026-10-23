// BSP_BSPReader equivalent: typed access to a decoded car setup (tools/bsp.py JSON), by original variable name.
import { Curve } from '../mth/curve';
export interface SetupVar { name: string; type: number; value: unknown; kind?: number }
export class Setup {
  private map = new Map<string, SetupVar>();
  constructor(vars: SetupVar[], readonly name = '') { for (const v of vars) this.map.set(v.name, v); }
  has(n: string): boolean { return this.map.has(n); }
  /** BSP_BSPReader::poGetVariable -> float */
  f(n: string): number { const v = this.get(n); if (typeof v.value !== 'number') throw new Error(`${n} is not a float`); return v.value; }
  i(n: string): number { return this.f(n) | 0; }
  vec(n: string): number[] { const v = this.get(n); if (!Array.isArray(v.value)) throw new Error(`${n} is not a vector`); return v.value as number[]; }
  curve(n: string): Curve { const v = this.get(n); const c = v.value as { xmin: number; xmax: number; y: number[] }; if (!c || !Array.isArray(c.y)) throw new Error(`${n} is not a curve`); return Curve.fromSetup(c); }
  private get(n: string): SetupVar { const v = this.map.get(n); if (!v) throw new Error(`setup ${this.name}: missing variable ${n}`); return v; }
  static async load(url: string): Promise<Setup> { const r = await fetch(url); if (!r.ok) throw new Error(`${url}: ${r.status}`); return new Setup(await r.json(), url); }
}
export const DEG = 0.0174533;      // DAT_00309788
export const RPM = 0.10472;        // DAT_00309a24 (rpm -> rad/s)
export const G = 9.81;             // DAT_00309790
