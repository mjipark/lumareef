"""
build_island.py - Builds LUMA REEF's island as a real 3D model (assets/island.glb)

A hand-placed voxel island in the style of the start-screen illustration:
stepped terraces, cube-canopy trees (one in blossom), a small lit cottage,
stairs, lamps, a waterfall, a sandy rim and rocks below the waterline.

The model is written as glTF binary (.glb), so it can also be opened in
Blender, Unity, or any glTF viewer. Two meshes:
  island - every solid voxel, coloured per vertex with baked face shading
  glow   - window and lamp voxels, which the site renders as light sources

Run:  python3 model/build_island.py
"""
import json
import random
import numpy as np
import trimesh

random.seed(7)
V = 0.055  # size of one voxel in scene units

vox = {}      # (x, y, z) -> (r, g, b)
glow = {}     # emissive voxels


def hexc(h):
    h = h.lstrip('#')
    return np.array([int(h[i:i + 2], 16) for i in (0, 2, 4)], dtype=float) / 255.0


def jitter(c, amt=0.035):
    return np.clip(c * (1 + random.uniform(-amt, amt)), 0, 1)


PAL = {
    'grass': [hexc('#9dbb8f'), hexc('#a8c49a'), hexc('#93b387')],
    'grass_hi': hexc('#b7cfa6'),
    'soil': hexc('#6f8c7b'),
    'cliff': hexc('#5d7a70'),
    'cliff_dark': hexc('#4c665f'),
    'sand': hexc('#eadcc2'),
    'rock_wet': hexc('#557471'),
    'trunk': hexc('#b89a86'),
    'leaf': [hexc('#6f9a7c'), hexc('#7aa487'), hexc('#628d71')],
    'blossom': [hexc('#f2b8c9'), hexc('#f6c9d6'), hexc('#eaa6bd')],
    'mint': [hexc('#9fd4c2'), hexc('#aee0cf')],
    'wall': hexc('#f4ede2'),
    'roof': hexc('#e7a996'),
    'roof_dark': hexc('#d99582'),
    'door': hexc('#9a7f71'),
    'stone': hexc('#c9c3bd'),
    'post': hexc('#6b5f5a'),
    'water': hexc('#a9dde0'),
    'foam': hexc('#f2fbfb'),
    'flowers': [hexc('#ffffff'), hexc('#f7c0cf'), hexc('#f5dd9a'), hexc('#c9b8f0')],
    'light': hexc('#fff0c4'),
}


def put(x, y, z, c, store=vox):
    store[(x, y, z)] = jitter(c)


# ---- 1. Terrain: terraces as (x0, x1, z0, z1, top height) ----------------------
terraces = [
    (8, 31, 8, 31, 5),     # main plateau
    (12, 24, 10, 22, 8),   # upper terrace
    (27, 38, 15, 32, 3),   # lower right terrace (cottage)
    (9, 28, 31, 37, 2),    # front ledge
    (4, 9, 14, 26, 3),     # left shoulder
]
height = {}
for x0, x1, z0, z1, h in terraces:
    for x in range(x0, x1):
        for z in range(z0, z1):
            # erode the outer corners a little so the outline is less boxy
            edge = x in (x0, x1 - 1) and z in (z0, z1 - 1)
            hh = h - (1 if edge and random.random() < 0.7 else 0)
            height[(x, z)] = max(height.get((x, z), 0), hh)

footprint = set(height)


def dilate(cells, r):
    out = set(cells)
    for (x, z) in cells:
        for dx in range(-r, r + 1):
            for dz in range(-r, r + 1):
                if dx * dx + dz * dz <= r * r + 1:
                    out.add((x + dx, z + dz))
    return out


sand_ring = dilate(footprint, 2) - footprint
under = dilate(footprint, 3)

for (x, z), h in height.items():
    for y in range(1, h + 1):
        if y == h:
            put(x, y, z, random.choice(PAL['grass']))
        elif y == h - 1:
            put(x, y, z, PAL['soil'])
        else:
            put(x, y, z, PAL['cliff'] if y > 2 else PAL['cliff_dark'])
    put(x, 0, z, PAL['cliff_dark'])
for (x, z) in sand_ring:
    put(x, 0, z, PAL['sand'])
for (x, z) in under:
    for y in range(-3, 0):
        if y == -1 or random.random() < 0.85:
            put(x, y, z, PAL['rock_wet'] * (0.92 + 0.04 * y))

# ---- 2. Stairs between levels ----------------------------------------------------
for i, (x, z) in enumerate([(15, 30), (15, 29)]):   # ledge (2) -> main (5)
    for dx in range(3):
        for y in range(1, 4 + i):
            put(x + dx, y, z, PAL['stone'] if y == 3 + i else PAL['cliff'])
for i, z in enumerate([23, 22]):                     # main (5) -> upper (8)
    for dx in range(3):
        for y in range(1, 7 + i):
            put(18 + dx, y, z, PAL['stone'] if y == 6 + i else PAL['cliff'])

# ---- 3. Trees: cube canopies like the illustration -------------------------------
def tree(x, z, trunk_h, size, leaves):
    base = height.get((x, z), 0)
    for y in range(base + 1, base + 1 + trunk_h):
        for dx in range(2):
            for dz in range(2):
                put(x + dx, y, z + dz, PAL['trunk'])
    cy = base + 1 + trunk_h
    half = size // 2
    for dx in range(-half + 1, half + 1):
        for dz in range(-half + 1, half + 1):
            for dy in range(size):
                # round off the canopy's corners slightly
                corner = abs(dx - 0.5) >= half - 0.5 and abs(dz - 0.5) >= half - 0.5 and dy in (0, size - 1)
                if corner:
                    continue
                c = random.choice(leaves)
                if dy == size - 1:
                    c = c * 1.08
                put(x + dx, cy + dy, z + dz, c)
    # a small secondary cube on one side, like the art
    sx, sz = x + half + 1, z - 1
    for dx in range(2):
        for dz in range(2):
            for dy in range(2):
                put(sx + dx, cy + 1 + dy, sz + dz, random.choice(leaves))


tree(15, 13, 5, 6, PAL['leaf'])
tree(21, 12, 7, 6, PAL['leaf'])
tree(10, 24, 4, 4, PAL['leaf'])
tree(13, 18, 3, 4, PAL['blossom'])   # the one pastel tree in bloom
tree(35, 29, 3, 4, PAL['mint'])
tree(6, 17, 3, 3, PAL['leaf'])

# ---- 4. Cottage on the lower right terrace ----------------------------------------
cx0, cz0, cw, cd = 29, 18, 6, 5
base = 3
for x in range(cx0, cx0 + cw):
    for z in range(cz0, cz0 + cd):
        for y in range(base + 1, base + 5):
            wall = x in (cx0, cx0 + cw - 1) or z in (cz0, cz0 + cd - 1)
            if wall:
                put(x, y, z, PAL['wall'])
# door and glowing windows on the front (+z) and side (+x)
for y in (base + 1, base + 2):
    put(cx0 + 2, y, cz0 + cd - 1, PAL['door'])
for x in (cx0 + 4,):
    vox.pop((x, base + 3, cz0 + cd - 1), None)
    put(x, base + 3, cz0 + cd - 1, PAL['light'], glow)
vox.pop((cx0 + cw - 1, base + 3, cz0 + 2), None)
put(cx0 + cw - 1, base + 3, cz0 + 2, PAL['light'], glow)
# stepped roof
for layer in range(3):
    for x in range(cx0 - 1 + layer, cx0 + cw + 1 - layer):
        for z in range(cz0 - 1, cz0 + cd + 1):
            put(x, base + 5 + layer, z, PAL['roof'] if layer % 2 == 0 else PAL['roof_dark'])

# ---- 5. Lamps -----------------------------------------------------------------------
lamps = [(11, 33), (26, 34), (23, 20), (37, 17), (9, 15)]
for (x, z) in lamps:
    h = height.get((x, z), 0)
    for y in (h + 1, h + 2):
        put(x, y, z, PAL['post'])
    put(x, h + 3, z, PAL['light'], glow)
# stepping-stone platform in the water, with a light, like the art
for x in range(20, 24):
    for z in range(40, 43):
        put(x, 0, z, PAL['stone'])
        put(x, 1, z, PAL['stone'] if (x, z) != (21, 41) else PAL['stone'])
put(21, 2, 41, PAL['light'], glow)

# ---- 6. Waterfall down the left side of the upper terrace -------------------------
for y in range(1, 9):
    for z in (15, 16):
        put(11, y, z, PAL['water'] if y > 1 else PAL['foam'])
for z in (14, 15, 16, 17):
    put(10, 1, z, PAL['foam'])

# ---- 7. Flowers and pebbles scattered on the grass ---------------------------------
tops = [(x, h, z) for (x, z), h in height.items()]
for (x, h, z) in random.sample(tops, 26):
    if (x, h + 1, z) not in vox:
        put(x, h + 1, z, random.choice(PAL['flowers']))

# ---- Meshing: only faces that touch air, with baked shading -----------------------
FACES = {
    (1, 0, 0): (0.84, [(1, 0, 0), (1, 1, 0), (1, 1, 1), (1, 0, 1)]),
    (-1, 0, 0): (0.74, [(0, 0, 1), (0, 1, 1), (0, 1, 0), (0, 0, 0)]),
    (0, 1, 0): (1.0, [(0, 1, 0), (0, 1, 1), (1, 1, 1), (1, 1, 0)]),
    (0, -1, 0): (0.55, [(0, 0, 0), (1, 0, 0), (1, 0, 1), (0, 0, 1)]),
    (0, 0, 1): (0.9, [(1, 0, 1), (1, 1, 1), (0, 1, 1), (0, 0, 1)]),
    (0, 0, -1): (0.7, [(0, 0, 0), (0, 1, 0), (1, 1, 0), (1, 0, 0)]),
}

xs = [k[0] for k in vox]
zs = [k[2] for k in vox]
cxm, czm = (min(xs) + max(xs) + 1) / 2, (min(zs) + max(zs) + 1) / 2


def build(store, solid, shade=True):
    verts, cols, faces = [], [], []
    for (x, y, z), c in store.items():
        for (nx, ny, nz), (s, quad) in FACES.items():
            if (x + nx, y + ny, z + nz) in solid:
                continue
            # soft ambient occlusion: darken sides of voxels tucked under others
            occ = 1.0
            if shade and ny == 0 and (x, y + 1, z) in solid:
                occ = 0.9
            col = np.clip(c * (s if shade else 1.0) * occ, 0, 1)
            i0 = len(verts)
            for (qx, qy, qz) in quad:
                verts.append(((x + qx - cxm) * V, (y + qy - 1) * V, (z + qz - czm) * V))
                cols.append([*(col * 255).astype(int), 255])
            faces += [(i0, i0 + 1, i0 + 2), (i0, i0 + 2, i0 + 3)]
    m = trimesh.Trimesh(vertices=np.array(verts), faces=np.array(faces), process=False)
    m.visual = trimesh.visual.ColorVisuals(m, vertex_colors=np.array(cols, dtype=np.uint8))
    return m


solid = set(vox) | set(glow)
island = build(vox, solid)
lights = build(glow, solid, shade=False)

scene = trimesh.Scene()
scene.add_geometry(island, node_name='island', geom_name='island')
scene.add_geometry(lights, node_name='glow', geom_name='glow')
scene.export('assets/island.glb')

# Light positions (model space) for the lanterns' glow halos in atmosphere.js
light_pos = [[round((x + 0.5 - cxm) * V, 3), round((y + 0.5 - 1) * V, 3), round((z + 0.5 - czm) * V, 3)] for (x, y, z) in glow]
print('voxels:', len(vox), 'glow:', len(glow), 'triangles:', len(island.faces) + len(lights.faces))
print('LIGHTS =', json.dumps(light_pos))
