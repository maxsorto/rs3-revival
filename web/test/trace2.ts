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
car.place(new Vec3(slot.pos.x, slot.pos.y, plane.z + car.cgHeight + 0.075), slot.dir, 0); car.cmd.throttle = 1;
const dt = 1 / 200;
const from = Number(process.argv[2] ?? 820), to = Number(process.argv[3] ?? 850);
for (let i = 1; i <= to; i++) {
  const before = { gear: car.gearbox.gear, clutch: car.clutch.state, rpm: car.engine.omega / 0.10472 };
  car.move(dt, road);
  if (i >= from) console.log(`i=${i} t=${(i*dt).toFixed(3)} before[g=${before.gear} c=${before.clutch} rpm=${before.rpm.toFixed(0)}] after[g=${car.gearbox.gear} c=${car.clutch.state} rpm=${(car.engine.omega/0.10472).toFixed(0)} tq=${car.engine.torque.toFixed(0)} wl=${car.wheels[1].omega.toFixed(1)} wr=${car.wheels[3].omega.toFixed(1)} lim=${car.limiterOmega.toFixed(1)} inΩ=${car.clutch.inputOmega.toFixed(0)} drv=${car.wheels[1].driveTorque.toFixed(0)} maxV=${(car.maxSpeed*3.6).toFixed(0)}]`);
}
