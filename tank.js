// tank.js - The Aquarium of Echoes
// After diving below the reef you arrive at a public-aquarium viewing window:
// deep blue water, light shafts from the surface, reef walls on both sides,
// schools of fish, drifting jellyfish, a bubble column, and a bed of coral in
// the middle grown from your own journal entries.
//
// Your entries shape what lives here:
//   every entry      -> a coral in the memory bed, tinted by its mood
//   bright entries   -> extra fish in the schools
//   heavy/calm ones  -> extra jellyfish drifting in the blue
//
// Depends on globals from app.js (loaded first): THREE, renderer, width,
// height, activeScene, isSubmerged. Depends on agent.js for spawnCoral and
// coralColorBySentiment. Keeps the same public functions the rest of the app
// calls: renderTankScene, resizeTankCamera, transitionToFishTank,
// transitionToReef, spawnChatBubble.

const tankScene = new THREE.Scene();
const WATER_DEEP = 0xa9cfe6;
const WATER_FOG = 0xb4dbe8;   // pastel aqua haze
tankScene.background = new THREE.Color(WATER_DEEP);
tankScene.fog = new THREE.Fog(WATER_FOG, 8, 26);

const tankCamera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
const TANK_LOOK = new THREE.Vector3(0, 0.2, 0);
function tankCameraDistance(aspect) { return aspect < 0.8 ? 14 : aspect < 1.2 ? 11 : 9; }
let tankCamBase = new THREE.Vector3(0, 0.3, tankCameraDistance(width / height));
tankCamera.position.copy(tankCamBase);
tankCamera.lookAt(TANK_LOOK);

// Kept for older code that referenced the cube's size
const tankSize = 6;
const tankHalf = 3;
const floorY = -3.1;

// ---- Shared helpers ----------------------------------------------------------
function tankGradientTexture(stops, w = 4, h = 256, horizontal = false) {
    const cv = document.createElement('canvas');
    cv.width = horizontal ? h : w; cv.height = horizontal ? w : h;
    const g = cv.getContext('2d');
    const grd = horizontal ? g.createLinearGradient(0, 0, h, 0) : g.createLinearGradient(0, 0, 0, h);
    stops.forEach(([o, c]) => grd.addColorStop(o, c));
    g.fillStyle = grd; g.fillRect(0, 0, cv.width, cv.height);
    return new THREE.CanvasTexture(cv);
}
const TANK_GLOW = (function () {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.3, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    return new THREE.CanvasTexture(cv);
})();
const rand = (a, b) => a + Math.random() * (b - a);

// Journal entries (read straight from storage; journal.js loads after this file)
function readEntriesForTank() {
    try { return JSON.parse(localStorage.getItem('lumareef_entries') || '[]'); } catch (e) { return []; }
}
const tankEntries = readEntriesForTank().slice(-24);
const moodCount = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
tankEntries.forEach(e => { const s = e.analysis && e.analysis.sentiment; if (moodCount[s] != null) moodCount[s]++; });

// ---- 1. Light ----------------------------------------------------------------
tankScene.add(new THREE.HemisphereLight(0xffffff, 0xb5b9e6, 0.78));
const tankSun = new THREE.DirectionalLight(0xfff3e6, 0.55);
tankSun.position.set(-2, 10, 4);
tankScene.add(tankSun);
const tankRim = new THREE.PointLight(0xffd6ec, 0.6, 18);
tankRim.position.set(0, 2, 3);
tankScene.add(tankRim);

// ---- 2. Backdrop: brighter water near the surface, deep blue below ----------
const backdrop = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 40),
    new THREE.MeshBasicMaterial({
        map: tankGradientTexture([[0, '#eefaf7'], [0.3, '#c4ecec'], [0.65, '#a6cfe9'], [1, '#a8b2e6']]), // mint -> aqua -> lavender
        fog: false
    })
);
backdrop.position.set(0, 2, -22);
tankScene.add(backdrop);

// Light shafts from the surface
const shaftTex = tankGradientTexture([[0, 'rgba(255,255,255,0.7)'], [0.6, 'rgba(255,255,255,0.15)'], [1, 'rgba(255,255,255,0)']]);
const shafts = [];
for (let i = 0; i < 7; i++) {
    const m = new THREE.Mesh(
        new THREE.PlaneGeometry(rand(0.8, 2.2), 16),
        new THREE.MeshBasicMaterial({ map: shaftTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: rand(0.25, 0.5), fog: false, side: THREE.DoubleSide })
    );
    m.position.set(rand(-9, 9), 4, rand(-12, -3));
    m.rotation.z = rand(-0.35, -0.15);
    tankScene.add(m);
    shafts.push({ mesh: m, base: m.material.opacity, phase: rand(0, 6.28), x: m.position.x });
}

// ---- 3. Sand floor + rocks ---------------------------------------------------
const sand = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40, 40, 20),
    new THREE.MeshLambertMaterial({ color: 0xe9dac6 }) // pastel cream sand
);
sand.rotation.x = -Math.PI / 2;
sand.position.y = floorY;
(function rippleSand() {
    const p = sand.geometry.attributes.position;
    for (let i = 0; i < p.count; i++) p.setZ(i, Math.sin(p.getX(i) * 0.9) * 0.05 + Math.cos(p.getY(i) * 1.3) * 0.05);
    sand.geometry.computeVertexNormals();
})();
tankScene.add(sand);

function rock(x, y, z, s, color = 0xbdb6dc) {
    const m = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), new THREE.MeshLambertMaterial({ color, flatShading: true }));
    m.position.set(x, y, z);
    m.rotation.set(rand(0, 3), rand(0, 3), rand(0, 3));
    m.scale.y = rand(0.7, 1.1);
    tankScene.add(m);
    return m;
}

// ---- 4. Coral kit --------------------------------------------------------------
const REEF_COLORS = [0xf7b3d0, 0xffbf9e, 0xc4aef2, 0x96e0d4, 0xe3ee9c, 0xa6caf6, 0xfad4b0, 0xffadbf, 0xb2ebc2]; // pastel reef
const swayers = []; // anemone tentacles etc. that sway each frame

function brainCoral(x, y, z, s, color) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s, 1), new THREE.MeshLambertMaterial({ color, flatShading: true }));
    m.position.set(x, y, z); m.scale.y = 0.75;
    tankScene.add(m);
}
function fanCoral(x, y, z, s, color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color, flatShading: true, side: THREE.DoubleSide });
    for (let i = 0; i < 7; i++) {
        const blade = new THREE.Mesh(new THREE.BoxGeometry(0.05 * s, s * rand(0.7, 1.2), 0.05 * s), mat);
        const a = (i / 6 - 0.5) * 1.3;
        blade.position.set(Math.sin(a) * s * 0.4, s * 0.5, 0);
        blade.rotation.z = -a * 0.8;
        g.add(blade);
    }
    g.position.set(x, y, z); g.rotation.y = rand(0, 3);
    tankScene.add(g);
    swayers.push({ obj: g, amp: 0.05, speed: rand(0.6, 1.1), phase: rand(0, 6.28), axis: 'z' });
}
function anemone(x, y, z, s, color) {
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color });
    const tipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).lerp(new THREE.Color(0xffffff), 0.5) });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * s, 0.3 * s, 0.25 * s, 10), mat);
    g.add(base);
    for (let i = 0; i < 18; i++) {
        const t = new THREE.Group();
        const len = rand(0.35, 0.6) * s;
        const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.02 * s, 0.035 * s, len, 5), mat);
        stalk.position.y = len / 2;
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.045 * s, 6, 6), tipMat);
        tip.position.y = len;
        t.add(stalk); t.add(tip);
        const a = rand(0, 6.28), r = rand(0, 0.2) * s;
        t.position.set(Math.cos(a) * r, 0.1 * s, Math.sin(a) * r);
        t.rotation.set(rand(-0.5, 0.5), 0, rand(-0.5, 0.5));
        g.add(t);
        swayers.push({ obj: t, amp: 0.25, speed: rand(0.8, 1.4), phase: rand(0, 6.28), axis: 'x', base: t.rotation.x });
    }
    g.position.set(x, y, z);
    tankScene.add(g);
}
function reefCluster(cx, cz, spread, count) {
    for (let i = 0; i < count; i++) {
        const x = cx + rand(-spread, spread), z = cz + rand(-spread * 0.8, spread * 0.8);
        const h = rand(0.4, 1.6);
        rock(x, floorY + h * 0.4, z, rand(0.4, 0.9));
        const top = floorY + h * 0.7;
        const color = REEF_COLORS[Math.floor(Math.random() * REEF_COLORS.length)];
        const kind = Math.random();
        if (kind < 0.35) spawnCoral({ x, y: top, z }, tankScene, color, rand(1.6, 2.6));
        else if (kind < 0.55) brainCoral(x, top + 0.1, z, rand(0.25, 0.45), color);
        else if (kind < 0.75) fanCoral(x, top, z, rand(0.7, 1.2), color);
        else anemone(x, top, z, rand(0.9, 1.4), color);
    }
}
// Reef walls framing the view, like a real aquarium display
reefCluster(-6.2, -1.5, 2.2, 16);
reefCluster(6.2, -1.5, 2.2, 16);
reefCluster(-3.5, -6, 2.5, 10);
reefCluster(3.8, -7, 2.5, 10);

// ---- 5. Memory bed: one glowing coral per journal entry ----------------------
const memoryGlows = [];
(function memoryBed() {
    const list = tankEntries.length ? tankEntries : [{}, {}, {}, {}];
    list.forEach((e, i) => {
        const sentiment = e.analysis ? e.analysis.sentiment : 'neutral';
        const color = coralColorBySentiment[sentiment] || coralColorBySentiment.neutral;
        const a = (i / list.length) * Math.PI * 2 + rand(-0.2, 0.2);
        const r = rand(0.3, 1.8);
        const x = Math.cos(a) * r * 1.4, z = 0.6 + Math.sin(a) * r * 0.7;
        spawnCoral({ x, y: floorY, z }, tankScene, color, rand(1.5, 2.2));
        const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: TANK_GLOW, color: 0xffffff, transparent: true, depthWrite: false, opacity: 0.5 }));
        glow.position.set(x, floorY + 0.7, z);
        glow.scale.set(1.4, 1.4, 1);
        tankScene.add(glow);
        memoryGlows.push({ sprite: glow, phase: rand(0, 6.28) });
    });
    rock(0, floorY - 0.15, 0.6, 1.1, 0xa9a2d0);
})();

// ---- 6. Fish schools ---------------------------------------------------------
const FISH_COLORS = [[0xffa77a, 0xfff0e0], [0xffd56e, 0xfff1b8], [0x86a8ff, 0xd6e2ff], [0xb497f0, 0xe6dbff], [0xff97b3, 0xffe0e8]];
function makeFish(color, finColor, s) {
    const g = new THREE.Group();
    const bodyMat = new THREE.MeshLambertMaterial({ color, flatShading: true });
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.5, 8, 6), bodyMat);
    body.scale.set(0.45, 0.8, 1.2);
    g.add(body);
    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.5, 4), new THREE.MeshLambertMaterial({ color: finColor, flatShading: true }));
    tail.rotation.x = Math.PI / 2;
    tail.scale.set(0.3, 1, 1);
    tail.position.z = -0.75;
    g.add(tail);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.06, 6, 6), new THREE.MeshBasicMaterial({ color: 0x111111 }));
    eye.position.set(0.2, 0.12, 0.35);
    const eye2 = eye.clone(); eye2.position.x = -0.2;
    g.add(eye); g.add(eye2);
    g.scale.setScalar(s);
    g.userData.tail = tail;
    return g;
}
const fishSchools = [];
(function schools() {
    const extra = Math.min(moodCount.positive, 12);
    const plans = [
        { n: 9 + Math.ceil(extra / 3), c: FISH_COLORS[0], rx: 5, ry: 1.2, rz: 2, cy: 0.6, speed: 0.22, size: 0.28 },
        { n: 8 + Math.ceil(extra / 3), c: FISH_COLORS[1], rx: 4, ry: 1.6, rz: 3, cy: 1.8, speed: -0.18, size: 0.24 },
        { n: 5 + Math.floor(extra / 3), c: FISH_COLORS[2], rx: 6, ry: 0.8, rz: 2.5, cy: -0.8, speed: 0.14, size: 0.36 },
        { n: 4, c: FISH_COLORS[3], rx: 3, ry: 1, rz: 1.5, cy: -1.6, speed: -0.26, size: 0.22 },
        { n: 5, c: FISH_COLORS[4], rx: 5.5, ry: 1.4, rz: 2.2, cy: 2.6, speed: 0.2, size: 0.2 }
    ];
    plans.forEach(p => {
        const members = [];
        for (let i = 0; i < p.n; i++) {
            const f = makeFish(p.c[0], p.c[1], p.size * rand(0.85, 1.15));
            tankScene.add(f);
            members.push({ mesh: f, off: new THREE.Vector3(rand(-0.6, 0.6), rand(-0.35, 0.35), rand(-0.6, 0.6)), lag: rand(0, 0.25), wig: rand(0, 6.28) });
        }
        fishSchools.push({ plan: p, members, t: rand(0, 6.28) });
    });
})();

// ---- 7. Jellyfish ------------------------------------------------------------
const jellies = [];
function makeJelly(r) {
    const g = new THREE.Group();
    const bellMat = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0xf1e4ff, emissiveIntensity: 0.5, transparent: true, opacity: 0.55, side: THREE.DoubleSide, depthWrite: false });
    const bell = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), bellMat);
    g.add(bell);
    const inner = new THREE.Mesh(new THREE.SphereGeometry(r * 0.55, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2),
        new THREE.MeshBasicMaterial({ color: 0xffd3ea, transparent: true, opacity: 0.6, depthWrite: false }));
    inner.position.y = r * 0.08;
    g.add(inner);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TANK_GLOW, color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }));
    halo.scale.set(r * 4.5, r * 4.5, 1);
    halo.position.y = r * 0.3;
    g.add(halo);

    // Tentacles: thin lines whose points we re-bend every frame
    const tentacles = [];
    const tMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75, depthWrite: false });
    const count = 14, segs = 14;
    for (let i = 0; i < count; i++) {
        const a = (i / count) * Math.PI * 2;
        const arm = i % 4 === 0; // a few thicker, longer "oral arms"
        const len = r * (arm ? rand(2.4, 3.2) : rand(1.6, 2.6));
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(segs * 3), 3));
        const line = new THREE.Line(geo, tMat);
        g.add(line);
        tentacles.push({ line, a, rad: arm ? r * 0.25 : r * 0.92, len, segs, phase: rand(0, 6.28) });
    }
    return { group: g, bell, inner, tentacles, r };
}
(function spawnJellies() {
    const n = 8 + Math.min(moodCount.negative + moodCount.neutral + moodCount.mixed, 8);
    for (let i = 0; i < n; i++) {
        const j = makeJelly(rand(0.28, 0.55));
        j.group.position.set(rand(-7, 7), rand(-2, 4), rand(-9, -1.5));
        j.speed = rand(0.15, 0.3);
        j.phase = rand(0, 6.28);
        j.drift = rand(-0.1, 0.1);
        tankScene.add(j.group);
        jellies.push(j);
    }
})();

// ---- 8. Bubbles and marine snow ---------------------------------------------
function tankPoints(n, spread, color, size, opacity) {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
        pos[i * 3] = spread.x[0] + Math.random() * (spread.x[1] - spread.x[0]);
        pos[i * 3 + 1] = spread.y[0] + Math.random() * (spread.y[1] - spread.y[0]);
        pos[i * 3 + 2] = spread.z[0] + Math.random() * (spread.z[1] - spread.z[0]);
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({
        map: TANK_GLOW, color, size, transparent: true, opacity, depthWrite: false
    }));
    tankScene.add(pts);
    return pts;
}
const bubbleColumn = tankPoints(160, { x: [5.2, 5.8], y: [floorY, 6], z: [-0.5, 0.5] }, 0xffffff, 0.14, 0.9);
const marineSnow = tankPoints(420, { x: [-12, 12], y: [-3, 7], z: [-12, 4] }, 0xffffff, 0.07, 0.75);

// ---- 9. Chat bubbles: your messages rise through the water -------------------
const chatBubbles = [];
function truncateLabel(text, maxWords = 7) {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(' ') + '…';
}
function spawnChatBubble(messageText) {
    const radius = rand(0.09, 0.14);
    const bubble = new THREE.Mesh(
        new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false })
    );
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: TANK_GLOW, color: 0xffffff, transparent: true, opacity: 0.7, depthWrite: false }));
    halo.scale.set(radius * 7, radius * 7, 1);
    bubble.add(halo);
    bubble.position.set(rand(-2.5, 2.5), floorY + 0.8, rand(0, 1.5));
    tankScene.add(bubble);
    const entry = { mesh: bubble, speed: rand(0.007, 0.011), swayOffset: rand(0, 6.28), tooltip: null, label: truncateLabel(messageText) };
    chatBubbles.push(entry);
    setTimeout(() => {
        const tip = document.createElement('div');
        tip.className = 'tank-bubble-tooltip';
        tip.textContent = entry.label;
        document.body.appendChild(tip);
        entry.tooltip = tip;
        requestAnimationFrame(() => { tip.style.opacity = '1'; });
    }, 1500 + Math.random() * 800);
}
function projectTankToScreen(position) {
    const vec = position.clone().project(tankCamera);
    const canvas = document.getElementById('canvas-container');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return { x: (vec.x + 1) / 2 * rect.width + rect.left, y: -(vec.y - 1) / 2 * rect.height + rect.top };
}

// Tap/click the water: a little burst of bubbles rises from that spot
const looseBubbles = [];
function releaseBubbles(clientX, clientY) {
    const ndc = new THREE.Vector3((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1, 0.5);
    ndc.unproject(tankCamera);
    const dir = ndc.sub(tankCamera.position).normalize();
    const at = tankCamera.position.clone().add(dir.multiplyScalar((tankCamera.position.z - 1) / Math.max(-dir.z, 0.2)));
    for (let i = 0; i < 9; i++) {
        const r = rand(0.03, 0.09);
        const m = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthWrite: false }));
        m.position.set(at.x + rand(-0.2, 0.2), at.y + rand(-0.2, 0.2), at.z + rand(-0.2, 0.2));
        tankScene.add(m);
        looseBubbles.push({ mesh: m, speed: rand(0.015, 0.035), phase: rand(0, 6.28), life: 0 });
    }
}

// ---- 10. Aquarium window overlay (frame, glass sheen, visitors) --------------
(function buildAquariumOverlay() {
    const el = document.createElement('div');
    el.id = 'aquarium-overlay';
    el.innerHTML = '<div class="aq-sheen"></div><div class="aq-label mono">Tap the water to release bubbles</div>';
    document.body.appendChild(el);
})();

// ---- 11. Render loop -----------------------------------------------------------
const tankClock = new THREE.Clock();
const tmpV = new THREE.Vector3();
function renderTankScene() {
    const t = tankClock.getElapsedTime();

    // Camera: slow drift + lean toward the pointer (shared with the reef)
    const px = window.LumaSky ? window.LumaSky.parallaxX : 0;
    const py = window.LumaSky ? window.LumaSky.parallaxY : 0;
    tankCamera.position.set(
        tankCamBase.x + px * 0.9 + Math.sin(t * 0.07) * 0.4,
        tankCamBase.y - py * 0.5 + Math.sin(t * 0.11) * 0.15,
        tankCamBase.z
    );
    tankCamera.lookAt(TANK_LOOK);

    shafts.forEach(s => {
        s.mesh.material.opacity = s.base * (0.7 + Math.sin(t * 0.4 + s.phase) * 0.3);
        s.mesh.position.x = s.x + Math.sin(t * 0.15 + s.phase) * 0.6;
    });
    swayers.forEach(s => {
        const v = Math.sin(t * s.speed + s.phase) * s.amp;
        if (s.axis === 'x') s.obj.rotation.x = (s.base || 0) + v; else s.obj.rotation.z = v;
    });
    memoryGlows.forEach(g => { g.sprite.material.opacity = 0.35 + Math.sin(t * 1.2 + g.phase) * 0.15; });

    // Fish follow looping paths; each member trails the leader with an offset
    fishSchools.forEach(sc => {
        const p = sc.plan;
        sc.members.forEach(m => {
            const tt = t * p.speed + sc.t - m.lag;
            const x = Math.sin(tt) * p.rx + m.off.x;
            const y = p.cy + Math.sin(tt * 2.1) * p.ry * 0.5 + m.off.y;
            const z = Math.cos(tt) * p.rz - 1 + m.off.z;
            tmpV.set(x, y, z);
            const dir = tmpV.clone().sub(m.mesh.position);
            m.mesh.position.copy(tmpV);
            if (dir.lengthSq() > 1e-8) m.mesh.lookAt(tmpV.clone().add(dir));
            m.mesh.userData.tail.rotation.y = Math.sin(t * 9 + m.wig) * 0.5;
        });
    });

    // Jellyfish pulse: the bell squeezes, the body lifts, tentacles trail behind
    jellies.forEach(j => {
        const pulse = Math.sin(t * 1.6 * j.speed * 4 + j.phase);
        const squeeze = 1 - Math.max(pulse, 0) * 0.18;
        j.bell.scale.set(squeeze, 1 + Math.max(pulse, 0) * 0.12, squeeze);
        j.inner.scale.copy(j.bell.scale);
        j.group.position.y += (0.004 + Math.max(pulse, 0) * 0.012) * j.speed * 3;
        j.group.position.x += j.drift * 0.004;
        j.group.rotation.z = Math.sin(t * 0.3 + j.phase) * 0.12;
        if (j.group.position.y > 6) { j.group.position.y = -4.5; j.group.position.x = rand(-7, 7); }
        j.tentacles.forEach(tn => {
            const arr = tn.line.geometry.attributes.position.array;
            for (let k = 0; k < tn.segs; k++) {
                const f = k / (tn.segs - 1);
                const wave = Math.sin(t * 2 + tn.phase + f * 5) * 0.12 * f;
                arr[k * 3] = Math.cos(tn.a) * tn.rad * squeeze * (1 - f * 0.3) + wave;
                arr[k * 3 + 1] = -f * tn.len * (0.9 + Math.max(pulse, 0) * 0.1);
                arr[k * 3 + 2] = Math.sin(tn.a) * tn.rad * squeeze * (1 - f * 0.3) + Math.cos(t * 1.7 + tn.phase + f * 4) * 0.08 * f;
            }
            tn.line.geometry.attributes.position.needsUpdate = true;
        });
    });

    // Bubble column rises and wobbles; marine snow sinks slowly
    const bp = bubbleColumn.geometry.attributes.position.array;
    for (let i = 0; i < bp.length; i += 3) {
        bp[i + 1] += 0.03 + (i % 7) * 0.002;
        bp[i] = 5.5 + Math.sin(t * 3 + i) * 0.18;
        if (bp[i + 1] > 6.5) bp[i + 1] = floorY;
    }
    bubbleColumn.geometry.attributes.position.needsUpdate = true;
    const sp = marineSnow.geometry.attributes.position.array;
    for (let i = 0; i < sp.length; i += 3) {
        sp[i + 1] -= 0.0025;
        sp[i] += Math.sin(t * 0.5 + i) * 0.0008;
        if (sp[i + 1] < -3.2) sp[i + 1] = 7;
    }
    marineSnow.geometry.attributes.position.needsUpdate = true;

    for (let i = looseBubbles.length - 1; i >= 0; i--) {
        const b = looseBubbles[i];
        b.life++;
        b.mesh.position.y += b.speed;
        b.mesh.position.x += Math.sin(t * 4 + b.phase) * 0.006;
        if (b.mesh.position.y > 6 || b.life > 400) { tankScene.remove(b.mesh); looseBubbles.splice(i, 1); }
    }

    // Chat bubbles rise; their labels follow them on screen
    for (let i = chatBubbles.length - 1; i >= 0; i--) {
        const b = chatBubbles[i];
        b.mesh.position.y += b.speed;
        b.mesh.position.x += Math.sin(t * 0.8 + b.swayOffset) * 0.002;
        if (b.mesh.position.y > 4.2) {
            tankScene.remove(b.mesh);
            if (b.tooltip) { b.tooltip.style.opacity = '0'; const tip = b.tooltip; setTimeout(() => tip.remove(), 600); }
            chatBubbles.splice(i, 1);
            continue;
        }
        if (b.tooltip) {
            const s = projectTankToScreen(b.mesh.position);
            if (s) { b.tooltip.style.left = (s.x + 16) + 'px'; b.tooltip.style.top = (s.y - 20) + 'px'; }
        }
    }

    renderer.render(tankScene, tankCamera);
}

function resizeTankCamera(newWidth, newHeight) {
    tankCamera.aspect = newWidth / newHeight;
    tankCamBase.z = tankCameraDistance(tankCamera.aspect);
    tankCamera.updateProjectionMatrix();
}

// ---- 12. Transitions -----------------------------------------------------------
function setAquariumMode(on) {
    document.body.classList.toggle('in-aquarium', on);
}

function transitionToFishTank() {
    const fadeOverlay = document.getElementById('scene-fade');
    fadeOverlay.classList.add('active');
    setTimeout(() => {
        activeScene = 'tank';
        setAquariumMode(true);
        setTimeout(() => fadeOverlay.classList.remove('active'), 50);
        const talkBtn = document.getElementById('talk-to-fish-btn');
        if (talkBtn) talkBtn.classList.remove('hidden');
        if (typeof updateIslandUI === 'function') {
            updateIslandUI({ title: 'The Aquarium', status: 'Every coral here is one of your days' });
        }
    }, 800);
}

function transitionToReef() {
    const fadeOverlay = document.getElementById('scene-fade');
    fadeOverlay.classList.add('active');
    setTimeout(() => {
        activeScene = 'reef';
        isSubmerged = false;
        setAquariumMode(false);
        setTimeout(() => fadeOverlay.classList.remove('active'), 50);
        const talkBtn = document.getElementById('talk-to-fish-btn');
        if (talkBtn) talkBtn.classList.add('hidden');
        if (typeof closeAllPanels === 'function') closeAllPanels();
        const navBar = document.querySelector('.top-nav');
        const sideNav = document.querySelector('.side-nav');
        if (navBar) navBar.classList.remove('theme-dark');
        if (sideNav) sideNav.classList.remove('theme-dark');
        if (typeof updateIslandUI === 'function') {
            updateIslandUI({ title: 'Your Reef', status: 'Swipe to explore your memories' });
        }
    }, 800);
}
