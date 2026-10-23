// Debug: render every pool of a car M3D in a labelled grid so parts / LODs / shadow quads can be identified by eye.
import * as THREE from 'three';
import { dataUrl } from './paths';
import { Mfd } from './mfd';
import { parseM3d } from './m3d';
import { buildM3dMeshes, TextureSource } from './m3dmesh';
export async function startCarParts(host: HTMLElement, log: (s: string) => void) {
  const q = new URLSearchParams(location.search);
  const carIdx = Number(q.get('car') ?? 0), cols = Number(q.get('cols') ?? 10), cell = Number(q.get('cell') ?? 1.2);
  const only = q.get('pools')?.split(',').map(Number);
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight); host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x303030);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(1, 2, 3); scene.add(sun);
  const [txCars, txCom, mecha] = await Promise.all([Mfd.load(dataUrl('/data/TxCars.mfd')), Mfd.load(dataUrl('/data/TxTrkCom.mfd')), Mfd.load(dataUrl('/data/MechaCar.mfd'))]);
  const ids = mecha.entries.filter(e => mecha.magic(e) === 'M3D' && e.size > 100000);
  const m3d = parseM3d(mecha.bytes(ids[carIdx % ids.length]));
  const tex = new TextureSource([txCars, txCom]);
  const nodes = new Map<number, THREE.Group>();
  const meshes = buildM3dMeshes(m3d, tex, 'car', (mesh, pi) => { let n = nodes.get(pi); if (!n) { n = new THREE.Group(); nodes.set(pi, n); } n.add(mesh); });
  void meshes;
  const labels: { pi: number; x: number; y: number }[] = [];
  let k = 0;
  const list = only ?? m3d.pools.map((_, i) => i);
  for (const pi of list) {
    const n = nodes.get(pi); if (!n) { k++; continue; }
    const box = new THREE.Box3().setFromObject(n); const c = box.getCenter(new THREE.Vector3()); const s = box.getSize(new THREE.Vector3());
    const scale = (cell * 0.8) / Math.max(s.x, s.y, s.z, 0.05);
    const holder = new THREE.Group(); holder.scale.setScalar(scale); n.position.copy(c).negate(); holder.add(n);
    const gx = (k % cols) * cell - (cols - 1) * cell / 2, gy = -Math.floor(k / cols) * cell;
    holder.position.set(gx, gy, 0);
    // game axes: x forward, y left, z up -> show from front-left-above
    holder.rotation.set(-Math.PI / 2 + 0.5, 0.0, 0.6);
    scene.add(holder); labels.push({ pi, x: gx, y: gy }); k++;
  }
  const rows = Math.ceil(k / cols);
  const w = cols * cell, h = rows * cell, aspect = innerWidth / innerHeight;
  let vw = w, vh = w / aspect; if (vh < h) { vh = h; vw = h * aspect; }
  const cam = new THREE.OrthographicCamera(-vw / 2, vw / 2, cell / 2, cell / 2 - vh, -50, 50); cam.position.set(0, 0, 10); cam.lookAt(0, 0, 0);
  const overlay = document.createElement('div'); overlay.style.cssText = 'position:fixed;left:0;top:0;pointer-events:none'; document.body.appendChild(overlay);
  for (const l of labels) {
    const v = new THREE.Vector3(l.x - cell * 0.45, l.y - cell * 0.42, 0).project(cam);
    const d = document.createElement('div'); d.textContent = String(l.pi);
    d.style.cssText = `position:absolute;left:${(v.x + 1) / 2 * innerWidth}px;top:${(1 - v.y) / 2 * innerHeight}px;font:bold 13px ui-monospace;color:#ff0;text-shadow:0 0 3px #000`;
    overlay.appendChild(d);
  }
  log(`car ${carIdx}: ${m3d.pools.length} pools, ${m3d.materials.length} materials`);
  renderer.setAnimationLoop(() => renderer.render(scene, cam));
}

import { loadCarModel } from './carmodel';
import { Setup } from './engine/data/setup';
import { Catalog } from './engine/data/catalog';
import { F1Car } from './engine/f1mc/car';
/** ?carshots: render every livery to a 480x270 PNG (data URLs on window.rs3shots) for the start menu */
export async function startCarShots(host: HTMLElement, log: (s: string) => void): Promise<void> {
  const q = new URLSearchParams(location.search);
  const W = Number(q.get('w') ?? 480), H = Number(q.get('h') ?? 270), only = q.get('only');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(W, H); host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.3)); const sun = new THREE.DirectionalLight(0xffffff, 1.6); sun.position.set(2, 3, 2); scene.add(sun);
  if (q.has('hero')) { const rim = new THREE.DirectionalLight(0x88aaff, 1.2); rim.position.set(-3, 2, -2); scene.add(rim); }
  const cam = new THREE.PerspectiveCamera(Number(q.get('fov') ?? 28), W / H, 0.1, 50);
  const [txCars, txCom, common, chassis] = await Promise.all([Mfd.load(dataUrl('/data/TxCars.mfd')), Mfd.load(dataUrl('/data/TxTrkCom.mfd')), Setup.load(dataUrl('/setups/0017.json')), Setup.load(dataUrl('/setups/3786.json'))]);
  const car = new F1Car(chassis, new Catalog(common), 'soft');
  const tex = new TextureSource([txCars, txCom]);
  const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world);
  const shots: string[] = [];
  const list = only !== null ? [Number(only)] : Array.from({ length: 22 }, (_, i) => i);
  for (const i of list) {
    const m = await loadCarModel(i, tex);
    const node = new THREE.Group(); node.add(m.group); world.add(node);
    m.wheels.forEach((w, k) => { const pw = car.wheels[k]; w.position.set(pw.local.x, pw.local.y, pw.restZ); if (q.has('hero')) w.rotation.z = k < 2 || k === 2 ? (k === 0 || k === 2 ? -0.18 : 0) : 0; });
    // three-quarter front view, car centred; hero = lower, closer, wider
    if (q.has('hero')) { cam.position.set(4.6, 0.75, 2.6); cam.lookAt(0.4, 0.15, -0.1); } else { cam.position.set(4.3, 1.25, 3.1); cam.lookAt(0.1, 0.2, 0); }
    renderer.render(scene, cam);
    shots.push(renderer.domElement.toDataURL('image/png'));
    world.remove(node);
    log(`car ${i} done`);
  }
  (window as unknown as { rs3shots: string[] }).rs3shots = shots;
}
