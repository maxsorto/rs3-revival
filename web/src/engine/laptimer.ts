// Lap timing: a 2D beacon line (STRC_Beacon2D style) across the start/finish straight, plus sector beacons from the track sectors.
// Crossing test = the car's position changes side of the line while its projection lies within the line's extent (eArePointsSideBySide).
import { Vec3 } from './mth/vec3';
export class Beacon2D {
  // line from p0 to p1; n = unit normal in the direction of travel
  constructor(readonly p0: { x: number; y: number }, readonly p1: { x: number; y: number }, readonly n: { x: number; y: number }) {}
  static acrossTrack(center: Vec3, dir: Vec3, halfWidth = 25): Beacon2D {
    const l = Math.hypot(dir.x, dir.y) || 1, dx = dir.x / l, dy = dir.y / l;      // left = (-dy, dx)
    return new Beacon2D({ x: center.x - dy * halfWidth, y: center.y + dx * halfWidth }, { x: center.x + dy * halfWidth, y: center.y - dx * halfWidth }, { x: dx, y: dy });
  }
  side(p: { x: number; y: number }): number { return this.n.x * (p.x - this.p0.x) + this.n.y * (p.y - this.p0.y); }
  /** returns the fraction of dt at which the segment prev→cur crossed forward through the line, or -1 */
  crossed(prev: { x: number; y: number }, cur: { x: number; y: number }): number {
    const s0 = this.side(prev), s1 = this.side(cur);
    if (!(s0 < 0 && s1 >= 0)) return -1;
    const ex = this.p1.x - this.p0.x, ey = this.p1.y - this.p0.y, dx = cur.x - prev.x, dy = cur.y - prev.y;
    const den = ex * dy - ey * dx; if (den === 0) return -1;
    const t = ((cur.x - this.p0.x) * dy - dx * (cur.y - this.p0.y)) / den;   // position along the line
    if (t < 0 || t > 1) return -1;
    return s0 / (s0 - s1);
  }
}
export class LapTimer {
  lap = 0; lapStart = -1; current = 0; last = -1; best = -1; sector = 0; sectorTimes: number[] = []; lastSectors: number[] = []; bestSectors: number[] = [];
  private prev = { x: 0, y: 0 }; private t = 0; private armed = false;
  constructor(readonly finish: Beacon2D, readonly sectors: Beacon2D[]) {}
  reset(pos: Vec3) { this.prev = { x: pos.x, y: pos.y }; this.armed = true; this.lapStart = -1; this.current = 0; this.sector = 0; this.sectorTimes = []; }
  update(dt: number, pos: Vec3) {
    this.t += dt; const cur = { x: pos.x, y: pos.y };
    if (this.armed) {
      const f = this.finish.crossed(this.prev, cur);
      if (f >= 0) {
        const tc = this.t - dt * (1 - f);
        if (this.lapStart >= 0) { this.last = tc - this.lapStart; this.lastSectors = [...this.sectorTimes, this.last]; if (this.best < 0 || this.last < this.best) { this.best = this.last; this.bestSectors = this.lastSectors; } this.lap++; }
        else this.lap = Math.max(this.lap, 1);
        this.lapStart = tc; this.sector = 0; this.sectorTimes = [];
      } else if (this.lapStart >= 0 && this.sector < this.sectors.length) {
        const g = this.sectors[this.sector].crossed(this.prev, cur);
        if (g >= 0) { this.sectorTimes.push(this.t - dt * (1 - g) - this.lapStart); this.sector++; }
      }
    }
    this.current = this.lapStart >= 0 ? this.t - this.lapStart : 0;
    this.prev = cur;
  }
}
export const fmtTime = (s: number) => s < 0 ? '--:--.---' : `${Math.floor(s / 60)}:${(s % 60).toFixed(3).padStart(6, '0')}`;
