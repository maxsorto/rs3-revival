#!/usr/bin/env python3
"""Extract RS3 Tx*.mfd textures to PNG.
Each entry is a plain uncompressed Truevision TGA (18-byte header: u16 w @12, u16 h @14, u8 bpp @16 = 24|32; BGR(A) pixels; 26-byte footer "TRUEVISION-XFILE")."""
import struct, zlib, os, sys, collections
def png(path, w, h, data, alpha):
    bpp = 4 if alpha else 3
    raw = b''.join(b'\x00' + data[y*w*bpp:(y+1)*w*bpp] for y in range(h))
    def chunk(t, d): return struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    open(path, 'wb').write(b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6 if alpha else 2, 0, 0, 0)) + chunk(b'IDAT', zlib.compress(raw, 6)) + chunk(b'IEND', b''))
def extract(mfd, outdir):
    f = open(mfd, 'rb').read(); n = struct.unpack_from('<I', f, 0)[0]
    os.makedirs(outdir, exist_ok=True); stats = collections.Counter(); tails = collections.Counter()
    for i in range(n):
        ident, off, size = struct.unpack_from('<III', f, 4 + 12*i)
        w, h = struct.unpack_from('<HH', f, off+12); bpp = f[off+16]
        body = w*h*(bpp//8); extra = size - 18 - body
        tails[extra] += 1
        if bpp not in (24, 32) or extra < 0 or w == 0 or h == 0:
            stats['skipped'] += 1; continue
        px = bytearray(f[off+18:off+18+body]); step = bpp//8
        px[0::step], px[2::step] = px[2::step], px[0::step]  # TGA stores BGR(A)
        flip = not (f[off+17] & 0x20)  # TGA origin bit: 0 = bottom-left, so flip rows
        if flip:
            px = b''.join(px[y*w*step:(y+1)*w*step] for y in range(h-1, -1, -1))
        png(os.path.join(outdir, f'{ident:04x}_{w}x{h}.png'), w, h, bytes(px), bpp == 32)
        stats[f'{bpp}bpp'] += 1
    return stats, tails
if __name__ == '__main__':
    root = sys.argv[1]; out = sys.argv[2]
    for name in sorted(os.listdir(root)):
        if name.startswith('Tx') and name.endswith('.mfd'):
            s, t = extract(os.path.join(root, name), os.path.join(out, name[:-4]))
            print(name, dict(s), 'trailing-bytes:', dict(t))
