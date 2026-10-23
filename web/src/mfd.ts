// RS3 .mfd container: u32 count; count x { u32 id, u32 offset, u32 size }; payloads.
export interface MfdEntry { id: number; offset: number; size: number }
export class Mfd {
  readonly entries: MfdEntry[] = [];
  readonly buf: ArrayBuffer; readonly name: string;
  constructor(buf: ArrayBuffer, name = '') {
    this.buf = buf; this.name = name;
    const dv = new DataView(buf);
    const n = dv.getUint32(0, true);
    for (let i = 0; i < n; i++) {
      const o = 4 + 12 * i;
      this.entries.push({ id: dv.getUint32(o, true), offset: dv.getUint32(o + 4, true), size: dv.getUint32(o + 8, true) });
    }
  }
  /** fetch with byte progress (loaded, total) so the loading screen can show a real bar */
  static async load(url: string, onProgress?: (loaded: number, total: number) => void): Promise<Mfd> {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`${url}: ${r.status}`);
    if (!onProgress || !r.body) return new Mfd(await r.arrayBuffer(), url);
    const total = Number(r.headers.get('content-length') ?? 0); const reader = r.body.getReader(); const chunks: Uint8Array[] = []; let loaded = 0;
    for (;;) { const { done, value } = await reader.read(); if (done) break; chunks.push(value); loaded += value.byteLength; onProgress(loaded, total || loaded); }
    const out = new Uint8Array(loaded); let o = 0; for (const c of chunks) { out.set(c, o); o += c.byteLength; }
    onProgress(loaded, loaded);
    return new Mfd(out.buffer, url);
  }
  bytes(e: MfdEntry): Uint8Array { return new Uint8Array(this.buf, e.offset, e.size); }
  byId(id: number): MfdEntry | undefined { return this.entries.find(e => e.id === id); }
  magic(e: MfdEntry): string {
    const b = this.bytes(e);
    return b[0] === 4 ? String.fromCharCode(b[1], b[2], b[3]) : '';
  }
}
