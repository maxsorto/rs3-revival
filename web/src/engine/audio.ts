// Engine sound following the game's own sound setup (Sound.mfd BSP 0x35bd, see notes): two pitched engine layers
// (on-throttle / off-throttle) whose playback frequency runs linearly from 17000 Hz at 3140 rpm to 46000 Hz at 17000 rpm
// (the samples are 22050 Hz), a constant-pitch rumble layer, and a wind hiss by speed. Volumes are in hundredths of dB
// as in DirectSound. Samples come from the race sound bank (slots 2701 / 2705 / 2709 = exterior variants, 2801 = hiss).
import { Mfd } from '../mfd';
interface Layer { id: number; src?: AudioBufferSourceNode; gain?: GainNode; pitched: boolean }
const L1 = 0x4769, L2 = 0x476a, L3 = 0x4b03, HISS = 0x4791;
const LAYERS: Layer[] = [{ id: L1, pitched: true }, { id: L2, pitched: true }, { id: L3, pitched: false }, { id: HISS, pitched: false }];
const SAMPLE_RATE = 22050, RPM_MIN = 3140, RPM_MAX = 17000, PITCH_R0 = 17000, PITCH_RMAX = 46000, TORQUE_MAX = 360;
const db = (hundredths: number) => Math.pow(10, Math.max(-10000, hundredths) / 2000);   // hundredths of dB → gain
const lerp = (a: number, b: number, t: number) => a + (b - a) * Math.max(0, Math.min(1, t));
export class EngineAudio {
  private ctx: AudioContext | null = null; private master: GainNode | null = null; private ready = false; private buffers = new Map<number, AudioBuffer>();
  errors: string[] = []; lastRpm = 0;
  private sTorque = 0; private sRpm = 3000; private lastGear = -99; private dipUntil = 0; private dipL1 = 0; private dipL2 = 0;
  constructor(private mfd: Mfd) {}
  /** call SYNCHRONOUSLY inside a user gesture handler (iOS only unlocks audio there); decoding continues asynchronously */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC(); this.ctx = ctx;
    const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.knee.value = 12; comp.ratio.value = 4; comp.attack.value = 0.005; comp.release.value = 0.12;
    this.master = ctx.createGain(); this.master.gain.value = 0.5; this.master.connect(comp); comp.connect(ctx.destination);
    const b = ctx.createBuffer(1, 1, 22050); const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start();
    void ctx.resume();
    void this.start();
  }
  async start(): Promise<void> {
    if (!this.ctx) { this.unlock(); return; }
    const ctx = this.ctx, master = this.master; if (!master || this.ready || this.buffers.size) return;
    await Promise.all(LAYERS.map(async l => { const e = this.mfd.byId(l.id); if (!e) { this.errors.push(`${l.id.toString(16)}: missing`); return; } const bytes = this.mfd.bytes(e); const copy = new ArrayBuffer(bytes.byteLength); new Uint8Array(copy).set(bytes); try { const buf = await ctx.decodeAudioData(copy); this.buffers.set(l.id, buf); } catch (e) { this.errors.push(`${l.id.toString(16)}: ${String(e)}`); } }));
    for (const l of LAYERS) {
      const buf = this.buffers.get(l.id); if (!buf) continue;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(master); src.start(); l.src = src; l.gain = g;
    }
    this.ready = true;
  }
  /** rpm, throttle 0..1, engine output torque (Nm, negative when braking), speed m/s, gear */
  update(rpm: number, throttle: number, torque: number, speed: number, gear: number, dt = 1 / 60): void {
    this.lastRpm = rpm;
    if (!this.ready || !this.ctx) return;
    const t = this.ctx.currentTime;
    // inertia: the sound follows the mechanics with a short lag (BSP inertia.*)
    const kT = 1 - Math.exp(-dt * 15), kR = 1 - Math.exp(-dt * 10);
    this.sTorque += (torque - this.sTorque) * kT; this.sRpm += (rpm - this.sRpm) * kR;
    const T = Math.max(0, Math.min(TORQUE_MAX, this.sTorque));
    // gear change: short volume dips (gearchange.*)
    if (gear !== this.lastGear) { if (this.lastGear !== -99 && gear > 0 && this.lastGear > 0) { const up = gear > this.lastGear; this.dipUntil = t + (up ? 0.1 : 0.5); this.dipL1 = up ? -500 : -100; this.dipL2 = up ? -200 : -100; } this.lastGear = gear; }
    const dip = t < this.dipUntil;
    // pitch: linear in rpm between the two frequencies (DirectSound SetFrequency on a 22050 Hz sample)
    const x = (this.sRpm - RPM_MIN) / (RPM_MAX - RPM_MIN);
    const rate = lerp(PITCH_R0, PITCH_RMAX, x) / SAMPLE_RATE;
    // layer volumes vs torque (hundredths of dB)
    const v1 = T < 50 ? lerp(-600, -100, T / 50) : lerp(-100, 0, (T - 50) / (TORQUE_MAX - 50));
    const v2 = T < 30 ? lerp(-300, -550, T / 30) : lerp(-550, -10000, (T - 30) / (TORQUE_MAX - 30));
    const v3 = lerp(-1400, -700, x) + (throttle > 0.2 ? 0 : -300);                                   // rumble, a bit louder with revs
    const vh = speed < 10 ? -10000 : lerp(-500, 0, (speed - 10) / 100);                             // high_speed_hiss
    const vols = [v1 + (dip ? this.dipL1 : 0), v2 + (dip ? this.dipL2 : 0), v3, vh];
    LAYERS.forEach((l, i) => {
      if (!l.src || !l.gain) return;
      if (l.pitched) l.src.playbackRate.setTargetAtTime(rate, t, 0.02);
      l.gain.gain.setTargetAtTime(db(vols[i]), t, 0.04);
    });
  }
  set volume(v: number) { if (this.master) this.master.gain.value = v; }
  get state(): string { return this.ctx ? this.ctx.state : 'none'; }
  debug(): Record<string, unknown> { return { state: this.state, ready: this.ready, buffers: [...this.buffers.keys()].map(k => k.toString(16)), errors: this.errors, master: this.master?.gain.value, gains: LAYERS.map(l => l.gain ? +l.gain.gain.value.toFixed(3) : null), rates: LAYERS.map(l => l.src ? +l.src.playbackRate.value.toFixed(3) : null), lastRpm: this.lastRpm, sampleRate: this.ctx?.sampleRate }; }
  attachUnlock(): void {
    const tryUnlock = () => { this.unlock(); if (this.ctx && this.ctx.state === 'running') for (const t of types) removeEventListener(t, tryUnlock, true); };
    const types = ['touchend', 'click', 'pointerup', 'keydown'];
    for (const t of types) addEventListener(t, tryUnlock, true);
  }
}
