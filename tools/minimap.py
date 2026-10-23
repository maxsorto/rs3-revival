# Render top-down minimaps of each track's MMB collision mesh (tarmac bright, run-off dim) to web/public/minimaps/N.png
import struct, sys, glob, os, json
sys.path.insert(0, os.path.dirname(__file__))
from dchk import parse
from PIL import Image, ImageDraw
out_dir = sys.argv[1]; data = sys.argv[2]
meta = {}
for fn in sorted(glob.glob(os.path.join(data, 'Tracks*.mfd'))):
    name = os.path.basename(fn)[6:-4]
    if not name.isdigit(): continue
    f = open(fn, 'rb').read(); n = struct.unpack_from('<I', f, 0)[0]
    mmb = None
    for i in range(n):
        ident, off, size = struct.unpack_from('<III', f, 4 + 12 * i)
        if b'MMB' in f[off:off + 12]: mmb = f[off:off + size]; break
    if mmb is None: continue
    tag, a, items = parse(mmb, maxdepth=3)
    leaf0 = None
    for d, p, cid, typ, leaf, ref, sz, h in items:
        if d == 1 and typ == 0 and leaf: leaf0 = (p + 8, sz); break
    p, sz = leaf0
    nv = struct.unpack_from('<I', mmb, p)[0]; verts = struct.unpack_from('<%df' % (nv * 3), mmb, p + 4); p += 4 + nv * 12
    nt = struct.unpack_from('<I', mmb, p)[0]; p += 4
    tris = [struct.unpack_from('<IIIHH', mmb, p + k * 16) for k in range(nt)]
    xs = verts[0::3]; ys = verts[1::3]
    minx, maxx, miny, maxy = min(xs), max(xs), min(ys), max(ys)
    W = 256; pad = 12; scale = (W - 2 * pad) / max(maxx - minx, maxy - miny)
    img = Image.new('RGBA', (W, W), (0, 0, 0, 0)); dr = ImageDraw.Draw(img)
    cx = (minx + maxx) / 2; cy = (miny + maxy) / 2
    def P(i): return ((xs[i] - cx) * scale + W / 2, -(ys[i] - cy) * scale + W / 2)   # y up on the map (right-handed, clockwise lap)
    for a_, b_, c_, mat, fl in sorted(tris, key=lambda t: t[3] in (1, 2)):
        col = (235, 235, 235, 255) if mat in (1, 2) else (90, 110, 80, 160)
        dr.polygon([P(a_), P(b_), P(c_)], fill=col)
    img.save(os.path.join(out_dir, f'{name}.png'))
    meta[name] = {'bbox': [minx, miny, maxx, maxy], 'tris': nt}
    print(name, nt, 'tris')
json.dump(meta, open(os.path.join(out_dir, 'meta.json'), 'w'))
