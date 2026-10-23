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
const t = cat.tyres.get('soft', true);
console.log('coefFz @', [500, 1500, 3000, 5000, 8000].map(x => `${x}:${t.coefFz.at(x).toFixed(3)}`).join(' '), '| coefFx @', [-2, -1, -0.5, 0, 0.5, 0.77, 1].map(x => `${x}:${t.coefFx.at(x).toFixed(2)}`).join(' '), '| coefFy same x:', [-2, -1, 0, 0.5, 1].map(x => t.coefFy.at(x).toFixed(2)).join(' '));
console.log('Fy curve (rear) @deg', [1, 2, 4, 6, 8, 12, 20, 45].map(d => `${d}:${t.fyCurve.at(d * 0.0174533).toFixed(0)}`).join(' '), 'fy0Max', t.fy0Max.toFixed(0), 'gripFromPressure(1.3)=', t.gripFromPressure.at(1.3).toFixed(3), 'slipFromPressure=', t.slipFromPressure.at(1.3).toFixed(3));
console.log('engine torque @rpm', [2000, 4000, 8000, 12000, 16000].map(r => `${r}:${car.engine.fullThrottle.at(r * 0.10472).toFixed(0)}/${car.engine.braking.at(r * 0.10472).toFixed(0)}`).join(' '), 'rolling res tarmac', cat.materials[1].rollingResistance, 'rr curve@10m/s', t.rollingResistance.at(10).toFixed(2));
const slot = grid[0]; const plane = { n: new Vec3(), z: 0, material: 0, tri: 0 }; road.planeAt(slot.pos.x, slot.pos.y, slot.pos.z, plane);
car.place(new Vec3(slot.pos.x, slot.pos.y, plane.z + car.cgHeight + 0.075), slot.dir, 0); car.cmd.throttle = 1;
const dt = 1 / 200;
for (let i = 1; i <= 200 * 6; i++) {
  car.move(dt, road);
  if (i % 200 === 0) {
    const fc = car.R.mulTransposedVec(car.sumForce);
    console.log(`t=${(i * dt).toFixed(1)} v=${car.speedNorm().toFixed(2)} sumF(car)=[${fc.x.toFixed(0)},${fc.y.toFixed(0)},${fc.z.toFixed(0)}] torque=[${car.sumTorque.x.toFixed(0)},${car.sumTorque.y.toFixed(0)},${car.sumTorque.z.toFixed(0)}] w=[${car.w.x.toFixed(2)},${car.w.y.toFixed(2)},${car.w.z.toFixed(2)}]`);
    for (const w of car.wheels) console.log(`   wheel${w.id} fx=${w.fx.toFixed(0)} fy=${w.fy.toFixed(0)} tors=[${w.torsor.force.x.toFixed(0)},${w.torsor.force.y.toFixed(0)},${w.torsor.force.z.toFixed(0)}]@[${w.torsor.point.x.toFixed(2)},${w.torsor.point.y.toFixed(2)},${w.torsor.point.z.toFixed(2)}] slip=${(w.slipAngle * 57.3).toFixed(1)}° slideCoef=${w.slidingCoef.toFixed(2)} fMax=${w.fMax.toFixed(0)} fzF=${w.tire.coefFz.at(w.torsor.force.z).toFixed(3)} grip=${w.gripCoef.toFixed(2)} omega=${w.omega.toFixed(1)} vx=${w.speed.dot(w.xAxis).toFixed(2)} vy=${w.speed.dot(w.yAxis).toFixed(2)} drv=${w.driveTorque.toFixed(0)} brk=${w.brakeTorque.toFixed(0)} fxImp=${w.fxImposed.toFixed(0)} fyImp=${w.fyImposed.toFixed(0)} camber=${(w.camberGround*57.3).toFixed(1)} fyCamber=${w.fyCamber.toFixed(0)}`);
  }
}
