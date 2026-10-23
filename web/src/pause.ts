// Pause menu: resume / restart / menu plus the control options, with a controls explainer for touch or keyboard.
export interface PauseOpts {
  isTouch: boolean;
  get: () => { autoGas: boolean; tilt: boolean; sound: boolean };
  setAutoGas: (on: boolean) => void; toggleTilt: () => Promise<boolean>; setSound: (on: boolean) => void; tiltError: () => string;
  onResume: () => void; onRestart: () => void;
}
export class PauseMenu {
  private root: HTMLElement; open = false;
  constructor(private o: PauseOpts) {
    const r = document.createElement('div'); this.root = r;
    r.style.cssText = 'position:fixed;inset:0;z-index:25;display:none;align-items:center;justify-content:center;background:rgba(4,10,24,.78);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);color:#fff;font-family:-apple-system,"Helvetica Neue",Helvetica,Arial,sans-serif;user-select:none;-webkit-user-select:none;overflow:auto';
    r.innerHTML = `<style>
      .pz{width:min(520px,92vw);max-height:92vh;overflow:auto;padding:4px}
      .pz h2{font-weight:900;font-size:clamp(26px,5vw,40px);letter-spacing:-.02em;text-transform:uppercase;margin:0 0 14px;line-height:1}
      .pz .row{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;background:rgba(255,255,255,.07);border-radius:12px;margin-bottom:8px}
      .pz .row b{display:block;font-size:14px;font-weight:800;letter-spacing:.02em}
      .pz .row small{display:block;color:#aab;font-size:12px;margin-top:2px;line-height:1.35}
      .pz .sw{flex:0 0 auto;min-width:64px;height:34px;border-radius:17px;border:0;font-weight:900;font-size:12px;letter-spacing:.08em;cursor:pointer;color:#fff;background:#3a3f4a;-webkit-tap-highlight-color:transparent}
      .pz .sw.on{background:#1f9d55}
      .pz .btns{display:flex;gap:8px;margin-top:14px}
      .pz .btns button{flex:1 1 0;height:50px;border:0;border-radius:12px;font-weight:900;font-size:15px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;-webkit-tap-highlight-color:transparent}
      .pz .go{background:#fff;color:#111}.pz .alt{background:rgba(255,255,255,.14);color:#fff}
      .pz .ctl{margin-top:14px;color:#aab;font-size:13px;line-height:1.6}
      .pz .ctl b{color:#fff}
      .pz .err{color:#f88;font-size:12px;margin-top:-4px;margin-bottom:8px}
    </style>
    <div class="pz">
      <h2>Paused</h2>
      <div class="row"><div><b>Auto gas</b><small>The car accelerates by itself. You only steer and brake. Easiest way to play.</small></div><button class="sw" id="pz-auto"></button></div>
      ${o.isTouch ? '<div class="row"><div><b>Tilt steering</b><small>Hold the phone like a wheel and tilt to steer. Hides the steer pads.</small></div><button class="sw" id="pz-tilt"></button></div><div class="err" id="pz-tilterr"></div>' : ''}
      <div class="row"><div><b>Sound</b><small>Engine, wind and gear changes.</small></div><button class="sw" id="pz-snd"></button></div>
      <div class="ctl" id="pz-ctl"></div>
      <div class="btns"><button class="go" id="pz-resume">Resume</button><button class="alt" id="pz-restart">Restart</button><button class="alt" id="pz-menu">Menu</button></div>
    </div>`;
    document.body.appendChild(r);
    r.querySelector('#pz-auto')!.addEventListener('click', () => { o.setAutoGas(!o.get().autoGas); this.sync(); });
    r.querySelector('#pz-tilt')?.addEventListener('click', () => { void o.toggleTilt().then(() => this.sync()); });
    r.querySelector('#pz-snd')!.addEventListener('click', () => { o.setSound(!o.get().sound); this.sync(); });
    r.querySelector('#pz-resume')!.addEventListener('click', () => this.hide());
    r.querySelector('#pz-restart')!.addEventListener('click', () => { o.onRestart(); this.hide(); });
    r.querySelector('#pz-menu')!.addEventListener('click', () => { location.href = '/'; });
    r.addEventListener('touchmove', e => e.stopPropagation(), { passive: true });
  }
  sync(): void {
    const s = this.o.get(); const set = (id: string, on: boolean) => { const b = this.root.querySelector<HTMLElement>(id); if (b) { b.textContent = on ? 'ON' : 'OFF'; b.classList.toggle('on', on); } };
    set('#pz-auto', s.autoGas); set('#pz-tilt', s.tilt); set('#pz-snd', s.sound);
    const te = this.root.querySelector<HTMLElement>('#pz-tilterr'); if (te) te.textContent = this.o.tiltError();
    const ctl = this.root.querySelector<HTMLElement>('#pz-ctl')!;
    ctl.innerHTML = this.o.isTouch
      ? `<b>Play sideways.</b> Left thumb: <b>◀ ▶</b> steer${s.tilt ? ' (tilt is on, so the pads are hidden)' : ''}. Right thumb: <b>BRAKE</b>${s.autoGas ? ', gas is automatic' : ' and <b>GAS</b>'}. <b>RESET</b> puts the car back on the track.`
      : `<b>↑</b> or <b>W</b> gas${s.autoGas ? ' (automatic while auto gas is on)' : ''} &nbsp; <b>↓</b> / <b>S</b> / <b>space</b> brake &nbsp; <b>← →</b> or <b>A D</b> steer &nbsp; <b>Q</b> / <b>E</b> gears &nbsp; <b>R</b> reset &nbsp; <b>Esc</b> pause`;
  }
  show(): void { this.open = true; this.sync(); this.root.style.display = 'flex'; }
  hide(): void { this.open = false; this.root.style.display = 'none'; this.o.onResume(); }
  toggle(): void { if (this.open) this.hide(); else this.show(); }
}
