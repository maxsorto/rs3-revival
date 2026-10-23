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
const dt = 1 / 200; let lastGear = car.gearbox.gear, lastClutch = car.clutch.state;
for (let i = 1; i <= 200 * 7; i++) {
  car.move(dt, road);
  if (car.gearbox.gear !== lastGear || car.clutch.state !== lastClutch) {
    console.log(`t=${(i * dt).toFixed(3)} gear ${lastGear}->${car.gearbox.gear} clutch ${lastClutch}->${car.clutch.state} rpm=${(car.engine.omega / 0.10472).toFixed(0)} wheelω=${car.wheels[1].omega.toFixed(1)} inputΩ=${car.clutch.inputOmega.toFixed(1)} Δω=${car.clutch.deltaOmega.toFixed(1)} progress=${car.clutch.progress.toFixed(2)} v=${(car.speedNorm() * 3.6).toFixed(0)}`);
    lastGear = car.gearbox.gear; lastClutch = car.clutch.state;
  }
}
