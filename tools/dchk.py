#!/usr/bin/env python3
"""Generic walker for Ubisoft DCHK chunk files (RS3 MMB/M3D/H3D/ZON/BSP chunks inside .mfd).
From DCHK_InputBinaryFile decomp (PS2 ELF):
  file header: 8 bytes: [0]=alignment, [1..3]=tag ('MMB','M3D',...), [7]=flag
  chunk header: u32 id, u32 size (after aligning the stream to `alignment`), then `size` bytes of content
  id bit24 (0x01000000) set -> leaf (raw data, read by a type-specific callback)
  id bit24 clear          -> container: content is a sequence of chunks
  id bit25 (0x02000000)   -> content is a reference (into a ref table) instead of inline data
  id & 0x7fffff           -> chunk type; 0x7ffffe/0x7fffff = reference tables
"""
import struct, sys
def align(p, a): return p if a <= 1 else (p + a - 1) // a * a
def walk(buf, pos, end, align_to, depth, out, maxdepth=6, limit=None):
    while pos < end:
        pos = align(pos, align_to)
        if pos + 8 > end: break
        cid, size = struct.unpack_from('<II', buf, pos)
        pos = align(pos + 8, align_to)
        leaf = bool(cid & 0x01000000); ref = bool(cid & 0x02000000); typ = cid & 0x7fffff
        out.append((depth, pos - 8, cid, typ, leaf, ref, size, buf[pos:pos+16]))
        if not leaf and depth < maxdepth and typ not in (0x7ffffe, 0x7fffff):
            walk(buf, pos, min(pos + size, end), align_to, depth + 1, out, maxdepth)
        pos += size
        if limit and len(out) > limit: break
    return out
def parse(chunk, maxdepth=6, limit=None):
    a = chunk[0]; tag = chunk[1:4].decode('latin1')
    out = walk(chunk, 8, len(chunk), a, 0, [], maxdepth, limit)
    return tag, a, out
if __name__ == '__main__':
    import os
    mfd = sys.argv[1]; want = sys.argv[2] if len(sys.argv) > 2 else None
    f = open(mfd, 'rb').read(); n = struct.unpack_from('<I', f, 0)[0]
    for i in range(n):
        ident, off, size = struct.unpack_from('<III', f, 4 + 12*i)
        if f[off] != 4: continue
        tag = f[off+1:off+4].decode('latin1')
        if want and tag != want: continue
        chunk = f[off:off+size]; tag, a, out = parse(chunk, limit=400)
        print(f"== entry id={ident:#06x} tag={tag} align={a} size={size} chunks={len(out)}")
        for depth, p, cid, typ, leaf, ref, sz, head in out[:120]:
            print(f"  {'  '*depth}@{p:7d} id={cid:#010x} type={typ:#x}{' LEAF' if leaf else ' DIR '}{' REF' if ref else ''} size={sz:8d} {head.hex(' ')}")
