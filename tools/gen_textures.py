#!/usr/bin/env python3
"""HD texture pack for Wrecking Yard.

Generates seamless (tileable) 2048x2048 surface textures with numpy: colour (albedo), normal and roughness maps for
the cinder blocks, concrete, gravel yard, grass, asphalt, roof shingles, corrugated metal, wood and the crushed-dust
pile. Tiling comes for free from FFT-filtered noise and wrap-around Voronoi cells.

    python3 tools/gen_textures.py [out_dir] [size]

Output: <name>_c.jpg (sRGB colour), <name>_n.jpg (OpenGL-style normal map), <name>_r.jpg (roughness, some materials).
"""
import os
import sys
import numpy as np
from PIL import Image, ImageDraw

OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(__file__), '..', 'public', 'tex')
N = int(sys.argv[2]) if len(sys.argv) > 2 else 2048
os.makedirs(OUT, exist_ok=True)
F = np.float32


def norm01(a):
    a = a - a.min()
    m = a.max()
    return (a / m if m > 0 else a).astype(F)


def spectral(beta, seed, lo=1.0, hi=None, aniso=(1.0, 1.0)):
    """Tileable fractal noise in [0,1]: white noise shaped by a 1/f^beta spectrum."""
    r = np.random.default_rng(seed)
    w = r.standard_normal((N, N)).astype(np.float32)
    fy = np.fft.fftfreq(N)[:, None] * N * aniso[0]
    fx = np.fft.rfftfreq(N)[None, :] * N * aniso[1]
    f = np.sqrt(fx * fx + fy * fy)
    f[0, 0] = 1.0
    amp = f ** (-beta / 2.0)
    amp[f < lo] = 0.0
    if hi:
        amp *= np.exp(-(f / hi) ** 2)
    out = np.fft.irfft2(np.fft.rfft2(w) * amp, s=(N, N))
    return norm01(out)


def worley(cells, seed):
    """Wrap-around Voronoi: (F1, F2) distances in cell units and the nearest cell id."""
    r = np.random.default_rng(seed)
    jit = r.random((cells, cells, 2)).astype(F)
    size = N / cells
    ys, xs = np.mgrid[0:N, 0:N].astype(F)
    ci = (ys // size).astype(np.int32)
    cj = (xs // size).astype(np.int32)
    F1 = np.full((N, N), 1e9, F)
    F2 = np.full((N, N), 1e9, F)
    ID = np.zeros((N, N), np.int32)
    for di in (-1, 0, 1):
        for dj in (-1, 0, 1):
            ni, nj = ci + di, cj + dj
            wi, wj = ni % cells, nj % cells
            py = (ni + jit[wi, wj, 0]) * size
            px = (nj + jit[wi, wj, 1]) * size
            d = np.hypot(ys - py, xs - px)
            idv = wi * cells + wj
            m1 = d < F1
            F2 = np.where(m1, F1, np.minimum(F2, d))
            ID = np.where(m1, idv, ID)
            F1 = np.where(m1, d, F1)
    return F1 / size, F2 / size, ID


def cellrand(ID, cells, seed, k=1):
    r = np.random.default_rng(seed)
    v = r.random((cells * cells, k)).astype(F)
    return v[ID] if k > 1 else v[ID, 0]


def normal_map(h, strength):
    dx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) * strength
    dy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) * strength
    nx, ny, nz = -dx, dy, np.ones_like(h)
    l = np.sqrt(nx * nx + ny * ny + nz * nz)
    rgb = np.stack([nx / l, ny / l, nz / l], -1) * 0.5 + 0.5
    return (rgb * 255).clip(0, 255).astype(np.uint8)


def blur(a, k=1):
    for _ in range(k):
        a = (a + np.roll(a, 1, 0) + np.roll(a, -1, 0) + np.roll(a, 1, 1) + np.roll(a, -1, 1)) / 5.0
    return a


def save(name, col, h, strength, rough=None, q=90):
    Image.fromarray((np.clip(col, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, f'{name}_c.jpg'), quality=q, optimize=True, subsampling=0)
    Image.fromarray(normal_map(h, strength)).save(os.path.join(OUT, f'{name}_n.jpg'), quality=95, optimize=True, subsampling=0)
    if rough is not None:
        Image.fromarray((np.clip(rough, 0, 1) * 255).astype(np.uint8)).save(os.path.join(OUT, f'{name}_r.jpg'), quality=88, optimize=True)
    print('wrote', name, flush=True)


def rgb(*c):
    return np.array(c, F) / 255.0


# ----------------------------------------------------------------------------- materials
def cinder():
    # 0.42 m of a cinder-block face: porous concrete, aggregate grains, air pores, subtle mottling (neutral grey so
    # each block's paint tint shows through)
    mott = spectral(2.4, 1)
    grain = spectral(0.7, 2, hi=700)
    f1, f2, idc = worley(140, 3)
    stone = (f1 < 0.45 + 0.1 * cellrand(idc, 140, 4)).astype(F)
    sb = cellrand(idc, 140, 5)
    p1, _, idp = worley(190, 6)
    pores = ((p1 < 0.16) & (cellrand(idp, 190, 7) < 0.33)).astype(F)
    pores = blur(pores, 1)
    b = 0.70 + (mott - 0.5) * 0.18 + (grain - 0.5) * 0.16 + stone * (sb - 0.5) * 0.22 - pores * 0.42
    tone = np.stack([b * 1.02, b * 1.0, b * 0.96], -1)
    h = mott * 0.5 + grain * 0.6 + stone * (1 - f1) * 0.9 - pores * 1.6
    rough = 0.86 + (grain - 0.5) * 0.12 + pores * 0.1
    save('cinder', tone, h, 3.2, rough)


def concrete():
    # 1.2 m of cast concrete: soft mottling, sand grain, bug holes, faint water stains
    mott = spectral(2.6, 11)
    stain = spectral(3.0, 12)
    grain = spectral(0.6, 13, hi=900)
    p1, _, idp = worley(160, 14)
    pores = ((p1 < 0.1) & (cellrand(idp, 160, 15) < 0.2)).astype(F)
    pores = blur(pores, 1)
    b = 0.68 + (mott - 0.5) * 0.16 + (grain - 0.5) * 0.07 - np.clip(stain - 0.62, 0, 1) * 0.45 - pores * 0.32
    tone = np.stack([b * 1.03, b * 1.01, b * 0.97], -1)
    h = mott * 0.35 + grain * 0.35 - pores * 1.2
    rough = 0.8 + (grain - 0.5) * 0.1 - np.clip(stain - 0.62, 0, 1) * 0.3
    save('concrete', tone, h, 2.2, rough)


def gravel_yard():
    # 9 m of the yard: compacted dirt with gravel of mixed colours and a few bigger stones
    dirt = spectral(2.2, 21)
    fine = spectral(0.8, 22, hi=900)
    f1, f2, ids = worley(420, 23)
    rad = 0.36 + 0.14 * cellrand(ids, 420, 24)
    stone = np.clip((rad - f1) / 0.07, 0, 1)
    pal = np.array([[128, 126, 120], [150, 143, 130], [108, 104, 98], [170, 164, 152], [118, 108, 94], [96, 98, 104]], F) / 255.0
    pick = (cellrand(ids, 420, 25) * len(pal)).astype(np.int32).clip(0, len(pal) - 1)
    sc = pal[pick] * (0.85 + 0.3 * cellrand(ids, 420, 26))[..., None]
    g1, _, idg = worley(70, 27)
    big = ((g1 < 0.28) & (cellrand(idg, 70, 28) < 0.35)).astype(F)
    bigc = np.clip((0.28 - g1) / 0.05, 0, 1) * big
    dirtc = np.stack([0.42 + 0.1 * dirt, 0.38 + 0.09 * dirt, 0.32 + 0.08 * dirt], -1) * (0.9 + 0.2 * fine)[..., None]
    col = dirtc * (1 - stone[..., None]) + sc * stone[..., None]
    col = col * (1 - bigc[..., None]) + (np.array([0.55, 0.53, 0.5], F) * (0.85 + 0.25 * fine)[..., None]) * bigc[..., None]
    wet = np.clip(spectral(3.2, 29) - 0.66, 0, 1) * 1.5
    col *= (1 - wet * 0.35)[..., None]
    h = stone * (1 - f1 / rad.clip(0.2)) * 1.2 + bigc * 2.0 + fine * 0.3 + dirt * 0.4
    rough = 0.92 - wet * 0.35
    save('yard', col, h, 2.6, rough)


def grass():
    # 4 m of lawn: thousands of individual blades over soil, darker clumps, a few dry patches and clover dots
    r = np.random.default_rng(31)
    base = spectral(2.4, 32)
    dry = np.clip(spectral(3.0, 33) - 0.6, 0, 1) * 2.0
    img = Image.new('RGB', (N, N), (52, 74, 34))
    hgt = Image.new('L', (N, N), 0)
    d = ImageDraw.Draw(img)
    dh = ImageDraw.Draw(hgt)
    n = int(260000 * (N / 2048) ** 2)
    xs, ys = r.random(n) * N, r.random(n) * N
    ang = r.random(n) * np.pi * 2
    ln = 5 + r.random(n) * 11 * (N / 2048)
    sh = r.random(n)
    for i in range(n):
        x, y = xs[i], ys[i]
        bx, by = int(x) % N, int(y) % N
        t = base[by, bx]
        dr = dry[by, bx]
        g = 0.55 + 0.45 * sh[i]
        cr = (40 + 50 * t + 70 * dr) * g
        cg = (78 + 70 * t + 40 * dr) * g
        cb = (28 + 20 * t + 10 * dr) * g
        x2, y2 = x + np.cos(ang[i]) * ln[i], y + np.sin(ang[i]) * ln[i]
        for ox in (0, -N, N) if (x < 20 or x > N - 20) else (0,):
            for oy in (0, -N, N) if (y < 20 or y > N - 20) else (0,):
                d.line([(x + ox, y + oy), (x2 + ox, y2 + oy)], fill=(int(cr), int(cg), int(cb)), width=2)
                dh.line([(x + ox, y + oy), (x2 + ox, y2 + oy)], fill=int(90 + 160 * sh[i]), width=2)
    col = np.asarray(img).astype(F) / 255.0
    h = np.asarray(hgt).astype(F) / 255.0
    # clover / tiny flowers
    f1, _, idf = worley(160, 34)
    fl = ((f1 < 0.12) & (cellrand(idf, 160, 35) < 0.06)).astype(F)
    col = col * (1 - fl[..., None]) + np.array([0.92, 0.9, 0.8], F) * fl[..., None]
    save('grass', col, blur(h, 1), 2.0, 0.9 - h * 0.15)


def asphalt():
    # 5 m of road: dark binder, exposed aggregate, hairline cracks and oil stains
    tone = spectral(2.3, 41)
    fine = spectral(0.7, 42, hi=1000)
    f1, f2, ida = worley(700, 43)
    agg = np.clip((0.34 + 0.12 * cellrand(ida, 700, 44) - f1) / 0.06, 0, 1)
    ab = 0.32 + 0.3 * cellrand(ida, 700, 45)
    c1, c2, _ = worley(7, 46)
    crack = blur(np.clip(1 - (c2 - c1) / 0.008, 0, 1) * (spectral(2.0, 47) > 0.68), 1) * 0.6
    oil = np.clip(spectral(3.4, 48) - 0.7, 0, 1) * 2.4
    b = 0.2 + (tone - 0.5) * 0.06 + (fine - 0.5) * 0.06
    b = b * (1 - agg) + ab * agg
    b = b * (1 - crack * 0.7) * (1 - oil * 0.45)
    col = np.stack([b, b * 1.01, b * 1.05], -1)
    h = agg * 0.9 + fine * 0.3 - crack * 1.5
    rough = 0.88 - oil * 0.45 - agg * 0.05
    save('asphalt', col, h, 2.4, rough)


def shingles():
    # 1 m of roof: 5 courses of 3-tab asphalt shingles, mineral granules, shadowed lower edges, keyways
    ys, xs = np.mgrid[0:N, 0:N].astype(F)
    rows = 5
    rh = N / rows
    row = (ys // rh).astype(np.int32)
    v = (ys % rh) / rh  # 0 top of course .. 1 exposed edge
    tw = N / 3.0
    off = (row % 2) * tw * 0.5
    tab = ((xs + off) // tw).astype(np.int32)
    u = ((xs + off) % tw) / tw
    r = np.random.default_rng(51)
    shade = r.random((rows, 8)).astype(F)[row % rows, tab % 8]
    gran = spectral(0.4, 52, hi=1200)
    key = (np.abs(u - 0.0) < 0.012) | (np.abs(u - 1.0) < 0.012)
    edge = np.clip((v - 0.9) / 0.1, 0, 1)
    b = 0.26 + 0.1 * shade + (gran - 0.5) * 0.22
    b = b * (1 - edge * 0.55)
    b = np.where(key, 0.08, b)
    col = np.stack([b * 0.93, b * 0.97, b * 1.05], -1)
    h = v * 0.8 + gran * 0.35 - key * 1.0 - edge * 0.4
    save('shingles', col, h, 3.8, 0.9 + (gran - 0.5) * 0.08)


def corrugated():
    # 1.2 m of galvanised corrugated sheet: 16 ridges, spangle pattern, run-off streaks, rust spots (neutral grey,
    # materials tint it)
    ys, xs = np.mgrid[0:N, 0:N].astype(F)
    ridge = np.sin(xs / N * np.pi * 2 * 16) * 0.5 + 0.5
    s1, _, ids = worley(36, 61)
    spang = cellrand(ids, 36, 62)
    streak = spectral(1.6, 63, aniso=(0.05, 1.0))
    rust = np.clip(spectral(3.2, 64) - 0.8, 0, 1) * 2.2
    rust = blur(rust * (spectral(1.4, 65) > 0.5), 2)
    b = 0.72 + (spang - 0.5) * 0.08 + (streak - 0.5) * 0.14 + (ridge - 0.5) * 0.06
    col = np.stack([b, b * 1.01, b * 1.03], -1)
    rc = np.array([0.45, 0.24, 0.12], F)
    col = col * (1 - rust[..., None]) + rc * rust[..., None]
    h = ridge * 3.0 + (streak - 0.5) * 0.1 + rust * 0.15
    rough = 0.38 + (streak - 0.5) * 0.2 + rust * 0.5
    save('metal', col, h, 4.0, rough)


def wood(name, planks, base, seed):
    # wood grain: warped growth rings + knots; optional plank seams
    ys, xs = np.mgrid[0:N, 0:N].astype(F)
    warp = spectral(2.2, seed) * 40 + spectral(1.5, seed + 1, aniso=(0.15, 1.0)) * 18
    pl = (xs // (N / planks)).astype(np.int32) if planks else np.zeros((N, N), np.int32)
    r = np.random.default_rng(seed + 2)
    ptone = r.random(max(planks, 1)).astype(F)[pl % max(planks, 1)] if planks else 0.5
    ring = np.sin((xs * (1 + 0.15 * ptone) + warp) / N * np.pi * 2 * 34) * 0.5 + 0.5
    ring = ring ** 3  # thin dark latewood lines
    fib = spectral(1.0, seed + 3, aniso=(1.0, 0.06))
    k1, _, idk = worley(6, seed + 4)
    knot = np.clip((0.12 - k1) / 0.1, 0, 1) * (cellrand(idk, 6, seed + 5) < 0.3)
    b = 0.8 - ring * 0.28 + (fib - 0.5) * 0.2 - knot * 0.4 + (ptone - 0.5) * 0.2
    col = np.stack([b * base[0], b * base[1], b * base[2]], -1)
    h = ring * 0.4 + fib * 0.6 - knot * 0.5
    if planks:
        seam = ((xs % (N / planks)) < 3).astype(F)
        col *= (1 - seam * 0.7)[..., None]
        h -= seam * 1.5
    save(name, col, h, 2.0, 0.7 + (fib - 0.5) * 0.12)


def dustpile():
    # crushed fines: angular chips over powder (neutral; the pile is coloured by the dust it holds)
    pw = spectral(1.2, 71, hi=1200)
    f1, f2, idc = worley(520, 72)
    chip = np.clip((0.3 + 0.2 * cellrand(idc, 520, 73) - f1) / 0.05, 0, 1)
    cb = 0.6 + 0.4 * cellrand(idc, 520, 74)
    b = 0.62 + (pw - 0.5) * 0.18
    b = b * (1 - chip) + cb * chip * 0.8
    col = np.stack([b, b * 0.99, b * 0.96], -1)
    h = chip * (1 - f1) * 1.2 + pw * 0.4
    save('dust', col, h, 2.6, 0.95 - chip * 0.05)


if __name__ == '__main__':
    only = set(sys.argv[3:]) if len(sys.argv) > 3 else None
    jobs = {'cinder': cinder, 'concrete': concrete, 'yard': gravel_yard, 'grass': grass, 'asphalt': asphalt, 'shingles': shingles,
            'metal': corrugated, 'pine': lambda: wood('pine', 0, (0.86, 0.66, 0.44), 81), 'floor': lambda: wood('floor', 8, (0.74, 0.52, 0.32), 91),
            'dust': dustpile}
    for k, fn in jobs.items():
        if only is None or k in only:
            fn()
