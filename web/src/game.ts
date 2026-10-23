// Driving mode: track + car model + ported physics + chase camera + touch/keyboard input.
import * as THREE from 'three';
import { dataUrl } from './paths';
import { Mfd } from './mfd';
import { parseM3d } from './m3d';
import { buildM3dMeshes, TextureSource } from './m3dmesh';
import { loadCarModel } from './carmodel';
import { trackRoad, trackGrid, trackSectors, trackWaypoints } from './engine/data/track';
import { Beacon2D, LapTimer, fmtTime } from './engine/laptimer';
import { Setup } from './engine/data/setup';
import { Catalog } from './engine/data/catalog';
import { F1Car } from './engine/f1mc/car';
import { NextGear } from './engine/part/gearbox';
import { Vec3 } from './engine/mth/vec3';
import { Input } from './input';
import { EngineAudio } from './engine/audio';
import { showLoading } from './loading';

const g2t = (v: Vec3, out = new THREE.Vector3()) => out.set(v.x, v.z, -v.y);   // game (x,y ground, z up, right-handed: lap runs clockwise in raw xy) -> three (y up)

export async function startGame(track: string, host: HTMLElement, log: (s: string) => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight); host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x9fb8dc); scene.fog = new THREE.Fog(0xb9c9de, 500, 3000);
  // sky dome: vertex-coloured sphere (zenith blue → hazy horizon), drawn behind everything and centred on the camera
  const skyGeo = new THREE.SphereGeometry(3500, 24, 12); const skyCol: number[] = []; const zen = new THREE.Color(0x4f86d8), hor = new THREE.Color(0xd3dfee);
  const sp = skyGeo.attributes.position; for (let i = 0; i < sp.count; i++) { const y = sp.getY(i) / 3500; const c = hor.clone().lerp(zen, Math.pow(Math.max(0, y), 0.55)); skyCol.push(c.r, c.g, c.b); }
  skyGeo.setAttribute('color', new THREE.Float32BufferAttribute(skyCol, 3));
  const sky = new THREE.Mesh(skyGeo, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide, fog: false, depthWrite: false })); sky.renderOrder = -1; scene.add(sky);
  const camera = new THREE.PerspectiveCamera(65, innerWidth / innerHeight, 0.3, 4000);
  const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.1));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(1, 2, 1); scene.add(sun);

  const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch');
  const loading = showLoading(track, isTouch);
  const ld = (name: string) => (l: number, tot: number) => loading.track(name, l, tot);
  let t: Mfd, txTr: Mfd, txCom: Mfd, txCars: Mfd, common: Setup, chassis: Setup, sound: Mfd;
  try {
    [t, txTr, txCom, txCars, common, chassis, sound] = await Promise.all([
      Mfd.load(dataUrl(`/data/Tracks${track}.mfd`), ld('track')), Mfd.load(dataUrl(`/data/TxTr${track}.mfd`), ld('tex')), Mfd.load(dataUrl('/data/TxTrkCom.mfd'), ld('com')), Mfd.load(dataUrl('/data/TxCars.mfd'), ld('cars')),
      Setup.load(dataUrl('/setups/0017.json')), Setup.load(dataUrl('/setups/3786.json')), Mfd.load(dataUrl('/data/Sound.mfd'), ld('snd'))]);
  } catch (e) { loading.fail(String(e)); throw e; }
  const trackTex = new TextureSource([txTr, txCom]);
  // the track ships two M3D chunks with partly different groups: draw the union, skipping duplicates
  const seen = new Set<string>();
  let drawCalls = 0;
  for (const e of t.entries.filter(x => t.magic(x) === 'M3D')) for (const m of buildM3dMeshes(parseM3d(t.bytes(e)), trackTex, { tag: 'track', seen })) { world.add(m); drawCalls++; }
  const road = trackRoad(t), grid = trackGrid(t), sectors = trackSectors(t), waypoints = trackWaypoints(t);
  const carModel = await loadCarModel(Number(new URLSearchParams(location.search).get('car') ?? 0), new TextureSource([txCars, txCom]));
  const carNode = new THREE.Group(); carNode.add(carModel.group); world.add(carNode);
  log(`track ${track}: ${road.tris.length / 3} road tris, ${road.walls.length} walls, ${grid.length} grid slots, ${sectors.length} sectors, ${waypoints.length} waypoints, ${drawCalls} track meshes`);

  const catalog = new Catalog(common); const car = new F1Car(chassis, catalog, 'soft');
  car.helps = { tractionControl: 0, abs: 0 };
  const slot = grid[Number(new URLSearchParams(location.search).get('slot') ?? 0)] ?? grid[0];
  const plane = { n: new Vec3(), z: 0, material: 0, tri: 0 };
  const placeAt = (pos: Vec3, dir: Vec3) => { road.planeAt(pos.x, pos.y, pos.z, plane); car.place(new Vec3(pos.x, pos.y, plane.z + car.cgHeight + 0.075), dir, 0); };
  placeAt(slot.pos, slot.dir);
  // start/finish beacon: across the track 8 m ahead of the pole slot (the painted line sits just ahead of the grid); sector beacons from the track sectors
  const pole = grid[0] ?? slot;
  const finish = Beacon2D.acrossTrack(pole.pos.clone().addScaled(pole.dir, 8), pole.dir);
  const sectorBeacons = sectors.slice(1).map(sc => Beacon2D.acrossTrack(sc.a, sc.b.clone().sub(sc.a)));
  const timer = new LapTimer(finish, sectorBeacons); timer.reset(car.pos);
  // reset (R key / HUD tap): back onto the centre line at the nearest waypoint behind the car, pointing down the track
  const resetCar = () => {
    let best = -1, bd = Infinity;
    waypoints.forEach((w, i) => { const d = Math.hypot(w.pos.x - car.pos.x, w.pos.y - car.pos.y); if (d < bd) { bd = d; best = i; } });
    if (best >= 0) placeAt(waypoints[best].pos, waypoints[best].dir); else placeAt(slot.pos, slot.dir);
    timer.reset(car.pos);
  };
  addEventListener('keydown', e => { if (e.code === 'KeyR') resetCar(); });

  const input = new Input(renderer.domElement);
  // audio starts on the first user gesture (browser policy); muted with ?mute
  const audio = new EngineAudio(sound); const mute = new URLSearchParams(location.search).has('mute');
  const startAudio = () => { if (!mute) { audio.unlock(); audio.attachUnlock(); } };
  let started = false;
  loading.done(startAudio).then(() => { started = true; });
  (window as unknown as { rs3: unknown }).rs3 = { car, road, grid, camera, carModel, timer, sectors, resetCar, audio };
  const orbit = new URLSearchParams(location.search).get('orbit');
  const hud = document.createElement('div');
  hud.style.cssText = isTouch
    ? 'position:fixed;left:50%;transform:translateX(-50%);bottom:max(16px,env(safe-area-inset-bottom));font:700 clamp(14px,2.6vw,22px) ui-monospace;color:#fff;text-shadow:0 1px 3px #000;text-align:center;pointer-events:none;white-space:nowrap'
    : 'position:fixed;right:12px;bottom:40px;font:700 clamp(18px,3.2vw,28px) ui-monospace;color:#fff;text-shadow:0 1px 3px #000;text-align:right;pointer-events:none';
  document.body.appendChild(hud);
  const lapHud = document.createElement('div');
  lapHud.style.cssText = 'position:fixed;right:12px;top:max(12px,env(safe-area-inset-top));font:700 clamp(13px,2.4vw,20px) ui-monospace;color:#fff;text-shadow:0 1px 3px #000;text-align:right;pointer-events:none;white-space:pre';
  document.body.appendChild(lapHud);
  const resetBtn = document.createElement('button'); resetBtn.textContent = 'RESET';
  resetBtn.style.cssText = (isTouch ? 'position:fixed;left:calc(50% + 70px);top:max(10px,env(safe-area-inset-top));' : 'position:fixed;right:12px;bottom:12px;') + 'font:700 13px ui-monospace;color:#fff;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.5);border-radius:8px;padding:8px 14px;z-index:5;-webkit-tap-highlight-color:transparent';
  resetBtn.addEventListener('click', resetCar); resetBtn.addEventListener('touchend', e => { e.preventDefault(); resetCar(); }, { passive: false });
  document.body.appendChild(resetBtn);
  const menuBtn = document.createElement('a'); menuBtn.textContent = 'MENU'; menuBtn.href = '/';
  menuBtn.style.cssText = (isTouch ? 'position:fixed;left:max(12px,env(safe-area-inset-left));top:max(10px,env(safe-area-inset-top));' : 'position:fixed;left:12px;bottom:12px;') + 'font:700 13px ui-monospace;color:#fff;text-decoration:none;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.5);border-radius:8px;padding:8px 14px;z-index:5';
  document.body.appendChild(menuBtn);
  const sndBtn = document.createElement('button'); let soundOn = !mute;
  const sndLabel = () => { const st = audio.state; sndBtn.textContent = !soundOn ? 'SOUND OFF' : st === 'running' ? 'SOUND ON' : st === 'none' ? 'SOUND: TAP' : `SOUND: ${st.toUpperCase()}`; if (audio.errors.length) sndBtn.textContent += ' !'; };
  sndLabel(); setInterval(sndLabel, 500);
  sndBtn.style.cssText = (isTouch ? 'position:fixed;right:max(12px,env(safe-area-inset-right));top:max(96px,calc(env(safe-area-inset-top) + 88px));' : 'position:fixed;right:12px;bottom:44px;') + 'font:700 12px ui-monospace;color:#fff;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.5);border-radius:8px;padding:6px 10px;z-index:5;-webkit-tap-highlight-color:transparent';
  // a real click/touchend on this button is a full user activation on iOS: create or resume the context right here
  const sndTap = () => { if (!soundOn || audio.state !== 'running') { soundOn = true; audio.unlock(); audio.attachUnlock(); audio.volume = 0.35; } else { soundOn = false; audio.volume = 0; } sndLabel(); };
  sndBtn.addEventListener('click', sndTap); sndBtn.addEventListener('touchend', e => { e.preventDefault(); sndTap(); }, { passive: false });
  document.body.appendChild(sndBtn);
  if (!isTouch) {
    const legend = document.createElement('div'); legend.innerHTML = '<b>↑</b> gas &nbsp; <b>↓</b>/space brake &nbsp; <b>← →</b> steer &nbsp; <b>R</b> reset';
    legend.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);font:13px -apple-system,Helvetica,Arial,sans-serif;color:#fff;text-shadow:0 1px 3px #000;opacity:.85;pointer-events:none;white-space:nowrap';
    document.body.appendChild(legend);
  }
  let frames = 0, fpsT = performance.now(); const fpsEl = document.createElement('div');
  fpsEl.style.cssText = 'position:fixed;left:12px;top:max(44px,calc(env(safe-area-inset-top) + 36px));font:700 12px ui-monospace;color:#fff;text-shadow:0 1px 3px #000;pointer-events:none;z-index:3;opacity:.7';
  if (!new URLSearchParams(location.search).has('debug') && isTouch) fpsEl.style.display = 'none';
  document.body.appendChild(fpsEl);
  const tmpM = new THREE.Matrix4(), q = new THREE.Quaternion();
  const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
  let acc = 0, last = performance.now(); const DT = 1 / 200;
  renderer.setAnimationLoop(now => {
    const frame = Math.min(0.05, (now - last) / 1000); last = now; acc += frame;
    const inp = input.poll(frame); if (!started) { inp.throttle = 0; inp.brake = 1; inp.steer = 0; }
    if (!inp.throttle && !inp.brake && car.speedNorm() < 1.5) inp.brake = 1;   // parking brake while idle
    car.cmd.steering = inp.steer * car.maxSteering; car.cmd.throttle = inp.throttle; car.cmd.brake = inp.brake;   // steer +1 = left: positive steering yaws counter-clockwise (+z up), verified by a 1 s steer test
    if (inp.gearUp) car.cmd.nextGear = NextGear.Up; if (inp.gearDown) car.cmd.nextGear = NextGear.Down;
    while (acc >= DT) { car.move(DT, road); timer.update(DT, car.pos); acc -= DT; }
    // car pose: rotation matrix columns are the car axes in game space
    const m = car.R.m;
    tmpM.set(m[0], m[1], m[2], car.pos.x, m[3], m[4], m[5], car.pos.y, m[6], m[7], m[8], car.pos.z, 0, 0, 0, 1);
    carNode.matrixAutoUpdate = false; carNode.matrix.copy(tmpM);
    // wheel meshes follow the physics wheels: position in the car frame, yaw = steering, spin about the axle (y)
    for (let i = 0; i < Math.min(4, carModel.wheels.length); i++) {
      const w = car.wheels[i], node = carModel.wheels[i];   // model wheel i is built for physics wheel id i
      node.position.set(w.local.x, w.local.y, w.local.z);
      node.rotation.set(0, -w.rotation, w.steer, 'ZYX');
    }
    carNode.updateMatrixWorld(true);
    // chase camera in game space, converted to three
    if (orbit !== null) {
      // debug close-up: ?orbit=<deg> fixed angle (0 = from the front), ?orbit=auto slow turn
      const a = orbit === 'auto' ? now * 0.0004 : Number(orbit) * Math.PI / 180;
      const d = Number(new URLSearchParams(location.search).get('dist') ?? 4.5); const cp = car.pos.clone().add(new Vec3(Math.cos(a) * d, Math.sin(a) * d, d * 0.3));
      camera.position.copy(g2t(cp, camPos)); camera.lookAt(g2t(car.pos, camTarget));
    } else {
      const back = car.R.axis(0).scale(-9), up = new Vec3(0, 0, 3.2);
      const cp = car.pos.clone().add(back).add(up), ct = car.pos.clone().addScaled(car.R.axis(0), 6).add(new Vec3(0, 0, 1));
      camera.position.lerp(g2t(cp, camPos), 0.2); camera.lookAt(g2t(ct, camTarget));
    }
    const kmh = car.speedNorm() * 3.6, gear = car.gearbox.gear;
    audio.update(car.engine.omega / 0.10472, car.cmd.throttle);
    hud.textContent = `${kmh.toFixed(0)} km/h  ${gear === -1 ? 'N' : gear === 0 ? 'R' : gear}  ${(car.engine.omega / 0.10472).toFixed(0)} rpm`;
    lapHud.textContent = `LAP ${Math.max(1, timer.lap)}  ${fmtTime(timer.lapStart >= 0 ? timer.current : -1)}\nLAST ${fmtTime(timer.last)}\nBEST ${fmtTime(timer.best)}${sectorBeacons.length ? `\nS${timer.sector}/${sectorBeacons.length}` : ''}`;
    sky.position.copy(camera.position);
    frames++; if (now - fpsT > 1000) { fpsEl.textContent = `${Math.round(frames * 1000 / (now - fpsT))} fps`; frames = 0; fpsT = now; }
    renderer.render(scene, camera); void q;
  });
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
}
