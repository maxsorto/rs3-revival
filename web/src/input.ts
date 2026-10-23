// Player input.
// Keyboard: arrows / WASD, space = brake, Q/E = gears, R = reset.
// Touch: on-screen buttons (steer left/right on the left, GAS/BRAKE on the right), multi-touch, with a slow steering ramp like a stick.
export interface InputState { steer: number; throttle: number; brake: number; gearUp: boolean; gearDown: boolean }
export class Input {
  state: InputState = { steer: 0, throttle: 0, brake: 0, gearUp: false, gearDown: false };
  private keys = new Set<string>();
  private held = new Map<string, number>();   // on-screen button name → number of active pointers
  private tilt = false; private tiltSteer = 0; private tiltBtn: HTMLElement | null = null; private steerBtns: HTMLElement[] = [];
  readonly isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window || new URLSearchParams(location.search).has('touch');
  constructor(el: HTMLElement) {
    addEventListener('keydown', e => { this.keys.add(e.code); if (e.code === 'KeyE') this.state.gearUp = true; if (e.code === 'KeyQ') this.state.gearDown = true; });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    el.addEventListener('touchstart', e => e.preventDefault(), { passive: false });   // no scroll/zoom on the canvas
    if (this.isTouch) this.buildTouchControls();
  }
  private buildTouchControls(): void {
    const root = document.createElement('div');
    root.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:4;font-family:-apple-system,Helvetica,Arial,sans-serif;user-select:none;-webkit-user-select:none';
    const mk = (name: string, label: string, css: string, color: string) => {
      const b = document.createElement('div'); b.textContent = label;
      b.style.cssText = `position:absolute;pointer-events:auto;display:flex;align-items:center;justify-content:center;border-radius:18px;background:${color};color:#fff;font-weight:900;font-size:22px;letter-spacing:.04em;box-shadow:inset 0 0 0 2px rgba(255,255,255,.35);touch-action:none;-webkit-tap-highlight-color:transparent;${css}`;
      const on = (e: PointerEvent) => { e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ } this.held.set(name, (this.held.get(name) ?? 0) + 1); b.style.filter = 'brightness(1.35)'; };
      const off = (e: PointerEvent) => { e.preventDefault(); const n = (this.held.get(name) ?? 1) - 1; this.held.set(name, Math.max(0, n)); if (n <= 0) b.style.filter = ''; };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off); b.addEventListener('lostpointercapture', off);
      root.appendChild(b); return b;
    };
    // two-thumb landscape layout: left thumb ◀ ▶ (steer), right thumb BRAKE | GAS (gas outermost, where the thumb rests)
    const bottom = 'bottom:max(12px,env(safe-area-inset-bottom))', W = 'min(21vw,150px)', H = 'min(38vh,170px)';
    const L = 'max(12px,env(safe-area-inset-left))', R = 'max(12px,env(safe-area-inset-right))';
    this.steerBtns.push(mk('left', '◀', `left:${L};${bottom};width:${W};height:${H}`, 'rgba(40,40,40,.55)'));
    this.steerBtns.push(mk('right', '▶', `left:calc(${L} + ${W} + 8px);${bottom};width:${W};height:${H}`, 'rgba(40,40,40,.55)'));
    mk('brake', 'BRAKE', `right:calc(${R} + ${W} + 8px);${bottom};width:${W};height:${H}`, 'rgba(190,40,40,.6)');
    mk('gas', 'GAS', `right:${R};${bottom};width:${W};height:${H}`, 'rgba(30,150,70,.6)');
    // tilt steering toggle (gyroscope); iOS asks for permission inside the tap
    const tb = document.createElement('div'); tb.textContent = 'TILT: OFF';
    tb.style.cssText = `position:absolute;pointer-events:auto;left:50%;transform:translateX(-100%);margin-left:-8px;top:max(10px,env(safe-area-inset-top));padding:8px 14px;border-radius:10px;background:rgba(0,0,0,.45);border:1px solid rgba(255,255,255,.5);color:#fff;font-weight:800;font-size:13px;letter-spacing:.06em;-webkit-tap-highlight-color:transparent`;
    tb.addEventListener('click', () => { if (this.tilt) this.setTilt(false); else void this.enableTilt(); });
    root.appendChild(tb); this.tiltBtn = tb;
    let saved = false; try { saved = localStorage.getItem('rs3.tilt') === '1'; } catch { /* ignore */ }
    if (saved) tb.textContent = 'TILT: TAP TO ENABLE';
    document.body.appendChild(root);
  }
  private down(name: string): boolean { return (this.held.get(name) ?? 0) > 0; }
  private async enableTilt(): Promise<void> {
    const DOE = (window as unknown as { DeviceOrientationEvent?: { requestPermission?: () => Promise<string> } }).DeviceOrientationEvent;
    try { if (DOE?.requestPermission) { const r = await DOE.requestPermission(); if (r !== 'granted') { if (this.tiltBtn) this.tiltBtn.textContent = 'TILT: DENIED'; return; } } } catch { if (this.tiltBtn) this.tiltBtn.textContent = 'TILT: NEEDS HTTPS'; return; }
    this.setTilt(true);
  }
  private onOrient = (e: DeviceOrientationEvent) => {
    // landscape: rolling the phone like a wheel changes beta (front/back axis tilt); sign depends on which way the phone is turned
    const ang = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
    const beta = e.beta ?? 0, gamma = e.gamma ?? 0;
    let raw = Math.abs(ang) === 90 ? beta * (ang === 90 ? 1 : -1) : gamma;   // portrait: left/right tilt via gamma
    raw = Math.max(-30, Math.min(30, raw));
    const dead = 3; const v = Math.abs(raw) < dead ? 0 : (raw - Math.sign(raw) * dead) / (30 - dead);
    this.tiltSteer = -v;   // tilt right (clockwise) = steer right = negative
  };
  private setTilt(on: boolean): void {
    this.tilt = on; this.tiltSteer = 0;
    if (on) addEventListener('deviceorientation', this.onOrient); else removeEventListener('deviceorientation', this.onOrient);
    for (const b of this.steerBtns) b.style.display = on ? 'none' : 'flex';
    if (this.tiltBtn) this.tiltBtn.textContent = on ? 'TILT: ON' : 'TILT: OFF';
    try { localStorage.setItem('rs3.tilt', on ? '1' : '0'); } catch { /* ignore */ }
  }
  /** called once per frame; steering is smoothed like a stick (rate-limited) */
  poll(dt: number): InputState {
    let steerTarget = 0, throttle = 0, brake = 0;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA') || this.down('left')) steerTarget += 1;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD') || this.down('right')) steerTarget -= 1;
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW') || this.down('gas')) throttle = 1;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS') || this.keys.has('Space') || this.down('brake')) brake = 1;
    if (this.tilt) steerTarget = this.tiltSteer;
    const rate = (this.tilt ? 10 : steerTarget === 0 ? 6 : 3.5) * dt;   // buttons wind on slowly like a stick, tilt follows the hand
    this.state.steer += Math.max(-rate, Math.min(rate, steerTarget - this.state.steer));
    this.state.throttle = throttle; this.state.brake = brake;
    const s = { ...this.state }; this.state.gearUp = false; this.state.gearDown = false; return s;
  }
}
