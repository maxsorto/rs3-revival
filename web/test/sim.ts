// Offline simulation check on real data: node test/sim.ts (via tsx)
import { readFileSync } from 'node:fs';
import { Mfd } from '../src/mfd';
import { Setup } from '../src/engine/data/setup';
import { Catalog } from '../src/engine/data/catalog';
import { trackRoad, trackGrid } from '../src/engine/data/track';
import { F1Car } from '../src/engine/f1mc/car';
import { Vec3 } from '../src/engine/mth/vec3';
const DATA = '/Users/max/rs3-port/pc/game/DataBin', SET = '/Users/max/rs3-port/out/setups';
const buf = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const track = new Mfd(buf(`${DATA}/Tracks0.mfd`));
const road = trackRoad(track), grid = trackGrid(track);
const common = new Setup(JSON.parse(readFileSync(`${SET}/0017.json`, 'utf8')), 'F1Com');
const chassis = new Setup(JSON.parse(readFileSync(`${SET}/3786.json`, 'utf8')), 'car');
const cat = new Catalog(common);
const car = new F1Car(chassis, cat, 'soft');
const slot = grid[0];
console.log('grid slot 0', slot.pos, slot.dir, 'wheels restZ', car.wheels.map(w => w.restZ.toFixed(3)), 'ratios', car.gearbox.ratios.map(r => r.toFixed(2)));
const plane = { n: new Vec3(), z: 0, material: 0, tri: 0 };
console.log('ground under slot:', road.planeAt(slot.pos.x, slot.pos.y, slot.pos.z, plane), plane.z.toFixed(3), plane.material, plane.n);
// place the CoG at ground + cgHeight + front ride height
const start = new Vec3(slot.pos.x, slot.pos.y, plane.z + car.cgHeight + 0.075);
car.place(start, slot.dir, Number(process.argv[2] ?? 0));
car.cmd.throttle = 1; car.cmd.steering = 0;
const dt = 1 / 200; let t = 0;
const line = () => {
  const fwd = car.R.axis(0); const vfwd = car.v.dot(fwd);
  console.log(`t=${t.toFixed(2)} v=${(car.speedNorm() * 3.6).toFixed(1)}km/h vfwd=${vfwd.toFixed(2)} z=${(car.pos.z - plane.z).toFixed(3)} gear=${car.gearbox.gear} rpm=${(car.engine.omega / 0.10472).toFixed(0)} clutch=${car.clutch.state} ` +
    `wz=[${car.wheels.map(w => w.local.z.toFixed(3)).join(',')}] Fz=[${car.wheels.map(w => w.torsor.force.z.toFixed(0)).join(',')}] Fx=[${car.wheels.map(w => w.fx.toFixed(0)).join(',')}] ` +
    `touch=${car.wheels.map(w => +w.touching).join('')} slide=${car.wheels.map(w => +w.sliding).join('')} drv=[${car.wheels.map(w => w.driveTorque.toFixed(0)).join(',')}] w=[${car.wheels.map(w => w.omega.toFixed(1)).join(',')}] pitch=${(Math.asin(car.R.m[6]) * 57.3).toFixed(2)} roll=${(Math.asin(car.R.m[7]) * 57.3).toFixed(2)}`);
};
line();
for (let i = 1; i <= 200 * 12; i++) {
  car.move(dt, road); t += dt;
  if (i % 100 === 0) line();
  if (!Number.isFinite(car.pos.z)) { console.log('NaN!'); break; }
}
console.log('autobox rpm thresholds: up', car.autoBox.up.map(v => (v / 0.10472).toFixed(0)).join(','), 'down', car.autoBox.down.map(v => (v / 0.10472).toFixed(0)).join(','), 'goToFirst', (car.autoBox.goToFirstOmega / 0.10472).toFixed(0), 'goToNeutral', (car.autoBox.goToNeutralOmega / 0.10472).toFixed(0), 'engine max', (car.engine.maxOmega / 0.10472).toFixed(0), 'clutch duration', car.clutch.duration);
