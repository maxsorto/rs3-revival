// Car render model from MechaCar.mfd (M3D, same layout as tracks) with TxCars textures.
// All 22 car files share one 55-pool layout (identified visually with ?carparts, see notes/README.md "Car model pools"):
//   0,1 driver arms · 3 rear wing (4,6 variants) · 7 body (37 = LOD) · 9,10 mirrors (38,39 LOD) · 11 front wing (40 damaged)
//   13 helmet (41 LOD) · 14 nose (42 damaged) · 16 steering wheel (43 hi-res) · 17,18 rear suspension · 19,21 front suspension (44,45 LOD)
//   23/26 rear tyres with sidewall logo, face on +y/−y (24/27 plain variants) · 29/31 front tyres, face on +y/−y (30/32 plain) · 46–49 wheel LODs
//   33,34 driver shoulders · 36 cockpit interior + driver torso · 35,51,52 light quads · 50 rear billboard quad
//   2,5,8,12,15,20,22,25,28,53,54 flat shadow quads
import * as THREE from 'three';
import { dataUrl } from './paths';
import { Mfd } from './mfd';
import { parseM3d } from './m3d';
import { buildM3dMeshes, type TextureSource } from './m3dmesh';
export interface CarModel { group: THREE.Group; wheels: THREE.Group[] }
const BODY_PARTS = [0, 1, 3, 7, 9, 10, 11, 13, 14, 16, 17, 18, 19, 21, 33, 34, 36];
/** wheel pool per physics wheel id. Wheel init negates half_track when (id & 2) == 0, and +y is LEFT (right-handed, x forward, z up),
 *  so ids 0/1 = front/rear RIGHT (y<0) and 2/3 = front/rear LEFT (y>0). The sidewall-logo face is the outer side: −y pools for the right wheels. */
const WHEEL_PARTS = [31, 26, 29, 23];
export async function loadCarModel(index: number, texSrc: TextureSource): Promise<CarModel> {
  const mecha = await Mfd.load(dataUrl('/data/MechaCar.mfd'));
  const ids = mecha.entries.filter(e => mecha.magic(e) === 'M3D' && e.size > 100000).map(e => e.id);
  const e = mecha.byId(ids[index % ids.length])!;
  const m3d = parseM3d(mecha.bytes(e));
  const group = new THREE.Group();
  const localCenter = (pi: number) => {
    const pool = m3d.pools[pi];
    let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
    for (let i = 0; i < pool.pos.length; i += 3) { const x = pool.pos[i], y = pool.pos[i + 1], z = pool.pos[i + 2]; if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; if (z < minz) minz = z; if (z > maxz) maxz = z; }
    return [(minx + maxx) / 2, (miny + maxy) / 2, (minz + maxz) / 2];
  };
  // Body parts are stored centred on their own origin; the 0x1e/0x20 placement bbox is in car space, so part = bboxCentre − localCentre.
  const nodes = new Map<number, THREE.Object3D>();
  for (const pi of BODY_PARTS) {
    const pl = m3d.pools[pi]?.placement; if (!pl) continue;
    const lc = localCenter(pi), bc = [pl.bboxMin[0] + pl.bboxSize[0] / 2, pl.bboxMin[1] + pl.bboxSize[1] / 2, pl.bboxMin[2] + pl.bboxSize[2] / 2];
    const n = new THREE.Group(); n.position.set(bc[0] - lc[0], bc[1] - lc[1], bc[2] - lc[2]); group.add(n); nodes.set(pi, n);
  }
  // Wheels: node origin = wheel centre (front tyres are stored with the hub face at y=0, so recentre them); driven by the physics.
  const wheels: THREE.Group[] = [];
  for (const pi of WHEEL_PARTS) {
    const lc = localCenter(pi); const n = new THREE.Group(); const inner = new THREE.Group(); inner.position.set(-lc[0], -lc[1], -lc[2]); n.add(inner);
    group.add(n); nodes.set(pi, inner); wheels.push(n);
  }
  buildM3dMeshes(m3d, texSrc, 'car', (mesh, pi) => { const n = nodes.get(pi); if (n) n.add(mesh); });
  return { group, wheels };
}
