// tank.js - The Fish Tank Scene
// A sealed glass-cube aquarium scene shown after diving into the reef water.
// Depends on globals defined in app.js (loaded first): THREE, scene, container,
// width, height, createVoxel, activeScene, isSubmerged, submergedHeight, cameraY.
// Depends on agent.js (loaded before this file) for spawnFish / spawnCoral / animateLifeforms.

const tankLifeforms = [];
const tankParticles = [];

const tankScene = new THREE.Scene();
tankScene.background = new THREE.Color(0x0b1f24); // Dark moody room behind the cube, like the reference image

// Static perspective camera - fixed isometric-ish angle, no orbit controls
const tankCamera = new THREE.PerspectiveCamera(40, width / height, 0.1, 100);
tankCamera.position.set(3.2, 2.4, 4.2);
tankCamera.lookAt(0, 0, 0);

const tankAmbient = new THREE.AmbientLight(0xffffff, 0.55);
tankScene.add(tankAmbient);
const tankDirectional = new THREE.DirectionalLight(0xbfe8e6, 0.5);
tankDirectional.position.set(3, 6, 4);
tankScene.add(tankDirectional);

// Tank dimensions - a single cube, like the reference image
const tankSize = 2.4;
const tankHalf = tankSize / 2;

// 1. Sealed faceted glass cube (one mesh, per-face materials, transparent + glowy like the reference)
function createGlassCube(size) {
    const geometry = new THREE.BoxGeometry(size, size, size);
    const topColor = 0xbfe9e6;
    const sideColorLight = 0x7fb8b8;
    const sideColorDark = 0x35595c;

    const materials = [
        new THREE.MeshLambertMaterial({ color: sideColorLight, transparent: true, opacity: 0.28, side: THREE.DoubleSide }), // right
        new THREE.MeshLambertMaterial({ color: sideColorDark, transparent: true, opacity: 0.28, side: THREE.DoubleSide }),  // left
        new THREE.MeshLambertMaterial({ color: topColor, transparent: true, opacity: 0.32, side: THREE.DoubleSide }),       // top
        new THREE.MeshLambertMaterial({ color: sideColorDark, transparent: true, opacity: 0.2, side: THREE.DoubleSide }),   // bottom
        new THREE.MeshLambertMaterial({ color: sideColorLight, transparent: true, opacity: 0.3, side: THREE.DoubleSide }),  // front
        new THREE.MeshLambertMaterial({ color: sideColorDark, transparent: true, opacity: 0.26, side: THREE.DoubleSide })   // back
    ];

    const cube = new THREE.Mesh(geometry, materials);
    tankScene.add(cube);

    // Faint edge outline so the cube's silhouette reads clearly against the dark background
    const edges = new THREE.EdgesGeometry(geometry);
    const edgeLines = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: 0xdfffff, transparent: true, opacity: 0.35 })
    );
    tankScene.add(edgeLines);

    return cube;
}
createGlassCube(tankSize);

// 2. Sand/floor inside the cube (voxel-style, matching the island's chunky aesthetic)
const floorColor = 0xE8DCC0;
const floorSideColor = 0xC9B98F;
const tankFloorBlockSize = 0.3;
const floorY = -tankHalf + 0.1;
const floorMargin = 0.15; // keep the sand just inside the glass walls
for (let x = -tankHalf + floorMargin; x < tankHalf - floorMargin; x += tankFloorBlockSize) {
    for (let z = -tankHalf + floorMargin; z < tankHalf - floorMargin; z += tankFloorBlockSize) {
        createVoxel(
            tankFloorBlockSize - 0.02, 0.2, tankFloorBlockSize - 0.02,
            x, floorY, z,
            floorColor, floorSideColor,
            1.0, tankScene
        );
    }
}

// 3. Coral using the agent.js helpers, kept inside the cube's bounds.
// Fish spawning removed for now -- the Tank of Echoes currently shows only
// coral (the "past reflections" themselves), without the fish layer.
const innerMargin = 0.5; // keep lifeforms away from the glass walls
for (let i = 0; i < 4; i++) {
    spawnCoral({
        x: (Math.random() - 0.5) * (tankSize - innerMargin * 2),
        y: floorY + 0.3,
        z: (Math.random() - 0.5) * (tankSize - innerMargin * 2)
    }, tankScene);
}

// 4. Glowing ambient particle dots, like the soft lights floating inside the reference cube
const particleCount = 14;
for (let i = 0; i < particleCount; i++) {
    const radius = 0.02 + Math.random() * 0.025;
    const geo = new THREE.SphereGeometry(radius, 8, 8);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xeafffa,
        transparent: true,
        opacity: 0.85
    });
    const dot = new THREE.Mesh(geo, mat);

    const px = (Math.random() - 0.5) * (tankSize - 0.4);
    const py = (Math.random() - 0.5) * (tankSize - 0.4);
    const pz = (Math.random() - 0.5) * (tankSize - 0.4);
    dot.position.set(px, py, pz);

    // Soft glow halo behind each dot
    const haloGeo = new THREE.SphereGeometry(radius * 3.5, 8, 8);
    const haloMat = new THREE.MeshBasicMaterial({
        color: 0xeafffa,
        transparent: true,
        opacity: 0.15
    });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    dot.add(halo);

    tankScene.add(dot);
    tankParticles.push({
        mesh: dot,
        baseY: py,
        offset: Math.random() * Math.PI * 2,
        speed: 0.3 + Math.random() * 0.4,
        driftRadius: 0.05 + Math.random() * 0.1
    });
}

// Renders the tank scene; called from app.js's main animate() loop when activeScene === 'tank'

// ---- Chat Bubble System -------------------------------------------------------
// Each time the user sends a message in the Tank of Echoes, a glowing bubble
// rises from the floor. 3-4 seconds later, a floating DOM tooltip appears and
// tracks the bubble's projected screen position, summarizing the message.

const chatBubbles = []; // { mesh, halo, speed, tooltip, labelReady, startY, createdAt }

function truncateLabel(text, maxWords = 7) {
    const words = text.trim().split(/\s+/);
    if (words.length <= maxWords) return text.trim();
    return words.slice(0, maxWords).join(' ') + '…';
}

function spawnChatBubble(messageText) {
    // Random start position near the tank floor
    const margin = 0.6;
    const bx = (Math.random() - 0.5) * (tankSize - margin * 2);
    const bz = (Math.random() - 0.5) * (tankSize - margin * 2);
    const startY = -tankHalf + 0.3;

    // Bubble mesh — slightly larger than ambient particles, distinctly glowing
    const radius = 0.055 + Math.random() * 0.04;
    const geo = new THREE.SphereGeometry(radius, 10, 10);
    const mat = new THREE.MeshBasicMaterial({
        color: 0xb8f0ff,
        transparent: true,
        opacity: 0.85
    });
    const bubble = new THREE.Mesh(geo, mat);
    bubble.position.set(bx, startY, bz);

    // Soft glow halo
    const haloGeo = new THREE.SphereGeometry(radius * 2.8, 10, 10);
    const haloMat = new THREE.MeshBasicMaterial({ color: 0xddfbff, transparent: true, opacity: 0.18 });
    const halo = new THREE.Mesh(haloGeo, haloMat);
    bubble.add(halo);
    tankScene.add(bubble);

    const speed = 0.004 + Math.random() * 0.003;
    const swayOffset = Math.random() * Math.PI * 2;
    const label = truncateLabel(messageText);
    const delay = 3000 + Math.random() * 1000; // 3-4 second delay

    const entry = { mesh: bubble, halo: halo, speed, swayOffset, tooltip: null, labelReady: false, startY, label };
    chatBubbles.push(entry);

    // After delay, create the DOM tooltip
    setTimeout(() => {
        const tip = document.createElement('div');
        tip.className = 'tank-bubble-tooltip';
        tip.textContent = label;
        document.body.appendChild(tip);
        entry.tooltip = tip;
        // Fade it in
        requestAnimationFrame(() => { tip.style.opacity = '1'; });
    }, delay);
}

// Projects a 3D tank position to screen coords, used to track tooltip position
function projectTankToScreen(position) {
    const vec = position.clone().project(tankCamera);
    const canvas = document.getElementById('canvas-container');
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    return {
        x: (vec.x + 1) / 2 * rect.width + rect.left,
        y: -(vec.y - 1) / 2 * rect.height + rect.top
    };
}


function renderTankScene() {
    if (typeof animateLifeforms === 'function') {
        animateLifeforms(tankLifeforms);
    }

    // Gentle upward drift + sideways sway for the glowing ambient particles
    const elapsed = Date.now() * 0.001;
    tankParticles.forEach(p => {
        p.mesh.position.y = p.baseY + Math.sin(elapsed * p.speed + p.offset) * p.driftRadius;
        p.mesh.position.x += Math.sin(elapsed * 0.2 + p.offset) * 0.0008;
    });

    // Animate chat bubbles rising up through the tank
    for (let i = chatBubbles.length - 1; i >= 0; i--) {
        const b = chatBubbles[i];
        b.mesh.position.y += b.speed;
        // Gentle side sway as it rises
        b.mesh.position.x += Math.sin(elapsed * 0.8 + b.swayOffset) * 0.0012;

        // Fade out and remove when it reaches the top of the tank
        if (b.mesh.position.y > tankHalf - 0.1) {
            tankScene.remove(b.mesh);
            if (b.tooltip) {
                b.tooltip.style.opacity = '0';
                setTimeout(() => { if (b.tooltip) b.tooltip.remove(); }, 600);
            }
            chatBubbles.splice(i, 1);
            continue;
        }

        // Track DOM tooltip to bubble's screen position
        if (b.tooltip) {
            const screen = projectTankToScreen(b.mesh.position);
            if (screen) {
                b.tooltip.style.left = (screen.x + 14) + 'px';
                b.tooltip.style.top  = (screen.y - 20) + 'px';
            }
        }
    }

    renderer.render(tankScene, tankCamera);
}


// Keeps the tank camera's aspect ratio in sync on window resize
function resizeTankCamera(newWidth, newHeight) {
    tankCamera.aspect = newWidth / newHeight;
    tankCamera.updateProjectionMatrix();
}

// Handles the full dive -> fade -> tank-scene transition
function transitionToFishTank() {
    const fadeOverlay = document.getElementById('scene-fade');
    fadeOverlay.classList.add('active');

    setTimeout(() => {
        activeScene = 'tank';
        setTimeout(() => {
            fadeOverlay.classList.remove('active');
        }, 50); // tiny delay so the scene swap happens while still fully black

        // The chat trigger only makes sense once you're actually among the fish
        const talkBtn = document.getElementById('talk-to-fish-btn');
        if (talkBtn) talkBtn.classList.remove('hidden');

        // Nav text switches to white so it stays readable against the dark tank.
        // Both the logo bar and the side nav pill need the dark variant.
        const navBar = document.querySelector('.top-nav');
        const sideNav = document.querySelector('.side-nav');
        if (navBar) navBar.classList.add('theme-dark');
        if (sideNav) sideNav.classList.add('theme-dark');

        if (typeof updateIslandUI === 'function') {
            updateIslandUI({ title: 'Tank of Echoes', status: 'Your past reflections' });
        }
    }, 800); // matches the 0.8s CSS opacity transition on #scene-fade
}

// Returns to the reef scene (e.g. via the Home nav button)
function transitionToReef() {
    const fadeOverlay = document.getElementById('scene-fade');
    fadeOverlay.classList.add('active');

    setTimeout(() => {
        activeScene = 'reef';
        isSubmerged = false;
        setTimeout(() => {
            fadeOverlay.classList.remove('active');
        }, 50);

        const talkBtn = document.getElementById('talk-to-fish-btn');
        if (talkBtn) talkBtn.classList.add('hidden');
        if (typeof closeAllPanels === 'function') closeAllPanels(); // close chat too if open

        // Back to the light reef -- nav text returns to its dark teal color
        const navBar = document.querySelector('.top-nav');
        const sideNav = document.querySelector('.side-nav');
        if (navBar) navBar.classList.remove('theme-dark');
        if (sideNav) sideNav.classList.remove('theme-dark');

        if (typeof updateIslandUI === 'function') {
            updateIslandUI({ title: 'Your Reef' });
        }
    }, 800);
}