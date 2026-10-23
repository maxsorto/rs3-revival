import { readFileSync } from 'node:fs';
import { Mfd } from '../src/mfd';
import { Setup } from '../src/engine/data/setup';
import { Catalog } from '../src/engine/data/catalog';
import { trackRoad, trackGrid } from '../src/engine/data/track';
import { F1Car } from '../src/engine/f1mc/car';
import { Vec3 } from '../src/engine/mth/vec3';
const DATA = '/Users/max/rs3-port/pc/game/DataBin', SET = '/Users/max/rs3-port/out/setups';
const buf = (p: string) => { const b = readFileSync(p); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); };
const track = new Mfd(buf(`${DATA}/Tracks0.mfd`)); const road = trackRoad(track), grid = trackGrid(track);
const cat = new Catalog(new Setup(JSON.parse(readFileSync(`${SET}/0017.json`, 'utf8'))));
const car = new F1Car(new Setup(JSON.parse(readFileSync(`${SET}/3786.json`, 'utf8'))), cat, 'soft');
const slot = grid[0]; const plane = { n: new Vec3(), z: 0, material: 0, tri: 0 }; road.planeAt(slot.pos.x, slot.pos.y, slot.pos.z, plane);
const speed = Number(process.argv[2] ?? 20), steerDeg = Number(process.argv[3] ?? 5);
car.place(new Vec3(slot.pos.x, slot.pos.y, plane.z + car.cgHeight + 0.075), slot.dir, speed); car.cmd.throttle = 0.3;
const dt = 1 / 200; const x0 = car.pos.x, y0 = car.pos.y; let heading0 = Math.atan2(car.R.axis(0).y, car.R.axis(0).x);
for (let i = 1; i <= 200 * 4; i++) {
  car.cmd.steering = (i > 100 ? steerDeg : 0) * 0.0174533;
  car.move(dt, road);
  if (i % 100 === 0) {
    const f = car.R.axis(0), heading = Math.atan2(f.y, f.x); const lat = car.R.axis(1).dot(car.sumForce) / car.mass / 9.81;
    const w = car.wheels;
    console.log(`t=${(i * dt).toFixed(1)} v=${(car.speedNorm() * 3.6).toFixed(0)}km/h heading=${((heading - heading0) * 57.3).toFixed(1)}° yawRate=${(car.w.z * 57.3).toFixed(1)}°/s latG=${lat.toFixed(2)} dist=${Math.hypot(car.pos.x - x0, car.pos.y - y0).toFixed(0)} slip=[${w.map(x => (x.slipAngle * 57.3).toFixed(1)).join(',')}] fy=[${w.map(x => x.fy.toFixed(0)).join(',')}] Fz=[${w.map(x => x.torsor.force.z.toFixed(0)).join(',')}] touch=${w.map(x => +x.touching).join('')} roll=${(Math.asin(car.R.m[7]) * 57.3).toFixed(2)}`);
  }
}
