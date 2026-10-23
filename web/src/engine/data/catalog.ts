// F1MC_Catalog port: static data (F1Com.bsp → tyre catalog + road materials) and per-car setup access.
import { Setup } from './setup';
import { TyreCatalog } from '../part/tiretype';
import type { RoadMaterial } from '../road';
export class Catalog {
  tyres: TyreCatalog; materials: RoadMaterial[] = [];
  constructor(readonly common: Setup) {
    this.tyres = new TyreCatalog(common);
    // F1CL_MaterialList::__ct order: 0 default(=tarmac), 1 tarmac, 2 tarmac copy, 3 transition, 4 smooth_concrete, 5 rough_concrete, 6 grass, 7 sand
    const mk = (name: string): RoadMaterial => {
      const p = `material.road.${name}.`, has = (k: string) => common.has(p + k);
      return { name, dryAdhesion: common.f(p + 'dry_adhesion'), wetAdhesion: has('wet_adhesion') ? common.f(p + 'wet_adhesion') : -1, rollingResistance: common.f(p + 'rolling_resistance'), rebound: common.f(p + 'rebound'), friction: common.f(p + 'friction'), bumpAmplitude: has('bump_amplitude') ? common.f(p + 'bump_amplitude') : 0, bumpWaveLength: has('bump_wave_length') ? common.f(p + 'bump_wave_length') : 0 };
    };
    const tarmac = mk('tarmac');
    this.materials = [tarmac, tarmac, tarmac, mk('transition'), mk('smooth_concrete'), mk('rough_concrete'), mk('grass'), mk('sand')];
  }
}
