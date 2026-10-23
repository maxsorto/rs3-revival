#!/usr/bin/env python3
"""Annotate Ghidra decomp text from the PS2 ELF: resolve string-literal addresses passed to functions
and DAT_xxxxxxxx float/int globals to their values."""
import struct, re, sys
elf = open(sys.argv[1], 'rb').read()
# ELF32 program headers -> (vaddr, filesz, offset)
phoff = struct.unpack_from('<I', elf, 0x1c)[0]; phentsize, phnum = struct.unpack_from('<HH', elf, 0x2a)
segs = []
for i in range(phnum):
    p_type, p_offset, p_vaddr, p_paddr, p_filesz, p_memsz = struct.unpack_from('<IIIIII', elf, phoff + i * phentsize)
    if p_type == 1: segs.append((p_vaddr, p_filesz, p_offset))
def off(va):
    for v, sz, o in segs:
        if v <= va < v + sz: return o + (va - v)
    return None
def cstr(va, maxlen=96):
    o = off(va)
    if o is None: return None
    e = elf.find(b'\0', o, o + maxlen)
    if e < 0: return None
    s = elf[o:e]
    if len(s) >= 2 and all(32 <= c < 127 for c in s): return s.decode()
    return None
def f32(va):
    o = off(va); return struct.unpack_from('<f', elf, o)[0] if o is not None else None
def annotate(text):
    def rep_lit(m):
        s = cstr(int(m.group(1), 16)); return f'"{s}"' if s else m.group(0)
    # string literal addresses used as arguments: 0x2fxxxx / 0x30xxxx / 0x31xxxx in call args
    text = re.sub(r'\b(0x(?:2[e-f]|3[0-1])[0-9a-f]{4})\b', rep_lit, text)
    def rep_dat(m):
        va = int(m.group(1), 16); v = f32(va)
        if v is None: return m.group(0)
        if v != v or abs(v) > 1e12: return m.group(0)
        return f'{v:g}f/*DAT_{m.group(1)}*/'
    text = re.sub(r'\bDAT_([0-9a-f]{8})\b', rep_dat, text)
    return text
for fn in sys.argv[2:]:
    t = open(fn).read(); open(fn, 'w').write(annotate(t)); print('annotated', fn)
