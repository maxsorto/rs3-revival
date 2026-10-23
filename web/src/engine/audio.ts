// Engine sound: pitch-shifted loops from Sound.mfd (22 kHz PCM WAVs). Loops with a clear periodic pitch were picked by autocorrelation
// (tools: see notes). Each loop is played at playbackRate = targetFreq / loopFreq, with gains cross-faded by rpm proximity.
import { Mfd } from '../mfd';
interface Loop { id: number; f0: number; rpm: number; src?: AudioBufferSourceNode; gain?: GainNode }
// firing frequency of a V10 = rpm / 60 × 5 → loop f0 maps to an rpm band
const LOOPS: Loop[] = [
  { id: 0x4769, f0: 648, rpm: 7800 },
  { id: 0x4b04, f0: 735, rpm: 8800 },
  { id: 0x4c5e, f0: 1002, rpm: 12000 },
  { id: 0x5250, f0: 1102, rpm: 13200 },
];
export class EngineAudio {
  private ctx: AudioContext | null = null; private master: GainNode | null = null; private ready = false; private buffers = new Map<number, AudioBuffer>();
  errors: string[] = []; lastRpm = 0;
  constructor(private mfd: Mfd) {}
  /** call SYNCHRONOUSLY inside a user gesture handler (iOS only unlocks audio there); decoding continues asynchronously */
  unlock(): void {
    if (this.ctx) { if (this.ctx.state === 'suspended') void this.ctx.resume(); return; }
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = new AC(); this.ctx = ctx; this.master = ctx.createGain(); this.master.gain.value = 0.35; this.master.connect(ctx.destination);
    // iOS: play a silent buffer inside the gesture to fully unlock the output
    const b = ctx.createBuffer(1, 1, 22050); const src = ctx.createBufferSource(); src.buffer = b; src.connect(ctx.destination); src.start();
    void ctx.resume();
    void this.start();
  }
  async start(): Promise<void> {
    if (!this.ctx) { this.unlock(); return; }
    const ctx = this.ctx, master = this.master; if (!master || this.ready || this.buffers.size) return;
    await Promise.all(LOOPS.map(async l => { const e = this.mfd.byId(l.id); if (!e) return; const bytes = this.mfd.bytes(e); const copy = new ArrayBuffer(bytes.byteLength); new Uint8Array(copy).set(bytes); try { const buf = await ctx.decodeAudioData(copy); this.buffers.set(l.id, buf); } catch (e) { this.errors.push(`${l.id.toString(16)}: ${String(e)}`); } }));
    for (const l of LOOPS) {
      const buf = this.buffers.get(l.id); if (!buf) continue;
      const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true; const g = ctx.createGain(); g.gain.value = 0; src.connect(g); g.connect(master); src.start(); l.src = src; l.gain = g;
    }
    this.ready = true;
  }
  /** rpm → pitch/crossfade; throttle 0..1 → brightness (volume) */
  update(rpm: number, throttle: number): void {
    this.lastRpm = rpm;
    if (!this.ready || !this.ctx) return;
    const f = Math.max(1500, rpm) / 60 * 5; const t = this.ctx.currentTime;
    let total = 0; const w: number[] = [];
    for (const l of LOOPS) { const d = Math.abs(Math.log(Math.max(500, rpm) / l.rpm)); const wi = Math.max(0, 1 - d / 0.45); w.push(wi); total += wi; }
    LOOPS.forEach((l, i) => {
      if (!l.src || !l.gain) return;
      l.src.playbackRate.setTargetAtTime(f / l.f0, t, 0.03);
      const vol = (total > 0 ? w[i] / total : (i === 0 ? 1 : 0)) * (0.55 + 0.45 * throttle);
      l.gain.gain.setTargetAtTime(vol, t, 0.05);
    });
  }
  set volume(v: number) { if (this.master) this.master.gain.value = v; }
  get state(): string { return this.ctx ? this.ctx.state : 'none'; }
  debug(): Record<string, unknown> { return { state: this.state, ready: this.ready, buffers: [...this.buffers.keys()].map(k => k.toString(16)), errors: this.errors, master: this.master?.gain.value, gains: LOOPS.map(l => l.gain ? +l.gain.gain.value.toFixed(3) : null), rates: LOOPS.map(l => l.src ? +l.src.playbackRate.value.toFixed(3) : null), lastRpm: this.lastRpm, sampleRate: this.ctx?.sampleRate }; }
  /** attach unlock attempts to every gesture type (iOS honours touchend/click, not always pointerdown) until the context runs */
  attachUnlock(): void {
    const tryUnlock = () => { this.unlock(); if (this.ctx && this.ctx.state === 'running') for (const t of types) removeEventListener(t, tryUnlock, true); };
    const types = ['touchend', 'click', 'pointerup', 'keydown'];
    for (const t of types) addEventListener(t, tryUnlock, true);
  }
}
