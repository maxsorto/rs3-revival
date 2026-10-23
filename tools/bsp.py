#!/usr/bin/env python3
"""Decode RS3 BSP 'variables' chunks (BSP_BSPReader): root DIR -> leaf0 u32 count, then per-variable DIR type1
{ leaf0: u16 len + name, leafN: value }. Value leaf types seen: 1 = (u32 kind, f32), 5 = curve name ref, 6 = u32 count + values."""
import struct, sys, os, json, collections
sys.path.insert(0, os.path.dirname(__file__))
from dchk import parse
def decode(chunk):
    tag, a, out = parse(chunk, maxdepth=4)
    vars_ = []; cur = None; types = collections.Counter()
    for d, p, cid, typ, leaf, ref, sz, h in out:
        p += 8
        if d == 1 and typ == 1 and not leaf: cur = {'name': None, 'type': None, 'value': None}; vars_.append(cur)
        elif d == 2 and cur is not None and leaf:
            if typ == 0:
                L = struct.unpack_from('<H', chunk, p)[0]; cur['name'] = chunk[p+2:p+2+L].decode('latin1')
            else:
                cur['type'] = typ; types[(typ, sz)] += 1
                body = chunk[p:p+sz]
                if typ == 1 and sz == 8: cur['kind'], cur['value'] = struct.unpack_from('<If', body)
                elif typ == 1:  # vector: u32 count, count x f32
                    n = struct.unpack_from('<I', body)[0]; cur['value'] = list(struct.unpack_from('<%df' % n, body, 4))
                elif typ == 2 and sz == 8: cur['kind'], cur['value'] = struct.unpack_from('<Ii', body)  # int / bool / enum
                elif typ == 5 and sz >= 16:  # sampled curve: u32 kind, u32 n, f32 xmin, f32 xmax, n x f32 y
                    k, n, x0, x1 = struct.unpack_from('<IIff', body)
                    cur['value'] = {'kind': k, 'xmin': x0, 'xmax': x1, 'y': list(struct.unpack_from('<%df' % n, body, 16))} if 16 + 4*n == sz else body.hex()
                elif typ == 6:
                    n = struct.unpack_from('<I', body)[0]; cur['value'] = list(struct.unpack_from('<%df' % n, body, 4)) if 4 + 4*n <= sz else body.hex()
                elif typ == 5:
                    L = struct.unpack_from('<H', body)[0] if sz >= 2 else 0
                    cur['value'] = body[2:2+L].decode('latin1', 'replace') if 2 + L <= sz else body.hex()
                else: cur['value'] = body.hex()
    return vars_, types
if __name__ == '__main__':
    mfd, outdir = sys.argv[1], sys.argv[2]; os.makedirs(outdir, exist_ok=True)
    f = open(mfd, 'rb').read(); n = struct.unpack_from('<I', f, 0)[0]
    alltypes = collections.Counter(); done = 0
    for i in range(n):
        ident, off, size = struct.unpack_from('<III', f, 4 + 12*i)
        if f[off:off+4] != b'\x04BSP': continue
        vars_, types = decode(f[off:off+size]); alltypes.update(types)
        json.dump(vars_, open(os.path.join(outdir, f'{ident:04x}.json'), 'w'), indent=0)
        done += 1
        if done <= 2 or size > 30000 and done < 6:
            print(f'== {ident:#06x} size={size} vars={len(vars_)}')
            for v in vars_[:12]: print('   ', v)
    print('decoded', done, 'BSP chunks; value (type,size) histogram:', alltypes.most_common(12))
