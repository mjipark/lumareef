// about.js - The About page as a scroll story
// A cloud of glowing plankton morphs from one shape to the next as you scroll
// through the chapters: a drop -> an island -> a jellyfish -> coral -> a fish
// -> a heart. Uses its own small renderer, which only runs while the About
// page is open.
//
// Also handles the start screen's "Enter with / without sound" choice and the
// sound toggle.

(function aboutStory() {
    const page = document.getElementById('about-page');
    const canvas = document.getElementById('about-canvas');
    if (!page || !canvas || typeof THREE === 'undefined') return;

    const N = window.innerWidth < 700 ? 2200 : 3600;
    const R = (a, b) => a + Math.random() * (b - a);

    // ---- Shapes: each returns N points (x, y, z) roughly within radius 1.8 ----
    function sphere() {
        const out = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            const y = 1 - (i / (N - 1)) * 2, r = Math.sqrt(1 - y * y), th = i * 2.39996;
            const k = 1.35 * (0.85 + Math.random() * 0.15);
            out.set([Math.cos(th) * r * k, y * k * 1.12 - 0.05, Math.sin(th) * r * k], i * 3);
        }
        return out;
    }
    function island() {
        // Voxel island: a stepped block with a tree on top, like the reef
        const out = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            const pick = Math.random();
            let x, y, z;
            if (pick < 0.62) { // main block surfaces
                const face = Math.floor(Math.random() * 3);
                x = R(-1.2, 1.2); y = R(-0.9, 0.2); z = R(-1.2, 1.2);
                if (face === 0) y = 0.2; else if (face === 1) x = Math.sign(x) * 1.2; else z = Math.sign(z) * 1.2;
            } else if (pick < 0.8) { // terrace
                x = R(0.4, 1.8); y = R(-0.9, -0.3); z = R(0.2, 1.3);
                if (Math.random() < 0.5) y = -0.3;
            } else if (pick < 0.86) { // trunk
                x = R(-0.55, -0.4); y = R(0.2, 0.9); z = R(-0.55, -0.4);
            } else { // canopy cube
                x = R(-0.95, 0); y = R(0.9, 1.7); z = R(-0.95, 0);
                const f = Math.floor(Math.random() * 3);
                if (f === 0) y = Math.random() < 0.5 ? 0.9 : 1.7; else if (f === 1) x = Math.random() < 0.5 ? -0.95 : 0; else z = Math.random() < 0.5 ? -0.95 : 0;
            }
            out.set([x * 0.85, y * 0.85 - 0.1, z * 0.85], i * 3);
        }
        return out;
    }
    function jelly() {
        const out = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            if (i < N * 0.55) { // bell
                const u = Math.random() * Math.PI * 2, v = Math.random() * Math.PI / 2;
                const r = 1.25 * (0.93 + Math.random() * 0.07);
                out.set([Math.cos(u) * Math.sin(v) * r, Math.cos(v) * r * 0.8 + 0.3, Math.sin(u) * Math.sin(v) * r], i * 3);
            } else { // tentacles
                const k = Math.floor(Math.random() * 12), a = (k / 12) * Math.PI * 2, f = Math.random();
                const rad = k % 3 === 0 ? 0.3 : 1.1;
                out.set([Math.cos(a) * rad * (1 - f * 0.3) + Math.sin(f * 7 + k) * 0.12 * f, 0.3 - f * 2.2, Math.sin(a) * rad * (1 - f * 0.3)], i * 3);
            }
        }
        return out;
    }
    function coral() {
        // Branching coral: random walk branches that fork upward
        const segs = [];
        function branch(x, y, z, dx, dy, dz, len, depth) {
            const ex = x + dx * len, ey = y + dy * len, ez = z + dz * len;
            segs.push([x, y, z, ex, ey, ez]);
            if (depth <= 0) return;
            for (let b = 0; b < 2 + (depth > 2 ? 1 : 0); b++) {
                const nx = dx + R(-0.6, 0.6), ny = dy + R(0.1, 0.5), nz = dz + R(-0.6, 0.6);
                const l = Math.hypot(nx, ny, nz);
                branch(ex, ey, ez, nx / l, ny / l, nz / l, len * 0.72, depth - 1);
            }
        }
        branch(0, -1.6, 0, 0, 1, 0, 0.9, 4);
        const out = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            const s = segs[Math.floor(Math.random() * segs.length)], f = Math.random();
            out.set([s[0] + (s[3] - s[0]) * f + R(-0.04, 0.04), s[1] + (s[4] - s[1]) * f + R(-0.04, 0.04), s[2] + (s[5] - s[2]) * f + R(-0.04, 0.04)], i * 3);
        }
        return out;
    }
    function fish() {
        const out = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            if (i < N * 0.72) { // body ellipsoid
                const u = Math.random() * Math.PI * 2, v = Math.acos(R(-1, 1));
                out.set([Math.cos(u) * Math.sin(v) * 1.35 + 0.2, Math.cos(v) * 0.75, Math.sin(u) * Math.sin(v) * 0.35], i * 3);
            } else if (i < N * 0.92) { // tail fan
                const f = Math.random(), s = R(-1, 1);
                out.set([-1.15 - f * 0.8, s * f * 0.75, R(-0.05, 0.05)], i * 3);
            } else { // top fin
                const f = Math.random();
                out.set([R(-0.3, 0.6) - f * 0.3, 0.72 + f * 0.45, R(-0.03, 0.03)], i * 3);
            }
        }
        return out;
    }
    function heart() {
        const out = new Float32Array(N * 3);
        for (let i = 0; i < N; i++) {
            const t = Math.random() * Math.PI * 2, s = Math.sqrt(Math.random());
            const x = 16 * Math.pow(Math.sin(t), 3), y = 13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
            const edge = Math.random() < 0.6 ? 1 : s;
            out.set([x * 0.085 * edge, y * 0.085 * edge + 0.15, R(-0.35, 0.35) * (1 - edge * 0.5)], i * 3);
        }
        return out;
    }
    const SHAPES = [sphere(), island(), jelly(), coral(), fish(), heart()];

    // ---- Renderer ---------------------------------------------------------------
    let renderer = null, scene, camera, points, geo, colors;
    function init() {
        renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
        camera.position.set(0, 0, 6.2);

        geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(SHAPES[0]), 3));
        colors = new Float32Array(N * 3);
        const c1 = new THREE.Color(0x3fb3a6), c2 = new THREE.Color(0x8f7fe0), c3 = new THREE.Color(0xf08f9f); // teal, lavender, coral pink
        for (let i = 0; i < N; i++) {
            const t = Math.random();
            const c = t < 0.6 ? c1.clone().lerp(c2, t / 0.6) : c2.clone().lerp(c3, (t - 0.6) / 0.4);
            colors.set([c.r, c.g, c.b], i * 3);
        }
        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

        const cv = document.createElement('canvas'); cv.width = cv.height = 32;
        const g = cv.getContext('2d');
        const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.7)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grd; g.fillRect(0, 0, 32, 32);

        points = new THREE.Points(geo, new THREE.PointsMaterial({
            size: 0.07, map: new THREE.CanvasTexture(cv), vertexColors: true,
            transparent: true, depthWrite: false, opacity: 0.85
        }));
        scene.add(points);
        resize();
    }
    function resize() {
        if (!renderer) return;
        const w = window.innerWidth, h = window.innerHeight;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        // On wide screens the cloud sits to the right of the text; on phones it's centred behind it
        camera.setViewOffset(w, h, w > 900 ? -w * 0.2 : 0, w > 900 ? 0 : -h * 0.12, w, h);
        camera.position.z = w < 700 ? 8 : 6.2;
        camera.updateProjectionMatrix();
    }
    window.addEventListener('resize', resize);

    // ---- Scroll -> which shape, and how far into the next one ------------------
    let target = 0, current = 0, running = false, px = 0, py = 0, tpx = 0, tpy = 0;
    const chapters = Array.from(page.querySelectorAll('.about-chapter'));
    const bar = document.getElementById('about-progress-bar');
    page.addEventListener('scroll', () => {
        const max = page.scrollHeight - page.clientHeight;
        const p = max > 0 ? page.scrollTop / max : 0;
        target = p * (SHAPES.length - 1);
        if (bar) bar.style.transform = `scaleX(${p})`;
        chapters.forEach(ch => {
            const r = ch.getBoundingClientRect();
            ch.classList.toggle('in-view', r.top < window.innerHeight * 0.7 && r.bottom > window.innerHeight * 0.25);
        });
    }, { passive: true });
    window.addEventListener('pointermove', e => {
        tpx = (e.clientX / window.innerWidth) * 2 - 1; tpy = (e.clientY / window.innerHeight) * 2 - 1;
    }, { passive: true });

    const ease = t => t * t * (3 - 2 * t);
    const clock = new THREE.Clock();
    function frame() {
        if (!running) return;
        requestAnimationFrame(frame);
        const t = clock.getElapsedTime();
        current += (target - current) * 0.08;
        px += (tpx - px) * 0.05; py += (tpy - py) * 0.05;
        const i0 = Math.min(Math.floor(current), SHAPES.length - 1);
        const i1 = Math.min(i0 + 1, SHAPES.length - 1);
        const f = ease(Math.min(Math.max(current - i0, 0), 1));
        const a = SHAPES[i0], b = SHAPES[i1], pos = geo.attributes.position.array;
        // Mid-morph, particles swirl outward a little so the change feels alive
        const burst = Math.sin(f * Math.PI) * 0.35;
        for (let i = 0; i < N * 3; i += 3) {
            const n = Math.sin(t * 0.8 + i * 0.013) * 0.025;
            pos[i] = a[i] + (b[i] - a[i]) * f + n + Math.sin(i) * burst;
            pos[i + 1] = a[i + 1] + (b[i + 1] - a[i + 1]) * f + Math.cos(t * 0.7 + i * 0.011) * 0.025 + Math.cos(i) * burst;
            pos[i + 2] = a[i + 2] + (b[i + 2] - a[i + 2]) * f + n;
        }
        geo.attributes.position.needsUpdate = true;
        points.rotation.y = t * 0.15 + px * 0.5;
        points.rotation.x = py * 0.25 + Math.sin(t * 0.2) * 0.05;
        renderer.render(scene, camera);
    }

    // Run only while the About page is showing
    new MutationObserver(() => {
        const open = !page.classList.contains('hidden');
        if (open && !running) {
            if (!renderer) init();
            running = true; clock.start(); page.dispatchEvent(new Event('scroll')); frame();
        } else if (!open) {
            running = false;
        }
    }).observe(page, { attributes: true, attributeFilter: ['class'] });
})();

// ---- Enter with / without sound, and the sound toggle -------------------------
(function soundControls() {
    const audios = () => Array.from(document.querySelectorAll('audio'));
    const toggle = document.getElementById('sound-toggle');
    let muted = false;
    function setMuted(m) {
        muted = m;
        audios().forEach(a => { a.muted = m; });
        if (toggle) {
            toggle.classList.toggle('is-muted', m);
            toggle.setAttribute('aria-label', m ? 'Turn sound on' : 'Mute sound');
        }
    }
    const stage = document.getElementById('cube-stage');
    const withSound = document.getElementById('enter-sound');
    const silent = document.getElementById('enter-silent');
    const choices = document.getElementById('enter-choices');
    function enter(m) {
        setMuted(m);
        if (choices) choices.classList.add('gone');
        if (stage) stage.click();
    }
    if (withSound) withSound.addEventListener('click', () => enter(false));
    if (silent) silent.addEventListener('click', () => enter(true));
    if (stage) stage.addEventListener('click', () => {
        if (choices) choices.classList.add('gone');
        if (toggle) toggle.classList.add('visible');
    });
    if (toggle) toggle.addEventListener('click', e => { e.stopPropagation(); setMuted(!muted); });
})();
