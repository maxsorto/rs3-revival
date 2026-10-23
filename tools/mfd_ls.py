#!/usr/bin/env python3
"""List entries of an RS3 .mfd container.
Layout (observed): u32 count; count x (u32 id, u32 offset, u32 size); then payloads."""
import struct, sys, os
def entries(path):
    f = open(path, 'rb').read()
    n = struct.unpack_from('<I', f, 0)[0]
    out = []
    for i in range(n):
        ident, off, size = struct.unpack_from('<III', f, 4 + 12 * i)
        out.append((ident, off, size))
    return f, out
if __name__ == '__main__':
    for p in sys.argv[1:]:
        f, es = entries(p)
        hdr = 4 + 12 * len(es)
        ok = all(0 < off < len(f) and off + size <= len(f) for _, off, size in es)
        gaps = sum(es[i+1][1] - (es[i][1] + es[i][2]) for i in range(len(es)-1))
        tail = len(f) - (es[-1][1] + es[-1][2]) if es else len(f)
        print(f"{os.path.basename(p):16s} n={len(es):5d} hdr={hdr:7d} first_off={es[0][1] if es else 0:7d} ok={ok} gaps={gaps} tail={tail}")
        if '-v' in os.environ.get('MFD_V', ''):
            pass
        for ident, off, size in es[:int(os.environ.get('MFD_SHOW', '0'))]:
            magic = f[off:off+8]
            print(f"   id={ident:#010x} off={off:#010x} size={size:9d} magic={magic!r}")
