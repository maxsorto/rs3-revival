// Start menu: one screen, no page scroll. Two horizontal strips (track minimaps, car previews) and a DRIVE button.
const TRACKS = [0, 1, 2, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16];
const CARS = 22;
import { dataUrl } from './paths';
export function startMenu(host: HTMLElement): void {
  const saved = (() => { try { return JSON.parse(localStorage.getItem('rs3.menu') ?? '{}'); } catch { return {}; } })() as { track?: number; car?: number };
  let track = TRACKS.includes(saved.track ?? -1) ? saved.track! : 0, car = Math.min(CARS - 1, Math.max(0, saved.car ?? 0));
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;background:#111;color:#fff;font-family:-apple-system,Helvetica Neue,Helvetica,Arial,sans-serif;display:flex;flex-direction:column;overflow:hidden;user-select:none;-webkit-user-select:none';
  root.innerHTML = `
    <style>
      .m-head{padding:max(14px,env(safe-area-inset-top)) 16px 0;display:flex;align-items:baseline;gap:12px;flex:0 0 auto}
      .m-h1{font-weight:900;font-size:clamp(18px,4.2vw,30px);letter-spacing:-.02em;text-transform:uppercase;line-height:1;margin:0;white-space:nowrap}
      .m-sub{color:#8a8a8a;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1 1 auto;min-width:0}
      .m-drv{display:flex;align-items:center;gap:8px;flex:0 0 auto;margin-left:auto;align-self:center}
      .m-drv img{width:34px;height:34px;border-radius:9px;object-fit:cover;border:1.5px solid rgba(255,255,255,.8)}
      .m-drv span{font-size:10px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;color:#8a8a8a}
      .m-drv b{display:block;font-size:14px;color:#ffcc33;letter-spacing:-.02em}
      .m-sec{flex:0 1 auto;display:flex;flex-direction:column;padding-top:10px}
      .m-fill{flex:1 1 0}
      .m-lbl{font-size:11px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8a8a8a;padding:0 16px 6px;display:flex;justify-content:space-between;flex:0 0 auto}
      .m-lbl b{color:#fff}
      .m-strip{flex:0 0 auto;height:clamp(96px,26vh,230px);display:flex;gap:10px;overflow-x:auto;overflow-y:hidden;padding:4px 16px 8px;scroll-snap-type:x proximity;-webkit-overflow-scrolling:touch;scrollbar-width:none}
      .m-strip::-webkit-scrollbar{display:none}
      .m-card{flex:0 0 auto;height:100%;max-width:44vw;aspect-ratio:1;background:#1c1c1c;border:2px solid #1c1c1c;border-radius:12px;padding:6px;box-sizing:border-box;display:flex;flex-direction:column;align-items:center;justify-content:center;cursor:pointer;scroll-snap-align:center;-webkit-tap-highlight-color:transparent}
      .m-card.car{aspect-ratio:16/10;max-width:72vw}
      .m-card img{display:block;max-width:100%;max-height:calc(100% - 18px);object-fit:contain;pointer-events:none}
      .m-card span{display:block;font-size:11px;font-weight:700;margin-top:3px;white-space:nowrap}
      .m-card.on{border-color:#fff;background:#262626}
      .m-foot{flex:0 0 auto;padding:8px 16px max(12px,env(safe-area-inset-bottom))}
      .m-card{transition:transform .18s cubic-bezier(.2,.9,.2,1),border-color .18s,background .18s;animation:m-in .5s cubic-bezier(.2,.9,.2,1) both}
      .m-card:active{transform:scale(.96)}
      .m-card.on{transform:scale(1.03)}
      @keyframes m-in{from{opacity:0;transform:translateY(14px) scale(.98)}to{opacity:1;transform:none}}
      .m-head,.m-lbl,.m-foot{animation:m-in .5s cubic-bezier(.2,.9,.2,1) both}
      .m-go:active{transform:scale(.98)}
      .m-wipe{position:fixed;inset:0;z-index:40;background:#06101f;transform:translateX(-102%);pointer-events:none}
      .m-wipe.go{transition:transform .45s cubic-bezier(.7,0,.3,1);transform:translateX(0)}
      .m-go{width:100%;height:54px;transition:transform .12s;border:0;border-radius:14px;background:#fff;color:#111;font-weight:900;font-size:18px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;-webkit-tap-highlight-color:transparent}
    </style>
    <div class="m-head"><h1 class="m-h1">Racing Simulation 3</h1><span class="m-sub">web port, original tracks, cars and physics</span><div class="m-drv"><img src="${dataUrl('/driver.jpg')}" alt="" onerror="this.parentNode.remove()"><div><span>Driver</span><b>#1</b></div></div></div>
    <div class="m-sec"><div class="m-lbl"><span>Track</span><b id="m-tn"></b></div><div class="m-strip" id="m-tracks"></div></div>
    <div class="m-sec"><div class="m-lbl"><span>Car</span><b id="m-cn"></b></div><div class="m-strip" id="m-cars"></div></div>
    <div class="m-fill"></div>
    <div class="m-foot"><button class="m-go" id="m-go">Drive</button></div>`;
  host.appendChild(root);
  const tg = root.querySelector<HTMLElement>('#m-tracks')!, cg = root.querySelector<HTMLElement>('#m-cars')!, tn = root.querySelector('#m-tn')!, cn = root.querySelector('#m-cn')!;
  const trackCards: HTMLElement[] = [], carCards: HTMLElement[] = [];
  const sync = (scroll = false) => {
    trackCards.forEach(c => c.classList.toggle('on', Number(c.dataset.id) === track)); carCards.forEach(c => c.classList.toggle('on', Number(c.dataset.id) === car));
    tn.textContent = `TRACK ${String(track).padStart(2, '0')}`; cn.textContent = `CAR ${car + 1}`;
    try { localStorage.setItem('rs3.menu', JSON.stringify({ track, car })); } catch { /* ignore */ }
    if (scroll) { trackCards.find(c => Number(c.dataset.id) === track)?.scrollIntoView({ inline: 'center', block: 'nearest' }); carCards.find(c => Number(c.dataset.id) === car)?.scrollIntoView({ inline: 'center', block: 'nearest' }); }
  };
  for (const id of TRACKS) {
    const c = document.createElement('div'); c.className = 'm-card'; c.dataset.id = String(id);
    c.innerHTML = `<img src="/minimaps/${id}.png" alt=""><span>TRACK ${String(id).padStart(2, '0')}</span>`;
    c.style.animationDelay = `${0.05 + trackCards.length * 0.04}s`;
    c.addEventListener('click', () => { track = id; sync(); }); tg.appendChild(c); trackCards.push(c);
  }
  for (let i = 0; i < CARS; i++) {
    const c = document.createElement('div'); c.className = 'm-card car'; c.dataset.id = String(i);
    c.innerHTML = `<img src="/cars/${i}.png" alt=""><span>CAR ${i + 1}</span>`;
    c.style.animationDelay = `${0.15 + carCards.length * 0.04}s`;
    c.addEventListener('click', () => { car = i; sync(); }); cg.appendChild(c); carCards.push(c);
  }
  // mouse wheel scrolls the strips sideways on desktop
  for (const strip of [tg, cg]) strip.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault(); } }, { passive: false });
  sync(); requestAnimationFrame(() => sync(true));
  const wipe = document.createElement('div'); wipe.className = 'm-wipe'; root.appendChild(wipe);
  root.querySelector('#m-go')!.addEventListener('click', () => { try { sessionStorage.setItem('rs3.seenIntro', '1'); } catch { /* ignore */ } wipe.classList.add('go'); setTimeout(() => { location.href = `/?track=${track}&car=${car}`; }, 460); });
}
