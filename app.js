// 1. Core Scene Environment Initialization
// At the top of app.js
let isSubmerged = false;
let cameraY = 5.2; 
const submergedHeight = -2.0;

const container = document.getElementById('canvas-container');
const scene = new THREE.Scene();
scene.background = null; // Transparent so CSS gradient can show through

// Aspect calculation
const width = container.clientWidth;
const height = container.clientHeight;
const aspect = width / height;

// Orthographic camera scaling
const d = 5.2; 
const camera = new THREE.OrthographicCamera(-d * aspect, d * aspect, d, -d, 1, 1000);

// --- FIXED: Steady Angle-Based Interpolation System ---
const cameraRadius = 13.85; 
let currentAngleIndex = 0;   
const angles = [
    Math.PI / 4,         // 45 degrees
    (3 * Math.PI) / 4,   // 135 degrees
    (5 * Math.PI) / 4,   // 225 degrees
    (7 * Math.PI) / 4    // 315 degrees
];

// Horizontal Angle Targets (Yaw)
let targetAngle = angles[currentAngleIndex];
let currentAngle = angles[currentAngleIndex];
const fixedHeight = 5.2; // Locked isometric height

// Vertical Perspective Targets (Pitch)
const baseHeight = 5.2;
const topHeight = 13.85;
let targetHeight = baseHeight;
let currentHeight = baseHeight;

// Camera Up-Vector Stabilization Targets (Eliminates skewing/flipping)
let targetUpZ = 0;
let currentUpZ = 0;

const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(width, height);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.setClearColor(0x000000, 0); // transparent clear color
container.appendChild(renderer.domElement);

// 2. Lighting System Configuration
const ambientLight = new THREE.AmbientLight(0xffffff, 0.75);
scene.add(ambientLight);

const directionalLight = new THREE.DirectionalLight(0xffffff, 0.55);
directionalLight.position.set(5, 10, 4);
scene.add(directionalLight);

// 3. Functional Procedural Voxel Forge Helper
function createVoxel(width, height, depth, x, y, z, topColor, sideColor, opacity = 1.0, targetScene = scene) {
    const geometry = new THREE.BoxGeometry(width, height, depth);
    const isTransparent = opacity < 1.0;
    
    const materials = [
        new THREE.MeshLambertMaterial({ color: sideColor, flatShading: true, transparent: isTransparent, opacity: opacity }), 
        new THREE.MeshLambertMaterial({ color: sideColor, flatShading: true, transparent: isTransparent, opacity: opacity }), 
        new THREE.MeshLambertMaterial({ color: topColor, flatShading: true, transparent: isTransparent, opacity: opacity }),  
        new THREE.MeshLambertMaterial({ color: sideColor, flatShading: true, transparent: isTransparent, opacity: opacity }), 
        new THREE.MeshLambertMaterial({ color: sideColor, flatShading: true, transparent: isTransparent, opacity: opacity }), 
        new THREE.MeshLambertMaterial({ color: sideColor, flatShading: true, transparent: isTransparent, opacity: opacity })  
    ];

    const mesh = new THREE.Mesh(geometry, materials);
    mesh.position.set(x, y, z);
    targetScene.add(mesh);
    return mesh;
}

// 4. Color Definition Assets
const grass = 0x869B7E;       
const sideNavy = 0x1d2d44;    

/* PASTEL TREE COLOR PALETTE */
const leafGreen = 0xa3b19b;   
const leafSide = 0x8f9e87;    
const trunkBrown = 0xd7c4b7;  
const trunkSide = 0xbeae9e;   

/* WATER SHADES SPECTRUM */
const waterTopColor = 0x76ABAE;    
const waterShadowColor = 0x436566; 
const cloudColor = 0xffffff;

// 5. Build Dynamic Voxel Assembly Structure
const landCenters = [
    { x: -0.4, z: -0.4 }, 
    { x:  0.5, z: -0.3 }, 
    { x:  1.1, z:  0.2 }, 
    { x:  0.8, z:  0.9 }  
];

// Main Base Island Segment
createVoxel(1.4, 0.8, 1.4, -0.4, -0.6, -0.4, grass, sideNavy);

// Asymmetric Pastel Tree Assembly
createVoxel(0.2, 0.6, 0.2, -0.8, 0.1, -0.8, trunkBrown, trunkSide); 
createVoxel(0.65, 0.65, 0.65, -0.8, 0.72, -0.8, leafGreen, leafSide);   
createVoxel(0.35, 0.45, 0.35, -1.05, 0.72, -0.8, leafGreen, leafSide);
createVoxel(0.3, 0.35, 0.3, -0.55, 0.62, -0.8, leafGreen, leafSide);

// Middle Step Terrace
createVoxel(0.9, 0.5, 1.1, 0.5, -0.75, -0.3, grass, sideNavy);

// Far Right Platform Terrace
createVoxel(0.6, 0.3, 0.6, 1.1, -0.9, 0.2, grass, sideNavy);

// Detached Cascading Chunk Platform Component
createVoxel(0.35, 0.15, 0.35, 0.8, -1.0, 0.9, grass, sideNavy);


// 6. PROCEDURAL FORGE: Dynamic Distance-Based Shoreline Grid
const baseVoxelSize = 0.26;
const gridRange = 1.2; 
const stepInterval = 0.23; 

function lerpColor(colorStart, colorEnd, percent) {
    const c1 = new THREE.Color(colorStart);
    const c2 = new THREE.Color(colorEnd);
    return c1.lerp(c2, percent).getHex();
}

for (let x = -2.5; x <= 2.5; x += stepInterval) {
    for (let z = -2.5; z <= 2.5; z += stepInterval) {
        
        let minDistance = Infinity;
        landCenters.forEach(center => {
            const dist = Math.sqrt((x - center.x) ** 2 + (z - center.z) ** 2);
            if (dist < minDistance) minDistance = dist;
        });

        if (minDistance > 0.35 && minDistance <= gridRange) {
            
            const factor = (minDistance - 0.35) / (gridRange - 0.35);
            
            const dynamicScale = THREE.MathUtils.lerp(1.0, 0.45, factor);
            const finalSize = (baseVoxelSize * dynamicScale) - 0.01;

            const nearColorTop = 0x3d6466; 
            const farColorTop = 0xCEE5D0;  
            const dynamicTopColor = lerpColor(nearColorTop, farColorTop, factor);
            
            const nearColorSide = 0x274042;
            const farColorSide = 0x94B49F;
            const dynamicSideColor = lerpColor(nearColorSide, farColorSide, factor);

            const dynamicY = -1.05 - (factor * 0.06);
            const dynamicOpacity = 0.75 * (1.0 - factor);

            createVoxel(
                finalSize, 
                0.16 * dynamicScale, 
                finalSize, 
                x, 
                dynamicY, 
                z, 
                dynamicTopColor, 
                dynamicSideColor,
                dynamicOpacity
            );
        }
    }
}


// 7. Core Background Fluid Wave Sheet Layer
const waterWidth = 30;     
const waterHeight = 30;    
const waterSegments = 40;  
const waterThickness = 0.4; 

const waterGeometry = new THREE.BoxGeometry(waterWidth, waterThickness, waterHeight, waterSegments, 1, waterSegments);
const waterMaterials = [
    new THREE.MeshLambertMaterial({ color: 0x5c8a8c, flatShading: true, transparent: true, opacity: 0.8 }),   
    new THREE.MeshLambertMaterial({ color: 0x5c8a8c, flatShading: true, transparent: true, opacity: 0.8 }),   
    new THREE.MeshLambertMaterial({ color: waterTopColor, flatShading: true, transparent: true, opacity: 0.8 }), 
    new THREE.MeshLambertMaterial({ color: waterShadowColor, flatShading: true, transparent: true, opacity: 0.8 }), 
    new THREE.MeshLambertMaterial({ color: 0x5c8a8c, flatShading: true, transparent: true, opacity: 0.8 }),   
    new THREE.MeshLambertMaterial({ color: 0x5c8a8c, flatShading: true, transparent: true, opacity: 0.8 })    
];

const waterMesh = new THREE.Mesh(waterGeometry, waterMaterials);
waterMesh.position.set(0.3, -1.25, 0.1); 
scene.add(waterMesh);

const positionAttribute = waterGeometry.attributes.position;
const originalY = [];
for (let i = 0; i < positionAttribute.count; i++) {
    originalY.push(positionAttribute.getY(i));
}


// 8. White Shimmer / Wave Foam Blocks
const shimmers = [];
const shimmerCount = 18;

for (let i = 0; i < shimmerCount; i++) {
    const radius = 2.2 + Math.random() * 4.5; 
    const angle = Math.random() * Math.PI * 2;
    const posX = 0.3 + Math.cos(angle) * radius;
    const posZ = 0.1 + Math.sin(angle) * radius;

    const shimmerBlock = createVoxel(
        0.2 + Math.random() * 0.3,  
        0.03,                      
        0.15 + Math.random() * 0.2,  
        posX, -1.02, posZ,          
        0xffffff, 0xf5f5f5,
        0.85 
    );
    
    shimmers.push({
        mesh: shimmerBlock,
        baseY: -1.02,
        offset: Math.random() * Math.PI * 2,
        speed: 1.5 + Math.random() * 1.5
    });
}


// 9. Randomly Shaped Voxel Clouds
const leaves = [];
for (let i = 0; i < 8; i++) {
    const radius = 1.8 + Math.random() * 3.5; 
    const angle = Math.random() * Math.PI * 2;
    const posX = 0.3 + Math.cos(angle) * radius;
    const posZ = 0.1 + Math.sin(angle) * radius;

    const leafSize = 0.15 + Math.random() * 0.1;
    const leaf = createVoxel(
        leafSize, 0.02, leafSize,
        posX, -1.02, posZ,          
        0x5a7a50, 0x4a6a40,
        0.9 
    );
    leaf.rotation.y = Math.random() * Math.PI;
    
    leaves.push({
        mesh: leaf,
        baseY: -1.02,
        offset: Math.random() * Math.PI * 2,
        speed: 0.8 + Math.random() * 0.5
    });
}

const clouds = [];

function buildRandomCloudCluster(baseX, baseY, baseZ) {
    const group = new THREE.Group();
    const segmentCount = 2 + Math.floor(Math.random() * 3); 
    
    for (let i = 0; i < segmentCount; i++) {
        const w = 0.2 + Math.random() * 1.2;
        const h = 0.1 + Math.random() * 0.4;
        const d = 0.5 + Math.random() * 0.6;
        
        const xOffset = (i === 0) ? 0 : (Math.random() - 0.5) * 1.4;
        const yOffset = (i === 0) ? 0 : (Math.random() - 0.5) * 0.3;
        const zOffset = (i === 0) ? 0 : (Math.random() - 0.5) * 0.8;

        const geom = new THREE.BoxGeometry(w, h, d);
        const mat = new THREE.MeshLambertMaterial({ color: cloudColor, flatShading: true });
        const mesh = new THREE.Mesh(geom, mat);
        mesh.position.set(xOffset, yOffset, zOffset);
        group.add(mesh);
    }

    group.position.set(baseX, baseY, baseZ);
    scene.add(group);
    clouds.push(group);
}

buildRandomCloudCluster(-1.5, 3.2, -1.5);
buildRandomCloudCluster(2.8, 1.5, -1.0);
buildRandomCloudCluster(-0.8, 2.6, 3.5);


// 10. --- FIXED: Continuous Stable Angle Rotations ---
window.addEventListener('keydown', (event) => {
    // 90-degree switches happen smoothly around the orbit track
    if (event.key === 'ArrowRight' || event.key === 'd' || event.key === 'D') {
        currentAngleIndex = (currentAngleIndex + 1) % angles.length;
        targetAngle = angles[currentAngleIndex];
        // Handle unwinding loop boundaries seamlessly
        if (targetAngle < currentAngle) currentAngle -= Math.PI * 2;
    } else if (event.key === 'ArrowLeft' || event.key === 'a' || event.key === 'A') {
        currentAngleIndex = (currentAngleIndex - 1 + angles.length) % angles.length;
        targetAngle = angles[currentAngleIndex];
        if (targetAngle > currentAngle) currentAngle += Math.PI * 2;
    }
});

// Mobile touch swipe to rotate
let touchStartX = 0;
let touchEndX = 0;
window.addEventListener('touchstart', e => {
    // Only track touches on the canvas or main UI to avoid interfering with scrolling in side panels
    if (e.target.closest('.side-panel') || e.target.closest('.journal-page') || e.target.closest('.modal-box')) return;
    touchStartX = e.changedTouches[0].screenX;
}, { passive: true });

window.addEventListener('touchend', e => {
    if (e.target.closest('.side-panel') || e.target.closest('.journal-page') || e.target.closest('.modal-box')) return;
    touchEndX = e.changedTouches[0].screenX;
    const diff = touchEndX - touchStartX;
    if (Math.abs(diff) > 50) { // minimum swipe distance threshold
        if (diff < 0) { // swiped left -> rotate right
            currentAngleIndex = (currentAngleIndex + 1) % angles.length;
            targetAngle = angles[currentAngleIndex];
            if (targetAngle < currentAngle) currentAngle -= Math.PI * 2;
        } else { // swiped right -> rotate left
            currentAngleIndex = (currentAngleIndex - 1 + angles.length) % angles.length;
            targetAngle = angles[currentAngleIndex];
            if (targetAngle > currentAngle) currentAngle += Math.PI * 2;
        }
    }
});

// Mouse drag swipe
let mouseStartX = 0;
let isDragging = false;
window.addEventListener('pointerdown', e => {
    if (e.target.closest('.side-panel') || e.target.closest('.journal-page') || e.target.closest('.modal-box')) return;
    mouseStartX = e.screenX;
    isDragging = true;
});

window.addEventListener('pointerup', e => {
    if (!isDragging) return;
    isDragging = false;
    const diff = e.screenX - mouseStartX;
    if (Math.abs(diff) > 50) {
        if (diff < 0) {
            currentAngleIndex = (currentAngleIndex + 1) % angles.length;
            targetAngle = angles[currentAngleIndex];
            if (targetAngle < currentAngle) currentAngle -= Math.PI * 2;
        } else {
            currentAngleIndex = (currentAngleIndex - 1 + angles.length) % angles.length;
            targetAngle = angles[currentAngleIndex];
            if (targetAngle > currentAngle) currentAngle += Math.PI * 2;
        }
    }
});

// Trackpad wheel swipe
let wheelTimeout = null;
window.addEventListener('wheel', e => {
    if (e.target.closest('.side-panel') || e.target.closest('.journal-page') || e.target.closest('.modal-box')) return;
    if (Math.abs(e.deltaX) > 30 && !wheelTimeout) {
        if (e.deltaX > 0) {
            currentAngleIndex = (currentAngleIndex + 1) % angles.length;
            targetAngle = angles[currentAngleIndex];
            if (targetAngle < currentAngle) currentAngle -= Math.PI * 2;
        } else {
            currentAngleIndex = (currentAngleIndex - 1 + angles.length) % angles.length;
            targetAngle = angles[currentAngleIndex];
            if (targetAngle > currentAngle) currentAngle += Math.PI * 2;
        }
        // Debounce trackpad events
        wheelTimeout = setTimeout(() => { wheelTimeout = null; }, 500);
    }
}, { passive: true });

// activeScene controls which scene/camera the render loop draws each frame.
// Defined here (not in tank.js) since app.js's render loop is what reads it.
let activeScene = 'reef'; // 'reef' or 'tank'

// 11. Infinite Frame Rendering Loop
let clock = new THREE.Clock();

function animate() {
    requestAnimationFrame(animate);
    
    const elapsedTime = clock.getElapsedTime();

    if (activeScene === 'reef') {
        const color1 = new THREE.Color(0x76ABAE);
        const color2 = new THREE.Color(0x88BDBD);
        // Sine wave creates the oscillation, mapped from -1..1 to 0..1
        const mix = (Math.sin(elapsedTime * 0.5) + 1) / 2;
        waterMaterials[2].color.copy(color1).lerp(color2, mix);

        cameraY += ((isSubmerged ? submergedHeight : fixedHeight) - cameraY) * 0.05;
        // Interpolating via angles directly keeps the camera locked to a steady orbit path
        currentAngle += (targetAngle - currentAngle) * 0.07; 
        
        // Scale horizontal distance down smoothly as the camera approaches the top view peak
        const topApproachFactor = (currentHeight - baseHeight) / (topHeight - baseHeight);
        const orbitScale = THREE.MathUtils.lerp(1.0, 0.0, topApproachFactor);
        
        const posX = Math.cos(currentAngle) * cameraRadius * orbitScale;
        const posZ = Math.sin(currentAngle) * cameraRadius * orbitScale;
        
        camera.position.set(posX, cameraY, posZ);
        
        // Seamless camera up-vector adjustment prevents rolling/shifting distortions
        camera.lookAt(0.1, -0.5, 0.1);
        
        // Fluid Wave calculations
        for (let i = 0; i < positionAttribute.count; i++) {
            const x = positionAttribute.getX(i);
            const y = positionAttribute.getZ(i); 
            const currentVertexY = positionAttribute.getY(i);
            
            if (currentVertexY > 0) {
                const waveX = Math.sin(x * 0.8 + elapsedTime * 1.8) * .1;
                const waveZ = Math.cos(y * 0.8 + elapsedTime * 1.8) * .1;
                
                positionAttribute.setY(i, originalY[i] + waveX + waveZ);
            }
        }
        waterGeometry.attributes.position.needsUpdate = true;
        waterGeometry.computeVertexNormals(); 

        // Animate White Shimmer Blocks
        shimmers.forEach(s => {
            s.mesh.position.y = s.baseY + Math.sin(elapsedTime * s.speed + s.offset) * 0.05;
            s.mesh.position.x += Math.sin(elapsedTime * 0.2 + s.offset) * 0.001;
        });

        leaves.forEach(l => {
            l.mesh.position.y = l.baseY + Math.sin(elapsedTime * l.speed + l.offset) * 0.03;
            l.mesh.position.x += Math.sin(elapsedTime * 0.1 + l.offset) * 0.0005;
        });

        // Animate Cloud Floating Drift loops
        clouds.forEach((cloud) => {
            cloud.position.x += 0.002;
            if (cloud.position.x > 6.0) {
                cloud.position.x = -6.0;
            }
        });
        if (typeof animateLifeforms === 'function') {
            animateLifeforms();
        }
        
        // Let CSS handle the background gradient smoothly. We just tell the renderer.
        document.getElementById('canvas-container').style.background = isSubmerged ? 
            'linear-gradient(to bottom, #001524, #003566)' : 
            'linear-gradient(to bottom, #a1c4fd, #c2e9fb)';

        // If submerged, we fade out the clouds and scale up the water presence
        clouds.forEach(cloud => {
            cloud.visible = !isSubmerged; 
        });

        renderer.render(scene, camera);

        // Once the camera has settled near the bottom of its dive, trigger the fade to the fish tank
        if (isSubmerged && cameraY < submergedHeight + 0.15 && !window._tankTransitionStarted) {
            window._tankTransitionStarted = true;
            transitionToFishTank();
        }
        if (!isSubmerged) {
            window._tankTransitionStarted = false;
        }

    } else if (activeScene === 'tank') {
        renderTankScene();
    }
}
animate();

window.addEventListener('resize', () => {
    const width = container.clientWidth;
    const height = container.clientHeight;
    renderer.setSize(width, height);
    camera.left = -d * (width / height);
    camera.right = d * (width / height);
    camera.updateProjectionMatrix();
    if (typeof resizeTankCamera === 'function') {
        resizeTankCamera(width, height);
    }
});

function updateIslandUI(data) {
    const title = document.getElementById('month-title');
    const status = document.getElementById('status-text');
    
    if (data.title) title.innerText = data.title;
    if (data.status) status.innerText = data.status;
    
    // Add a subtle fade animation
    title.style.transition = "opacity 0.5s";
    title.style.opacity = 0;
    setTimeout(() => {
        title.style.opacity = 1;
    }, 500);
}
document.addEventListener('DOMContentLoaded', () => {
    console.log("DOM fully loaded.");
    const overlay = document.getElementById('start-overlay');
    
    // 1. Cube Click -> Zoom Into Island, Fade Out Overlay, Fade In Scene
    const cubeStage = document.getElementById('cube-stage');
    const cubeHint = document.getElementById('cube-hint');
    cubeStage.addEventListener('click', () => {
        overlay.classList.add('fade-out'); // Triggers CSS opacity transition
        cubeStage.classList.add('zooming'); // Scales the island up, as if pushing into it
        if (cubeHint) cubeHint.classList.add('hint-hidden');

        
        const topNav = document.querySelector('.top-nav');
        const sideNav = document.querySelector('.side-nav');
        if (topNav) topNav.classList.add('visible');
        if (sideNav) sideNav.classList.add('visible');

        const bgMusic = document.getElementById('bg-music');
        const targetVolume = 0.4; 
        const fadeDuration = 4000; 
        const fadeSteps = 60;      
        const stepTime = fadeDuration / fadeSteps;
        const volumeStep = targetVolume / fadeSteps;

        bgMusic.volume = 0;

        bgMusic.play().then(() => {
            let currentStep = 0;
            const fadeInterval = setInterval(() => {
                currentStep++;
                bgMusic.volume = Math.min(volumeStep * currentStep, targetVolume);
                if (currentStep >= fadeSteps) {
                    clearInterval(fadeInterval);
                }
            }, stepTime);
        }).catch(err => console.log("Playback blocked:", err));

        setTimeout(() => {
            overlay.style.display = 'none';
            console.log("Overlay hidden, ready for interaction.");
        }, 1100); 
    });

    function fadeAudio(audioEl, direction, targetVolume = 0.4, duration = 1200) {
        const steps = 30;
        const stepTime = duration / steps;
        const startVolume = direction === 'in' ? 0 : audioEl.volume;
        const endVolume = direction === 'in' ? targetVolume : 0;
        const volumeStep = (endVolume - startVolume) / steps;

        if (audioEl._fadeInterval) clearInterval(audioEl._fadeInterval);

        if (direction === 'in') {
            audioEl.volume = 0;
            audioEl.play().catch(err => console.log("Playback blocked:", err));
        }

        let currentStep = 0;
        audioEl._fadeInterval = setInterval(() => {
            currentStep++;
            const nextVolume = startVolume + volumeStep * currentStep;
            audioEl.volume = Math.min(Math.max(nextVolume, 0), 1);
            if (currentStep >= steps) {
                clearInterval(audioEl._fadeInterval);
                if (direction === 'out') audioEl.pause();
            }
        }, stepTime);
    }

    // Handles all audio transitions when crossing the water's surface
    function handleSubmersionAudio(nowSubmerged) {
        const bgMusic = document.getElementById('bg-music');
        const diveSound = document.getElementById('dive-sound');
        const underwaterAmbience = document.getElementById('underwater-ambience');

        if (nowSubmerged) {
            // Entering the water: one-shot splash/dive cue, swap ambience
            diveSound.currentTime = 0;
            diveSound.volume = 0.6;
            diveSound.play().catch(err => console.log("Playback blocked:", err));

            fadeAudio(bgMusic, 'out', 0.4, 1000);
            fadeAudio(underwaterAmbience, 'in', 0.5, 1500);
        } else {
            // Surfacing: fade ambience back out, restore surface music
            fadeAudio(underwaterAmbience, 'out', 0.5, 1000);
            fadeAudio(bgMusic, 'in', 0.4, 1500);
        }
    }

    // Diving into the Tank (fish tank) is now handled solely via the
    // Tank nav button below -- clicking the water/canvas itself no
    // longer triggers the dive, since the nav already covers that and a
    // canvas-wide click handler was getting in the way of clicking on
    // Memory Islands (see islands.js).

    // Toggles the light/dark variant on both the logo bar and the floating
    // side-nav together, so they always stay in sync no matter which part
    // of the app changed the background behind them (reef or tank).
    function setNavTheme(mode) {
        const navBar = document.querySelector('.top-nav');
        const sideNav = document.querySelector('.side-nav');
        const isDark = mode === 'dark';
        if (navBar) navBar.classList.toggle('theme-dark', isDark);
        if (sideNav) sideNav.classList.toggle('theme-dark', isDark);
    }

    // 3. Side Nav Button Handling -- one shared floating pill nav used
    // everywhere, including on top of the Journal page overlay.
    const navButtons = document.querySelectorAll('.side-nav .nav-links button');
    navButtons.forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation(); // Prevent triggering overlay/canvas clicks underneath

            navButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            const section = btn.getAttribute('data-nav');
            console.log('Nav clicked:', section);

            // Close any open side panel before deciding what this button does
            if (typeof closeAllPanels === 'function') closeAllPanels();

            if (section === 'home') {
                // Returning home always means: leave the tank, back to the reef
                if (activeScene === 'tank') {
                    transitionToReef();
                    handleSubmersionAudio(false);
                }
                setNavTheme(activeScene === 'tank' ? 'dark' : 'light');
            } else if (section === 'sanctuary') {
                // Tank = the Deep Ocean / fish tank view of past reflections
                if (activeScene === 'reef') {
                    isSubmerged = true;
                    handleSubmersionAudio(true);
                }
                setNavTheme('dark');
            } else if (section === 'journal') {
                if (typeof openJournalPanel === 'function') openJournalPanel();
                // Journal is a full-page dark gradient overlay, so nav icons
                // go dark/white regardless of activeScene.
                setNavTheme('dark');
            } else if (section === 'about') {
                const aboutPage = document.getElementById('about-page');
                if (aboutPage) aboutPage.classList.remove('hidden');
                setNavTheme('dark');
            }

            // Let the guide mascot react to whichever section we just switched to
            if (typeof showGuideForSection === 'function') showGuideForSection(section);
        });
    });

    cubeStage.addEventListener('click', () => {
        if (typeof showGuideForSection === 'function') {
            setTimeout(() => showGuideForSection('home'), 700);
        }

        // Add the slow-fade appearance for UI elements
        setTimeout(() => {
            const topNav = document.querySelector('.top-nav');
            const sideNav = document.querySelector('.side-nav');
            const chatPanel = document.getElementById('chat-panel'); // if applicable

            if (topNav) topNav.classList.add('visible');
            if (sideNav) sideNav.classList.add('visible');
            if (chatPanel) chatPanel.classList.add('visible');
        }, 800); 
        
    }, { once: true });
});