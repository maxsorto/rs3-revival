// Braking check: launch at 150 km/h on the pit straight, brake fully, log the deceleration and wheel state. npx tsx test/brake.ts
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
const car = new F1Car(chassis, new Catalog(common), 'soft');
const slot = grid[0]; const plane = { n: new Vec3(), z: 0, material: 0, tri: 0 };
road.planeAt(slot.pos.x, slot.pos.y, slot.pos.z, plane);
car.place(new Vec3(slot.pos.x, slot.pos.y, plane.z + car.cgHeight + 0.075), slot.dir, 150 / 3.6);
car.cmd.throttle = 1; const dt = 1 / 200; let t = 0;
console.log('brake torque per wheel', car.wheels.map(w => w.brake.torque.toFixed(0)), 'radius', car.wheels.map(w => w.radius.toFixed(3)), 'mass', car.mass.toFixed(0), 'engine braking torque', car.engine.brakingTorque);
let lastV = car.speedNorm();
for (let i = 1; i <= 200 * 6; i++) {
  if (t >= 1) { car.cmd.throttle = 0; car.cmd.brake = 1; }
  car.move(dt, road); t += dt;
  if (i % 50 === 0) {
    const v = car.speedNorm(); const g = (lastV - v) / 0.25 / 9.81; lastV = v;
    console.log(`t=${t.toFixed(2)} v=${(v * 3.6).toFixed(1)}km/h decel=${g.toFixed(2)}g gear=${car.gearbox.gear} rpm=${(car.engine.omega / 0.10472).toFixed(0)} clutch=${car.clutch.state} brakeT=[${car.wheels.map(w => w.brakeTorque.toFixed(0)).join(',')}] drv=[${car.wheels.map(w => w.driveTorque.toFixed(0)).join(',')}] Fx=[${car.wheels.map(w => w.fx.toFixed(0)).join(',')}] Fz=[${car.wheels.map(w => w.torsor.force.z.toFixed(0)).join(',')}] w=[${car.wheels.map(w => w.omega.toFixed(1)).join(',')}] slide=${car.wheels.map(w => +w.sliding).join('')} grip=[${car.wheels.map(w => w.gripCoef.toFixed(2)).join(',')}]`);
  }
}
