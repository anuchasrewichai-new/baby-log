"""สร้างภาพเสมือนจริงของผ้าอ้อม (อึ/ฉี่) สำหรับเทียบสี — วาดขึ้นเองด้วย noise + lighting"""
import numpy as np
from PIL import Image
from scipy import ndimage as ndi
import os, sys

W, H = 480, 360
OUT = sys.argv[1] if len(sys.argv) > 1 else 'out'
os.makedirs(OUT, exist_ok=True)


def fnoise(seed, scale=8, octaves=4, w=W, h=H):
    rng = np.random.default_rng(seed)
    acc = np.zeros((h, w)); amp = 1.0; tot = 0
    for o in range(octaves):
        s = scale * (2 ** o)
        g = rng.standard_normal((int(h / w * s) + 3, s + 3))
        z = ndi.zoom(g, (h / (g.shape[0] - 3), w / (g.shape[1] - 3)), order=3)[:h, :w]
        acc += amp * z; tot += amp; amp *= 0.5
    acc /= tot
    return (acc - acc.mean()) / (acc.std() + 1e-9)


yy, xx = np.mgrid[0:H, 0:W].astype(float)


def diaper(seed=1):
    base = np.array([246, 243, 236], float)
    # quilted diamond pattern
    u = (xx + yy) / 26.0; v = (xx - yy) / 26.0
    quilt = (np.abs(np.sin(np.pi * u)) ** 0.25 * np.abs(np.sin(np.pi * v)) ** 0.25)
    fiber = fnoise(seed, 60, 3) * 0.5 + fnoise(seed + 9, 6, 2) * 0.5
    shade = 1 - 0.035 * (1 - quilt) + 0.012 * fiber
    # leg cuffs / edge shadows
    edge = np.exp(-((yy) / 26) ** 2) * 0.10 + np.exp(-((H - yy) / 26) ** 2) * 0.10
    edge += np.exp(-((xx) / 40) ** 2) * 0.06 + np.exp(-((W - xx) / 40) ** 2) * 0.06
    # soft fold
    fold = 0.025 * np.exp(-((yy - H * 0.5 - 30 * np.sin(xx / 120)) / 60) ** 2)
    shade = shade - edge - fold
    img = base[None, None, :] * shade[..., None]
    # cuff gathered elastic stripes top/bottom
    for y0 in (14, H - 14):
        band = np.exp(-((yy - y0) / 6) ** 2)
        ripple = 0.5 + 0.5 * np.sin(xx / 3.2)
        img -= (band * ripple * 14)[..., None]
    return img, quilt


def blob_mask(cx, cy, rx, ry, seed, wobble=0.35, scale=5, soft=0.04):
    d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
    n = fnoise(seed, scale, 3)
    m = d + wobble * n * 0.5
    return np.clip((1.0 - m) / soft, 0, 1)


def light(height, gloss=0.3, rough=0.0):
    gy, gx = np.gradient(height)
    nx, ny, nz = -gx * 2.2, -gy * 2.2, np.ones_like(height)
    l = np.sqrt(nx ** 2 + ny ** 2 + nz ** 2); nx, ny, nz = nx / l, ny / l, nz / l
    L = np.array([-0.45, -0.55, 0.70]); L = L / np.linalg.norm(L)
    diff = np.clip(nx * L[0] + ny * L[1] + nz * L[2], 0, 1)
    Hh = L + np.array([0, 0, 1]); Hh = Hh / np.linalg.norm(Hh)
    spec = np.clip(nx * Hh[0] + ny * Hh[1] + nz * Hh[2], 0, 1) ** (90 if gloss > 0.5 else 40)
    return diff, spec * gloss


def stain(img, mask, color, strength, seed, spread=18):
    """ความชื้นซึมรอบ ๆ เข้าเนื้อผ้าอ้อม"""
    halo = ndi.gaussian_filter(mask, spread)
    halo = halo * (1 + 0.35 * fnoise(seed + 3, 5, 2))
    halo = np.clip(halo * 3.5, 0, 1) * strength
    edge_ring = np.clip(halo - ndi.gaussian_filter(halo, 4), 0, 1) * 1.5  # tide line
    a = np.clip(halo + edge_ring * strength, 0, 1)[..., None]
    col = np.array(color, float)
    tinted = img * (col / 255.0) ** 0.9
    return img * (1 - a) + tinted * a


def paint_stool(img, mask, color, seed, gloss=0.3, var=0.12, color2=None, mix_scale=6,
                height_amt=1.0, lumpy=0.4):
    col = np.array(color, float)
    n1 = fnoise(seed + 11, mix_scale, 3)
    colmap = col[None, None, :] * (1 + var * n1[..., None])
    if color2 is not None:
        t = np.clip(fnoise(seed + 21, 4, 3) * 0.6 + 0.5, 0, 1)[..., None]
        colmap = colmap * (1 - t) + np.array(color2, float)[None, None, :] * (1 + var * n1[..., None]) * t
    hgt = ndi.gaussian_filter(mask, 12) * height_amt
    hgt = hgt * (1 + lumpy * 0.25 * fnoise(seed + 5, 5, 2)) + 0.012 * lumpy * fnoise(seed + 7, 22, 2) * mask
    hgt = ndi.gaussian_filter(hgt, 1.5)
    diff, spec = light(hgt * 30, gloss)
    shaded = colmap * (0.62 + 0.45 * diff[..., None]) + 255 * spec[..., None] * 0.55 * gloss
    # contact shadow
    sh = ndi.gaussian_filter(ndi.shift(mask, (5, 4), order=1), 6) * 0.22
    img = img * (1 - sh[..., None])
    a = mask[..., None]
    return img * (1 - a) + shaded * a


def seeds(img, mask, seed, n=140, color=(242, 222, 150), r=(1.6, 3.0)):
    rng = np.random.default_rng(seed)
    ys, xs = np.nonzero(mask > 0.9)
    if len(xs) == 0: return img
    idx = rng.choice(len(xs), size=min(n, len(xs)), replace=False)
    out = img.copy()
    for i in idx:
        cx, cy = xs[i], ys[i]; rr = rng.uniform(*r)
        d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2)
        a = np.clip((rr - d) / 1.2, 0, 1)[..., None] * 0.6
        c = np.array(color, float) * rng.uniform(0.9, 1.05)
        out = out * (1 - a) + c * a
    return out


def streaks(img, mask, seed, color=(150, 18, 22), count=4):
    rng = np.random.default_rng(seed)
    out = img.copy()
    ys, xs = np.nonzero(mask > 0.95)
    for k in range(count):
        i = rng.integers(len(xs)); x0, y0 = xs[i], ys[i]
        ang = rng.uniform(0, np.pi); L = rng.uniform(40, 90)
        t = np.linspace(0, 1, 120)
        px = x0 + np.cos(ang) * L * (t - .5) + 8 * np.sin(t * 6 + k)
        py = y0 + np.sin(ang) * L * (t - .5) + 6 * np.cos(t * 5 + k)
        line = np.zeros((H, W))
        for a, b in zip(px.astype(int), py.astype(int)):
            if 0 <= a < W and 0 <= b < H: line[b, a] = 1
        line = ndi.gaussian_filter(ndi.binary_dilation(line, iterations=rng.integers(1, 3)).astype(float), 1.2)
        line = np.clip(line * 2.5, 0, 1) * mask * (0.75 + 0.25 * fnoise(seed + k, 20, 2).clip(-1, 1))
        a = np.clip(line, 0, 1)[..., None]
        c = np.array(color, float) * (0.85 + 0.25 * fnoise(seed + 30 + k, 10, 2)[..., None])
        out = out * (1 - a) + c * a
    return out


def mucus(img, mask, seed):
    """เมือกใส มันวาว"""
    m = blob_mask(260, 175, 120, 60, seed + 50, wobble=0.9, scale=7) * (fnoise(seed + 51, 9, 3) > 0.15)
    m = ndi.gaussian_filter(m.astype(float), 2)
    diff, spec = light(ndi.gaussian_filter(m, 5) * 3, gloss=0.9)
    a = (m * 0.35)[..., None]
    tint = np.array([215, 220, 175], float)
    out = img * (1 - a) + tint * a
    out += 255 * (spec * m)[..., None] * 0.9
    return out


def save(img, name):
    # very subtle camera grain + warm tone
    img = img + fnoise(999, 120, 1)[..., None] * 1.5
    Image.fromarray(np.clip(img, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '.jpg'), quality=90)


def make_stool(name, color, seed, **kw):
    img, _ = diaper(seed)
    rx, ry = kw.pop('rx', 120), kw.pop('ry', 78)
    m = blob_mask(W / 2, H / 2 + 6, rx, ry, seed, wobble=kw.pop('wobble', 0.45))
    halo = kw.pop('halo', 0.0)
    if halo:
        img = stain(img, m, kw.pop('halo_color', color), halo, seed, kw.pop('spread', 18))
    sd = kw.pop('seeds', 0)
    st = kw.pop('streaks', 0)
    img = paint_stool(img, m, color, seed, **kw)
    if sd: img = seeds(img, m, seed, n=sd)
    if st: img = streaks(img, m, seed, count=st)
    save(img, name)


# ---------- STOOL: 11 สี ----------
make_stool('stool-01-white', (226, 225, 216), 101, gloss=0.05, var=0.05, halo=0.15, halo_color=(215, 212, 200), lumpy=0.6)
make_stool('stool-02-clay', (205, 188, 150), 102, gloss=0.05, var=0.07, halo=0.15, halo_color=(210, 198, 168), lumpy=0.7)
make_stool('stool-03-paleyellow', (236, 224, 158), 103, gloss=0.2, var=0.06, halo=0.35, halo_color=(240, 232, 180), seeds=40)
make_stool('stool-04-meconium', (34, 40, 26), 104, gloss=0.95, var=0.18, color2=(22, 30, 26), height_amt=1.3, lumpy=0.2, rx=128, ry=70, wobble=0.6)
make_stool('stool-05-transitional', (86, 78, 38), 105, gloss=0.45, var=0.15, color2=(62, 82, 40), halo=0.35, halo_color=(150, 150, 90))
make_stool('stool-06-mustard', (214, 158, 36), 106, gloss=0.4, var=0.1, halo=0.6, halo_color=(232, 196, 90), seeds=160, height_amt=0.7, rx=130, ry=80)
make_stool('stool-07-green', (108, 128, 44), 107, gloss=0.4, var=0.12, color2=(80, 110, 40), halo=0.45, halo_color=(170, 180, 100), seeds=60)
make_stool('stool-08-brown', (150, 104, 56), 108, gloss=0.3, var=0.1, halo=0.15, halo_color=(185, 150, 110), height_amt=1.2, lumpy=0.6)
make_stool('stool-09-orange', (222, 126, 38), 109, gloss=0.4, var=0.1, halo=0.5, halo_color=(236, 170, 100), seeds=90, height_amt=0.8)
make_stool('stool-10-blood', (206, 150, 42), 110, gloss=0.35, var=0.1, halo=0.45, halo_color=(228, 190, 100), seeds=60, streaks=5)
make_stool('stool-11-black', (30, 26, 24), 111, gloss=0.35, var=0.08, height_amt=1.1, lumpy=0.5, halo=0.1, halo_color=(110, 100, 95))

# ---------- ลักษณะ ----------
# เป็นน้ำ: ซึมเข้าผ้าอ้อมเป็นส่วนใหญ่ เนื้อน้อย
img, _ = diaper(201)
m = blob_mask(W / 2, H / 2, 150, 100, 201, wobble=0.3, scale=3, soft=0.3)
img = stain(img, m, (215, 175, 60), 0.95, 201, spread=10)
small = blob_mask(W / 2 + 10, H / 2, 55, 30, 202, wobble=0.9) * (fnoise(203, 10, 2) > 0.2)
img = paint_stool(img, ndi.gaussian_filter(small.astype(float), 1.5), (205, 155, 40), 202, gloss=0.6, height_amt=0.3)
save(img, 'cons-watery')

# มีมูก
img, _ = diaper(211)
m = blob_mask(W / 2, H / 2 + 6, 110, 70, 211)
img = stain(img, m, (200, 190, 90), 0.4, 211)
img = paint_stool(img, m, (150, 140, 50), 211, gloss=0.4, color2=(120, 130, 50))
img = mucus(img, m, 211)
save(img, 'cons-mucus')

# แข็งเป็นเม็ด
img, _ = diaper(221)
rng = np.random.default_rng(221)
tot = np.zeros((H, W))
for k in range(7):
    cx, cy = W / 2 + rng.uniform(-110, 110), H / 2 + rng.uniform(-60, 60)
    r = rng.uniform(16, 26)
    tot = np.maximum(tot, blob_mask(cx, cy, r, r * rng.uniform(0.8, 1.1), 230 + k, wobble=0.25, scale=3))
img = paint_stool(img, tot, (110, 72, 40), 221, gloss=0.1, var=0.15, height_amt=2.2, lumpy=1.0, color2=(90, 60, 36))
save(img, 'cons-hard')

# ---------- URINE: 5 แบบ ----------
def urine(name, color, strength, seed, powder=None):
    img, _ = diaper(seed)
    m = blob_mask(W / 2, H / 2, 175, 110, seed, wobble=0.2, scale=3, soft=0.3)
    m = ndi.gaussian_filter(m, 6)
    edge = np.clip(m - ndi.gaussian_filter(m, 8), 0, 1) * 1.2
    a = np.clip(m * strength + edge * strength * 0.6, 0, 1)
    a = a * (1 + 0.08 * fnoise(seed + 2, 10, 2))
    col = np.array(color, float)
    img = img * (1 - a[..., None]) + (img * (col / 255.0)) * a[..., None]
    if powder is not None:
        rng = np.random.default_rng(seed)
        dots = np.zeros((H, W))
        for k in range(900):
            x = int(W / 2 + rng.normal(0, 45)); y = int(H / 2 + rng.normal(0, 28))
            if 0 <= x < W and 0 <= y < H: dots[y, x] = rng.uniform(0.6, 1)
        dots = ndi.gaussian_filter(ndi.grey_dilation(dots, size=2), 0.9)
        dots = np.clip(dots * 3, 0, 1) * (0.6 + 0.4 * (fnoise(seed + 1, 6, 2) > 0))
        a = (dots * 0.85)[..., None]
        img = img * (1 - a) + np.array(powder, float) * a
    save(img, name)

urine('urine-01-clear', (240, 236, 200), 0.45, 301)
urine('urine-02-yellow', (236, 212, 120), 0.75, 302)
urine('urine-03-dark', (205, 155, 50), 0.9, 303)
urine('urine-04-urate', (238, 220, 170), 0.5, 304, powder=(214, 110, 82))
urine('urine-05-red', (222, 128, 132), 0.8, 305)
print('done', sorted(os.listdir(OUT)))
