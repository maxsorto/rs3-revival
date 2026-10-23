// Uncompressed Truevision TGA (type 2), 24 or 32 bpp, BGR(A), as shipped in RS3 Tx*.mfd.
export interface Tga { width: number; height: number; rgba: Uint8ClampedArray<ArrayBuffer>; hasAlpha: boolean }
export function decodeTga(b: Uint8Array): Tga {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const idLen = b[0], type = b[2], w = dv.getUint16(12, true), h = dv.getUint16(14, true), bpp = b[16], desc = b[17];
  if (type !== 2 || (bpp !== 24 && bpp !== 32)) throw new Error(`unsupported TGA type=${type} bpp=${bpp}`);
  // Rows are kept in FILE order: the engine uploads the TGA as stored and samples v=0 at the first stored row (bottom-left origin files
  // therefore put v=0 at the picture's bottom, the OpenGL convention). Reversing rows here made every sign render upside down.
  const step = bpp >> 3, base = 18 + idLen; void desc;
  const rgba = new Uint8ClampedArray(new ArrayBuffer(w * h * 4));
  for (let y = 0; y < h; y++) {
    const srcRow = base + y * w * step;
    for (let x = 0; x < w; x++) {
      const s = srcRow + x * step, d = (y * w + x) * 4;
      rgba[d] = b[s + 2]; rgba[d + 1] = b[s + 1]; rgba[d + 2] = b[s]; rgba[d + 3] = step === 4 ? b[s + 3] : 255;
    }
  }
  return { width: w, height: h, rgba, hasAlpha: step === 4 };
}
export function tgaToImageData(t: Tga): ImageData { return new ImageData(t.rgba, t.width, t.height); }
