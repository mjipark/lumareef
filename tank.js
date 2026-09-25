// tank.js - The Aquarium (particle edition)
// Same visual language as the About page: a soft pastel gradient and living
// things drawn with thousands of small particles instead of solid shapes.
//
// What lives here comes from your journal:
//   every entry      -> a particle coral in the memory bed, tinted by its mood
//   bright entries   -> extra fish in the schools
//   heavy/calm ones  -> extra jellyfish drifting through
//
// Depends on globals from app.js (THREE, renderer, width, height, activeScene,
// isSubmerged) and agent.js (coralColorBySentiment). Keeps the functions the
// rest of the app calls: renderTankScene, resizeTankCamera,
// transitionToFishTank, transitionToReef, spawnChatBubble, releaseBubbles.

const tankScene = new THREE.Scene();
tankScene.background = null; // the pastel gradient comes from CSS behind the canvas
const AQUARIUM_GRADIENT = 'linear-gradient(180deg, #eef2fb 0%, #dcecee 48%, #ece3f3 100%)';

const tankCamera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
const TANK_LOOK = new THREE.Vector3(0, 0.2, 0);
function tankCameraDistance(aspect) { return aspect < 0.8 ? 14 : aspect < 1.2 ? 11 : 9; }
const tankCamBase = new THREE.Vector3(0, 0.3, tankCameraDistance(width / height));
tankCamera.position.copy(tankCamBase);
tankCamera.lookAt(TANK_LOOK);

// Kept for older code that referenced these
const tankSize = 6;
const tankHalf = 3;
const floorY = -3.1;

const rand = (a, b) => a + Math.random() * (b - a);

// Soft round particle, drawn once on a canvas
const DOT = (function () {
    const cv = document.createElement('canvas'); cv.width = cv.height = 32;
    const g = cv.getContext('2d');
    const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.75)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 32, 32);
    return new THREE.CanvasTexture(cv);
})();

// Muted pastels, a touch deeper than the background so they read clearly
const P = {
    teal: new THREE.Color(0x5fb0a7), lavender: new THREE.Color(0x9486d6), peach: new THREE.Color(0xe39a8f),
    butter: new THREE.Color(0xd9b26a), sky: new THREE.Color(0x7fa3d9), rose: new THREE.Color(0xd08fb5), mist: new THREE.Color(0xb9b3d6)
};
function soften(hex) { return new THREE.Color(hex).lerp(new THREE.Color(0x9aa0c8), 0.25); }

function pointsMaterial(size, opacity) {
    return new THREE.PointsMaterial({ size, map: DOT, vertexColors: true, transparent: true, opacity, depthWrite: false });
}
function colorArray(n, colorFn) {
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { const c = colorFn(i); arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
    return arr;
}
function makePoints(positions, colors, size, opacity) {
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    return new THREE.Points(geo, pointsMaterial(size, opacity));
}

// Journal entries (read straight from storage; journal.js loads after this file)
function readEntriesForTank() {
    try { return JSON.parse(localStorage.getItem('lumareef_entries') || '[]'); } catch (e) { return []; }
}
const tankEntries = readEntriesForTank().slice(-18);
const moodCount = { positive: 0, neutral: 0, negative: 0, mixed: 0 };
tankEntries.forEach(e => { const s = e.analysis && e.analysis.sentiment; if (moodCount[s] != null) moodCount[s]++; });

// ---- 1. Drifting plankton everywhere ------------------------------------------
const PLANKTON = 1600;
const planktonPos = new Float32Array(PLANKTON * 3);
for (let i = 0; i < PLANKTON; i++) {
    planktonPos[i * 3] = rand(-13, 13); planktonPos[i * 3 + 1] = rand(-3.5, 7); planktonPos[i * 3 + 2] = rand(-14, 4);
}
const plankton = makePoints(planktonPos, colorArray(PLANKTON, () => [P.teal, P.lavender, P.peach, P.mist][Math.floor(Math.random() * 4)]), 0.05, 0.45);
tankScene.add(plankton);

// ---- 2. A soft sand floor made of dots ------------------------------------------
const SAND = 2600;
const sandPos = new Float32Array(SAND * 3);
for (let i = 0; i < SAND; i++) {
    const x = rand(-14, 14), z = rand(-12, 3.5);
    sandPos[i * 3] = x; sandPos[i * 3 + 1] = floorY + Math.sin(x * 0.7) * 0.08 + Math.cos(z * 0.9) * 0.08; sandPos[i * 3 + 2] = z;
}
tankScene.add(makePoints(sandPos, colorArray(SAND, () => P.mist.clone().lerp(P.peach, Math.random() * 0.4)), 0.06, 0.5));

// ---- 3. Particle coral ---------------------------------------------------------------
const corals = [];
function particleCoral(x, z, color, scale, count) {
    const segs = [];
    function branch(px, py, pz, dx, dy, dz, len, depth) {
        const ex = px + dx * len, ey = py + dy * len, ez = pz + dz * len;
        segs.push([px, py, pz, ex, ey, ez]);
        if (depth <= 0) return;
        for (let b = 0; b < 2 + (depth > 2 ? 1 : 0); b++) {
            const nx = dx + rand(-0.7, 0.7), ny = dy + rand(0.1, 0.5), nz = dz + rand(-0.7, 0.7);
            const l = Math.hypot(nx, ny, nz);
            branch(ex, ey, ez, nx / l, ny / l, nz / l, len * 0.7, depth - 1);
        }
    }
    branch(0, 0, 0, 0, 1, 0, 0.55, 4);
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        const s = segs[Math.floor(Math.random() * segs.length)], f = Math.random();
        pos[i * 3] = (s[0] + (s[3] - s[0]) * f + rand(-0.03, 0.03)) * scale;
        pos[i * 3 + 1] = (s[1] + (s[4] - s[1]) * f + rand(-0.03, 0.03)) * scale;
        pos[i * 3 + 2] = (s[2] + (s[5] - s[2]) * f + rand(-0.03, 0.03)) * scale;
    }
    const tip = color.clone().lerp(new THREE.Color(0xffffff), 0.35);
    const cols = colorArray(count, i => color.clone().lerp(tip, Math.min(pos[i * 3 + 1] / (1.6 * scale), 1)));
    const pts = makePoints(pos, cols, 0.055, 0.85);
    pts.position.set(x, floorY, z);
    pts.rotation.y = rand(0, 6.28);
    tankScene.add(pts);
    corals.push({ pts, phase: rand(0, 6.28) });
    return pts;
}
// Background reef on both sides, fading into the haze
const reefPalette = [P.teal, P.lavender, P.peach, P.rose, P.sky, P.butter];
for (let i = 0; i < 16; i++) {
    const side = i % 2 ? 1 : -1;
    particleCoral(side * rand(4, 9), rand(-9, -1), reefPalette[i % reefPalette.length], rand(1.2, 2.2), 700);
}
// Memory bed: one coral per journal entry, in front
(function memoryBed() {
    const list = tankEntries.length ? tankEntries : [{}, {}, {}, {}, {}];
    list.forEach((e, i) => {
        const sentiment = e.analysis ? e.analysis.sentiment : 'neutral';
        const base = (typeof coralColorBySentiment !== 'undefined' && coralColorBySentiment[sentiment]) || 0x8fcfc8;
        const a = (i / list.length) * Math.PI * 2 + rand(-0.2, 0.2), r = rand(0.4, 2.2);
        particleCoral(Math.cos(a) * r * 1.3, 0.8 + Math.sin(a) * r * 0.6, soften(base), rand(1.4, 1.9), 900);
    });
})();

// ---- 4. Jellyfish made of particles ----------------------------------------------------
const jellies = [];
function particleJelly(r, color) {
    const BELL = 420, TENT = 360, n = BELL + TENT;
    const base = new Float32Array(n * 4); // per point: kind, a, b, c (parameters, not positions)
    for (let i = 0; i < BELL; i++) {
        base[i * 4] = 0; base[i * 4 + 1] = Math.random() * Math.PI * 2; base[i * 4 + 2] = Math.random() * Math.PI / 2; base[i * 4 + 3] = 0.93 + Math.random() * 0.07;
    }
    for (let i = BELL; i < n; i++) {
        const k = Math.floor(Math.random() * 10);
        base[i * 4] = 1; base[i * 4 + 1] = (k / 10) * Math.PI * 2; base[i * 4 + 2] = Math.random(); base[i * 4 + 3] = k % 3 === 0 ? 0.25 : 0.85;
    }
    const pos = new Float32Array(n * 3);
    const cols = colorArray(n, i => (i < BELL ? color.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.3) : color.clone().lerp(new THREE.Color(0xffffff), 0.35)));
    const pts = makePoints(pos, cols, 0.05, 0.8);
    tankScene.add(pts);
    return { pts, base, n, r, pos };
}
(function spawnJellies() {
    const colors = [P.lavender, P.rose, P.sky, P.teal];
    const count = 6 + Math.min(moodCount.negative + moodCount.neutral + moodCount.mixed, 6);
    for (let i = 0; i < count; i++) {
        const j = particleJelly(rand(0.35, 0.65), colors[i % colors.length]);
        j.pts.position.set(rand(-7, 7), rand(-2, 4.5), rand(-8, -0.5));
        j.speed = rand(0.6, 1.1); j.phase = rand(0, 6.28); j.drift = rand(-0.004, 0.004);
        jellies.push(j);
    }
})();

// ---- 5. Fish schools, each fish a tiny particle cloud -------------------------------
function fishShape(count) {
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
        let x, y, z;
        if (i < count * 0.75) {
            const u = Math.random() * Math.PI * 2, v = Math.acos(rand(-1, 1));
            x = Math.cos(u) * Math.sin(v) * 0.14; y = Math.cos(v) * 0.12; z = Math.sin(u) * Math.sin(v) * 0.32; // body along z
        } else {
            const f = Math.random(), s = rand(-1, 1);
            x = rand(-0.01, 0.01); y = s * f * 0.13; z = -0.3 - f * 0.18; // tail fan
        }
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    return pos;
}
const fishSchools = [];
(function schools() {
    const extra = Math.min(moodCount.positive, 12);
    const plans = [
        { n: 9 + Math.ceil(extra / 2), c: P.peach, rx: 5, ry: 1.2, rz: 2, cy: 0.6, speed: 0.22 },
        { n: 8 + Math.floor(extra / 2), c: P.butter, rx: 4, ry: 1.5, rz: 3, cy: 2, speed: -0.18 },
        { n: 7, c: P.sky, rx: 6, ry: 0.8, rz: 2.5, cy: -1, speed: 0.14 }
    ];
    plans.forEach(p => {
        const members = [];
        for (let i = 0; i < p.n; i++) {
            const pts = makePoints(fishShape(70), colorArray(70, () => p.c.clone().lerp(new THREE.Color(0xffffff), Math.random() * 0.3)), 0.045, 0.9);
            const s = rand(0.8, 1.2); pts.scale.setScalar(s);
            tankScene.add(pts);
            members.push({ mesh: pts, off: new THREE.Vector3(rand(-0.6, 0.6), rand(-0.35, 0.35), rand(-0.6, 0.6)), lag: rand(0, 0.25) });
        }
        fishSchools.push({ plan: p, members, t: rand(0, 6.28) });
    });
})();

// ---- 6. A column of rising bubbles --------------------------------------------------
const BUBBLES = 140;
const bubblePos = new Float32Array(BUBBLES * 3);
for (let i = 0; i < BUBBLES; i++) { bubblePos[i * 3] = 5.5; bubblePos[i * 3 + 1] = rand(floorY, 6.5); bubblePos[i * 3 + 2] = rand(-0.4, 0.4); }
const bubbleColumn = makePoints(bubblePos, colorArray(BUBBLES, () => new THREE.Color(0xffffff).lerp(P.sky, 0.3)), 0.12, 0.8);
tankScene.add(bubbleColumn);

// ---- 7. Your chat messages rise as bubbles --------------------------------------------
const chatBubbles = [];
function truncateLabel(text, maxWords = 7) {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(' ') + '…';
}
function bubbleMesh(radius, opacity) {
    const m = new THREE.Mesh(new THREE.SphereGeometry(radius, 16, 12),
        new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity, depthWrite: false }));
    const ring = new THREE.Mesh(new THREE.RingGeometry(radius * 0.92, radius, 24),
        new THREE.MeshBasicMaterial({ color: 0x9486d6, transparent: true, opacity: 0.5, depthWrite: false, side: THREE.DoubleSide }));
    m.add(ring);
    m.userData.ring = ring;
    return m;
}
function spawnChatBubble(messageText) {
    const bubble = bubbleMesh(rand(0.1, 0.15), 0.55);
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

// Tap the water: a little burst of bubbles rises from that spot
const looseBubbles = [];
function releaseBubbles(clientX, clientY) {
    const ndc = new THREE.Vector3((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1, 0.5);
    ndc.unproject(tankCamera);
    const dir = ndc.sub(tankCamera.position).normalize();
    const at = tankCamera.position.clone().add(dir.multiplyScalar((tankCamera.position.z - 1) / Math.max(-dir.z, 0.2)));
    for (let i = 0; i < 9; i++) {
        const m = bubbleMesh(rand(0.03, 0.08), 0.6);
        m.position.set(at.x + rand(-0.2, 0.2), at.y + rand(-0.2, 0.2), at.z + rand(-0.2, 0.2));
        tankScene.add(m);
        looseBubbles.push({ mesh: m, speed: rand(0.015, 0.035), phase: rand(0, 6.28), life: 0 });
    }
}

(function buildAquariumLabel() {
    const el = document.createElement('div');
    el.id = 'aquarium-overlay';
    el.innerHTML = '<div class="aq-label mono">Tap the water to release bubbles</div>';
    document.body.appendChild(el);
})();

// ---- 8. Render loop ------------------------------------------------------------------
const tankClock = new THREE.Clock();
const tmpV = new THREE.Vector3();
function renderTankScene() {
    const t = tankClock.getElapsedTime();
    const box = document.getElementById('canvas-container');
    if (box && box.style.background !== AQUARIUM_GRADIENT) box.style.background = AQUARIUM_GRADIENT;

    const px = window.LumaSky ? window.LumaSky.parallaxX : 0;
    const py = window.LumaSky ? window.LumaSky.parallaxY : 0;
    tankCamera.position.set(
        tankCamBase.x + px * 0.9 + Math.sin(t * 0.07) * 0.4,
        tankCamBase.y - py * 0.5 + Math.sin(t * 0.11) * 0.15,
        tankCamBase.z
    );
    tankCamera.lookAt(TANK_LOOK);

    // Plankton drifts up and sideways
    const pp = plankton.geometry.attributes.position.array;
    for (let i = 0; i < pp.length; i += 3) {
        pp[i + 1] += 0.0025 + (i % 5) * 0.0004;
        pp[i] += Math.sin(t * 0.4 + i) * 0.0012;
        if (pp[i + 1] > 7) pp[i + 1] = -3.5;
    }
    plankton.geometry.attributes.position.needsUpdate = true;

    corals.forEach(c => { c.pts.rotation.z = Math.sin(t * 0.6 + c.phase) * 0.03; });

    // Jellyfish: rebuild each point from its parameters, so the bell squeezes
    // and the tentacles trail and wave
    jellies.forEach(j => {
        const pulse = Math.max(Math.sin(t * 1.4 * j.speed + j.phase), 0);
        const squeeze = 1 - pulse * 0.2, lift = 1 + pulse * 0.12;
        const b = j.base, pos = j.pos, r = j.r;
        for (let i = 0; i < j.n; i++) {
            if (b[i * 4] === 0) {
                const u = b[i * 4 + 1], v = b[i * 4 + 2], k = b[i * 4 + 3] * r;
                pos[i * 3] = Math.cos(u) * Math.sin(v) * k * squeeze;
                pos[i * 3 + 1] = Math.cos(v) * k * 0.8 * lift;
                pos[i * 3 + 2] = Math.sin(u) * Math.sin(v) * k * squeeze;
            } else {
                const a = b[i * 4 + 1], f = b[i * 4 + 2], rad = b[i * 4 + 3] * r * squeeze;
                const wave = Math.sin(t * 2 + a * 3 + f * 5) * 0.12 * f;
                pos[i * 3] = Math.cos(a) * rad * (1 - f * 0.3) + wave;
                pos[i * 3 + 1] = -f * r * 3 * (0.9 + pulse * 0.1);
                pos[i * 3 + 2] = Math.sin(a) * rad * (1 - f * 0.3) + Math.cos(t * 1.7 + a + f * 4) * 0.08 * f;
            }
        }
        j.pts.geometry.attributes.position.needsUpdate = true;
        j.pts.position.y += (0.003 + pulse * 0.01) * j.speed;
        j.pts.position.x += j.drift;
        j.pts.rotation.z = Math.sin(t * 0.3 + j.phase) * 0.12;
        if (j.pts.position.y > 6.5) { j.pts.position.y = -4.5; j.pts.position.x = rand(-7, 7); }
    });

    // Fish follow looping paths; each trails the leader a little
    fishSchools.forEach(sc => {
        const p = sc.plan;
        sc.members.forEach(m => {
            const tt = t * p.speed + sc.t - m.lag;
            tmpV.set(Math.sin(tt) * p.rx + m.off.x, p.cy + Math.sin(tt * 2.1) * p.ry * 0.5 + m.off.y, Math.cos(tt) * p.rz - 1 + m.off.z);
            const dir = tmpV.clone().sub(m.mesh.position);
            m.mesh.position.copy(tmpV);
            if (dir.lengthSq() > 1e-8) m.mesh.lookAt(tmpV.clone().add(dir));
        });
    });

    const bp = bubbleColumn.geometry.attributes.position.array;
    for (let i = 0; i < bp.length; i += 3) {
        bp[i + 1] += 0.028 + (i % 7) * 0.002;
        bp[i] = 5.5 + Math.sin(t * 3 + i) * 0.16;
        if (bp[i + 1] > 6.5) bp[i + 1] = floorY;
    }
    bubbleColumn.geometry.attributes.position.needsUpdate = true;

    for (let i = looseBubbles.length - 1; i >= 0; i--) {
        const b = looseBubbles[i];
        b.life++;
        b.mesh.position.y += b.speed;
        b.mesh.position.x += Math.sin(t * 4 + b.phase) * 0.006;
        b.mesh.userData.ring.lookAt(tankCamera.position);
        if (b.mesh.position.y > 6 || b.life > 400) { tankScene.remove(b.mesh); looseBubbles.splice(i, 1); }
    }
    for (let i = chatBubbles.length - 1; i >= 0; i--) {
        const b = chatBubbles[i];
        b.mesh.position.y += b.speed;
        b.mesh.position.x += Math.sin(t * 0.8 + b.swayOffset) * 0.002;
        b.mesh.userData.ring.lookAt(tankCamera.position);
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

// ---- 9. Transitions -------------------------------------------------------------------
function transitionToFishTank() {
    const fadeOverlay = document.getElementById('scene-fade');
    fadeOverlay.classList.add('active');
    setTimeout(() => {
        activeScene = 'tank';
        document.body.classList.add('in-aquarium');
        document.body.classList.remove('diving');
        setTimeout(() => fadeOverlay.classList.remove('active'), 80);
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
        document.body.classList.remove('in-aquarium', 'diving');
        setTimeout(() => fadeOverlay.classList.remove('active'), 80);
        if (typeof closeAllPanels === 'function') closeAllPanels();
        if (typeof updateIslandUI === 'function') {
            updateIslandUI({ title: 'Your Reef', status: 'Swipe to explore your memories' });
        }
    }, 800);
}
