// Loading screen + "tap to start" gate. Same look as the menu: dark, heavy caps, one progress bar, the track minimap.
export interface Loader { track: (name: string, loaded: number, total: number) => void; done: (onGesture?: () => void) => Promise<void>; fail: (msg: string) => void }
export function showLoading(trackId: string, isTouch: boolean): Loader {
  const root = document.createElement('div');
  root.style.cssText = 'position:fixed;inset:0;z-index:20;background:#06101f;color:#fff;font-family:-apple-system,Helvetica Neue,Helvetica,Arial,sans-serif;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;user-select:none;-webkit-user-select:none;transition:opacity .5s';
  root.innerHTML = `
    <style>@keyframes rs3-ld-in{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}</style>
    <div style="width:min(420px,90vw);animation:rs3-ld-in .6s cubic-bezier(.2,.9,.2,1) both">
      <img src="/minimaps/${trackId}.png" alt="" style="width:min(42vh,180px);height:auto;display:block;margin:0 auto 10px;filter:drop-shadow(0 0 12px rgba(255,255,255,.15))">
      <div style="font-weight:900;font-size:clamp(22px,5vw,34px);letter-spacing:-.02em;text-transform:uppercase;line-height:1">Track ${String(trackId).padStart(2, '0')}</div>
      <div id="rs3-ld-sub" style="color:#9a9a9a;font-size:13px;margin:10px 0 14px;min-height:18px">Loading track data</div>
      <div style="height:6px;border-radius:3px;background:#2a2a2a;overflow:hidden"><div id="rs3-ld-bar" style="height:100%;width:0%;background:#fff;transition:width .15s"></div></div>
      <div id="rs3-ld-go" style="display:none;margin-top:28px">
        <div style="font-weight:900;font-size:clamp(20px,4.5vw,30px);text-transform:uppercase;letter-spacing:.04em">${isTouch ? 'Tap to start' : 'Press any key'}</div>
        <div style="color:#bbb;font-size:14px;line-height:1.7;margin-top:12px">${isTouch
          ? 'Hold <b>GAS</b> to go, <b>BRAKE</b> to slow down.<br>Steer with <b>◀</b> and <b>▶</b>. Turn the phone sideways.<br><span style="color:#888">For engine sound, flip the ringer switch on.</span>'
          : '<b>↑</b> gas &nbsp; <b>↓</b> or <b>space</b> brake &nbsp; <b>← →</b> steer<br><b>R</b> puts the car back on track'}</div>
      </div>
      <div id="rs3-ld-err" style="display:none;color:#f66;font-size:14px;margin-top:16px"></div>
    </div>`;
  document.body.appendChild(root);
  const bar = root.querySelector<HTMLElement>('#rs3-ld-bar')!, sub = root.querySelector<HTMLElement>('#rs3-ld-sub')!, go = root.querySelector<HTMLElement>('#rs3-ld-go')!, err = root.querySelector<HTMLElement>('#rs3-ld-err')!;
  const files = new Map<string, [number, number]>();
  return {
    track(name, loaded, total) {
      files.set(name, [loaded, total]); let l = 0, t = 0; for (const [a, b] of files.values()) { l += a; t += b; }
      bar.style.width = `${t ? Math.min(100, 100 * l / t) : 0}%`; sub.textContent = `Loading ${(l / 1048576).toFixed(1)} MB`;
    },
    done(onGesture) {
      bar.style.width = '100%'; sub.textContent = 'Ready'; go.style.display = 'block';
      return new Promise<void>(res => {
        const fin = (e: Event) => { e.preventDefault?.(); onGesture?.(); removeEventListener('keydown', fin); root.removeEventListener('pointerdown', fin); root.removeEventListener('touchend', fin); root.style.opacity = '0'; setTimeout(() => root.remove(), 500); res(); };
        addEventListener('keydown', fin); root.addEventListener('pointerdown', fin); root.addEventListener('touchend', fin, { passive: false });
      });
    },
    fail(msg) { sub.textContent = 'Could not load'; err.style.display = 'block'; err.textContent = msg; },
  };
}
