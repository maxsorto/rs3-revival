// Start menu: pick a track (minimap cards) and a car livery, then drive. Plain DOM overlay, no framework.
const TRACKS = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const CARS = 22;
export function startMenu(host: HTMLElement): void {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('rs3.menu') ?? '{}'); } catch { return {}; } })() as { track?: number; car?: number };
  let track = TRACKS.includes(saved.track ?? -1) ? saved.track! : 0, car = Math.min(CARS - 1, Math.max(0, saved.car ?? 0));
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;background:#111;color:#fff;font-family:-apple-system,Helvetica Neue,Helvetica,Arial,sans-serif;overflow:auto;-webkit-overflow-scrolling:touch;touch-action:pan-y';
  root.innerHTML = `
    <style>
      .rs3-wrap{max-width:960px;margin:0 auto;padding:max(20px,env(safe-area-inset-top)) 16px 120px}
      .rs3-h1{font-weight:900;font-size:clamp(28px,6vw,54px);letter-spacing:-.02em;text-transform:uppercase;line-height:.95;margin:0 0 4px}
      .rs3-sub{color:#9a9a9a;font-size:14px;margin:0 0 24px}
      .rs3-lbl{font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#9a9a9a;margin:22px 0 10px}
      .rs3-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:10px}
      .rs3-card{background:#1c1c1c;border:2px solid #1c1c1c;border-radius:10px;padding:8px;cursor:pointer;text-align:center;user-select:none;-webkit-tap-highlight-color:transparent}
      .rs3-card img{width:100%;aspect-ratio:1;display:block;image-rendering:auto}
      .rs3-card span{display:block;font-size:12px;font-weight:700;margin-top:4px}
      .rs3-card.on{border-color:#fff;background:#262626}
      .rs3-cars{display:flex;flex-wrap:wrap;gap:8px}
      .rs3-car{min-width:44px;height:44px;border-radius:8px;background:#1c1c1c;border:2px solid #1c1c1c;font-weight:800;font-size:14px;color:#fff;cursor:pointer;-webkit-tap-highlight-color:transparent}
      .rs3-car.on{border-color:#fff;background:#262626}
      .rs3-go{position:fixed;left:16px;right:16px;bottom:max(16px,env(safe-area-inset-bottom));height:60px;border:0;border-radius:14px;background:#fff;color:#111;font-weight:900;font-size:20px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer}
      .rs3-tip{color:#777;font-size:12px;margin-top:18px;line-height:1.5}
    </style>
    <div class="rs3-wrap">
      <h1 class="rs3-h1">Racing<br>Simulation 3</h1>
      <p class="rs3-sub">Web port. Original tracks, cars and physics.</p>
      <div class="rs3-lbl">Track</div>
      <div class="rs3-grid" id="rs3-tracks"></div>
      <div class="rs3-lbl">Car</div>
      <div class="rs3-cars" id="rs3-cars"></div>
      <p class="rs3-tip">Touch: left half of the screen steers, right half gas (top) / brake (bottom). Keys: arrows or WASD, space brake, Q/E gears, R reset.</p>
    </div>
    <button class="rs3-go" id="rs3-go">Drive</button>`;
  host.appendChild(root);
  const tg = root.querySelector('#rs3-tracks')!, cg = root.querySelector('#rs3-cars')!;
  const trackCards: HTMLElement[] = [], carBtns: HTMLElement[] = [];
  const sync = () => { trackCards.forEach(c => c.classList.toggle('on', Number(c.dataset.id) === track)); carBtns.forEach(b => b.classList.toggle('on', Number(b.dataset.id) === car)); try { localStorage.setItem('rs3.menu', JSON.stringify({ track, car })); } catch { /* ignore */ } };
  for (const id of TRACKS) {
    const c = document.createElement('div'); c.className = 'rs3-card'; c.dataset.id = String(id);
    c.innerHTML = `<img src="/minimaps/${id}.png" alt=""><span>TRACK ${String(id).padStart(2, '0')}</span>`;
    c.addEventListener('click', () => { track = id; sync(); }); tg.appendChild(c); trackCards.push(c);
  }
  for (let i = 0; i < CARS; i++) {
    const b = document.createElement('button'); b.className = 'rs3-car'; b.dataset.id = String(i); b.textContent = String(i + 1);
    b.addEventListener('click', () => { car = i; sync(); }); cg.appendChild(b); carBtns.push(b);
  }
  sync();
  root.querySelector('#rs3-go')!.addEventListener('click', () => { location.href = `/?track=${track}&car=${car}`; });
}
