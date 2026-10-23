import * as THREE from 'three';
import { dataUrl } from './paths';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Mfd } from './mfd';
import { parseM3d } from './m3d';
import { parseMmb } from './mmb';
import { decodeTga } from './tga';

export async function startViewer(track: string, host: HTMLElement, log: (s: string) => void) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setSize(innerWidth, innerHeight);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene(); scene.background = new THREE.Color(0x202830);
  const camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.5, 20000);
  // Game space: x,y ground plane, z up. Rotate so three.js y is up.
  const world = new THREE.Group(); world.rotation.x = -Math.PI / 2; scene.add(world); // D3D left-handed -> mirror X
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334455, 1.2));
  const sun = new THREE.DirectionalLight(0xffffff, 1.5); sun.position.set(1, 2, 1); scene.add(sun);

  const t = await Mfd.load(dataUrl(`/data/Tracks${track}.mfd`));
  const [txTr, txCom] = await Promise.all([Mfd.load(dataUrl(`/data/TxTr${track}.mfd`)), Mfd.load(dataUrl(`/data/TxTrkCom.mfd`))]);
  const texCache = new Map<number, THREE.Texture | null>();
  const texture = (id: number): THREE.Texture | null => {
    if (texCache.has(id)) return texCache.get(id)!;
    const e = txTr.byId(id) ?? txCom.byId(id); let tex: THREE.Texture | null = null;
    if (e) {
      const src = e.offset >= 0 && txTr.byId(id) ? txTr : txCom;
      const tga = decodeTga(src.bytes(e));
      tex = new THREE.DataTexture(tga.rgba, tga.width, tga.height, THREE.RGBAFormat);
      tex.flipY = false; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.magFilter = THREE.LinearFilter; tex.minFilter = THREE.LinearMipmapLinearFilter; tex.generateMipmaps = true; tex.colorSpace = THREE.SRGBColorSpace; tex.needsUpdate = true;
    }
    texCache.set(id, tex); return tex;
  };
  const matCache = new Map<number, THREE.Material>();
  const allM3d = t.entries.filter(e => t.magic(e) === 'M3D');
  // the track has two M3D chunks with overlapping geometry (detail levels?); draw the first unless &all
  const m3dEntries = new URLSearchParams(location.search).has('all') ? allM3d : allM3d.slice(0, 1);
  const mmbEntry = t.entries.find(e => t.magic(e) === 'MMB');
  let tris = 0, groups = 0;
  for (const e of m3dEntries) {
    const { pools, materials } = parseM3d(t.bytes(e), Number(new URLSearchParams(location.search).get('shift') ?? 0));
    for (const pool of pools) {
      for (const g of pool.groups) {
        if (g.indices.length < 3) continue;
        const n = g.indices.length;
        const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) {
          const r = Math.max(0, g.base + g.indices[i] + pool.indexBase);
          const ni = pool.nrmIdx[r], ci = pool.colIdx[r] & 0xff, ti = pool.uvIdx[r], pi = pool.posIdx[r];
          if (pool.uv.length) { const u0 = pool.uv[ti * 2], v0 = pool.uv[ti * 2 + 1]; uv[i * 2] = Math.abs(u0) < 1e4 ? u0 : 0; uv[i * 2 + 1] = Math.abs(v0) < 1e4 ? v0 : 0; }
          pos.set(pool.pos.subarray(pi * 3, pi * 3 + 3), i * 3);
          if (pool.nrm.length) nrm.set(pool.nrm.subarray(ni * 3, ni * 3 + 3), i * 3);
          const c = pool.col.length >= (ci + 1) * 4 ? pool.col.subarray(ci * 4, ci * 4 + 3) : [200, 200, 200];
          col[i*3] = c[0] / 255; col[i*3+1] = c[1] / 255; col[i*3+2] = c[2] / 255;
        }
        const idx: number[] = []; for (let i = 0; i + 2 < n; i += 3) idx.push(i, i + 1, i + 2);
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
        geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
        geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(idx);
        if (!pool.nrm.length) geo.computeVertexNormals();
                const m = materials[g.texRef];
        const key = m ? m.id : -1;
        let mat = matCache.get(key);
        if (!mat) {
          const tex = m ? texture(m.texId) : null;
          const alpha = !!tex && (tex.image as { data: Uint8ClampedArray }).data.some((v, i) => (i & 3) === 3 && v < 250);
          mat = new THREE.MeshLambertMaterial({ map: tex ?? undefined, color: tex ? 0xffffff : 0x808080, side: THREE.DoubleSide, transparent: alpha, alphaTest: alpha ? 0.4 : 0 });
          matCache.set(key, mat);
        }
        world.add(new THREE.Mesh(geo, mat));
        tris += idx.length / 3; groups++;
      }
    }
  }
  log(`M3D: ${m3dEntries.length} chunks, ${groups} groups, ${tris} triangles, ${texCache.size} textures`);
  let center = new THREE.Vector3();
  if (mmbEntry) {
    const mmb = parseMmb(t.bytes(mmbEntry));
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(mmb.pos, 3)); geo.setIndex(new THREE.BufferAttribute(mmb.tris, 1));
    const wire = new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: 0xff4080, transparent: true, opacity: 0.35 }));
    wire.visible = new URLSearchParams(location.search).has('mmb'); world.add(wire);
    geo.computeBoundingBox(); geo.boundingBox!.getCenter(center);
    log(`MMB: ${mmb.pos.length / 3} verts, ${mmb.tris.length / 3} tris`);
  }
  const c3 = new THREE.Vector3(-center.x, center.z, -center.y);
  camera.position.set(c3.x + 400, c3.y + 500, c3.z + 400); camera.lookAt(c3);
  const controls = new OrbitControls(camera, renderer.domElement); controls.target.copy(c3); controls.update();
  // debug hook: rs3.look(x, y, z, tx, ty, tz) in game coords (x,y ground, z up)
  const g2t = (x: number, y: number, z: number) => new THREE.Vector3(x, z, -y);
  // debug: rs3.probe(x0,y0,x1,y1,step) ray-casts straight down at game-space points and reports which have no render mesh
  const probe = (x0: number, y0: number, x1: number, y1: number, step: number) => {
    world.updateMatrixWorld(true); const rc = new THREE.Raycaster(); const miss: number[][] = []; let total = 0, hits = 0;
    for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
      total++; rc.set(new THREE.Vector3(-x, 200, -y), new THREE.Vector3(0, -1, 0));
      const h = rc.intersectObject(world, true); if (h.length) hits++; else miss.push([x, y]);
    }
    return { total, hits, miss: miss.slice(0, 40) };
  };
  (window as unknown as { rs3: unknown }).rs3 = { camera, controls, world, probe, look: (x: number, y: number, z: number, tx: number, ty: number, tz: number) => { camera.position.copy(g2t(x, y, z)); controls.target.copy(g2t(tx, ty, tz)); controls.update(); } };
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene, camera); });
}
