// agent.js - The Lifeform & Emotional Agent Manager

const lifeforms = [];

// Shared texture loader + cache so each f1-f6 image is only loaded once
const fishTextureLoader = new THREE.TextureLoader();
const fishTextureCache = {};
const fishImageNames = ['f1.png', 'f2.png', 'f3.png', 'f4.png', 'f5.png', 'f6.png'];

function getFishTexture(imageName) {
    if (!fishTextureCache[imageName]) {
        fishTextureCache[imageName] = fishTextureLoader.load(`assets/${imageName}`);
    }
    return fishTextureCache[imageName];
}

// Function to add a "Fish" (Agent Support)
// imageName: which fish sprite to use (e.g. 'f3.png'); defaults to a random pick from f1-f6
function spawnFish(position = { x: 0, y: -2.5, z: 0 }, targetScene = scene, trackerArray = lifeforms, imageName = null) {
    const chosenImage = imageName || fishImageNames[Math.floor(Math.random() * fishImageNames.length)];
    const texture = getFishTexture(chosenImage);

    const material = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const fish = new THREE.Sprite(material);
    fish.scale.set(0.4, 0.4, 0.4); // adjust to match the f1-f6 art's proportions

    fish.position.set(position.x, position.y, position.z);
    targetScene.add(fish);
    
    // Add to our tracker for animation
    trackerArray.push({ mesh: fish, type: 'fish', speed: 0.02, image: chosenImage });
}

// Function to add "Coral" (Records/Memories)
function spawnCoral(position = { x: 0, y: -1.5, z: 0 }, targetScene = scene) {
    const geo = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const mat = new THREE.MeshLambertMaterial({ color: 0xff6b6b });
    const coral = new THREE.Mesh(geo, mat);
    
    coral.position.set(position.x, position.y, position.z);
    targetScene.add(coral);
}

// Animate these lifeforms in the loop
function animateLifeforms(trackerArray = lifeforms) {
    trackerArray.forEach(life => {
        if(life.type === 'fish') {
            life.mesh.position.x += Math.sin(Date.now() * 0.001) * life.speed;
        }
    });
}

// Call this whenever you receive a message from the "Agent"
function addSupportElement(type) {
    if (type === 'fish') {
        spawnFish({ 
            x: (Math.random() - 0.5) * 4, 
            y: -2.5, 
            z: (Math.random() - 0.5) * 4 
        });
    } else if (type === 'coral') {
        spawnCoral({ 
            x: (Math.random() - 0.5) * 4, 
            y: -3.0, 
            z: (Math.random() - 0.5) * 4 
        });
    }
}

// Coral color varies by sentiment, so the reef visually reflects emotional tone
// over time rather than always being the same red.
const coralColorBySentiment = {
    positive: 0xffb86b, // warm coral/orange
    neutral: 0x8fb8b0,  // muted teal-grey
    negative: 0x6b7fa3  // cool blue-violet
};

/**
 * Spawns a fish or coral based on a journal entry's sentiment analysis.
 * This is the real "Procedural Ecosystem" feature from the project plan --
 * entries actually shape what grows in the reef, instead of random spawns.
 *
 * @param {object} analysis - { sentiment, intensity, themes } from sentiment.js
 * @param {object} position - optional override, otherwise randomized near the island
 * @param {THREE.Scene} targetScene - defaults to the global reef `scene`
 */
function spawnFromAnalysis(analysis, position = null, targetScene = scene) {
    const sentiment = analysis && analysis.sentiment ? analysis.sentiment : 'neutral';
    const intensity = analysis && typeof analysis.intensity === 'number' ? analysis.intensity : 0.5;

    const pos = position || {
        x: (Math.random() - 0.5) * 4,
        y: -2.5,
        z: (Math.random() - 0.5) * 4
    };

    // Stronger, more positive entries are slightly more likely to spawn a fish
    // (life/activity); calmer or harder entries lean toward coral (something
    // steady growing from the moment, rather than something darting around).
    const spawnFishInstead = sentiment === 'positive' && intensity > 0.4;

    if (spawnFishInstead) {
        spawnFish(pos, targetScene);
    } else {
        const coralColor = coralColorBySentiment[sentiment] || coralColorBySentiment.neutral;
        spawnCoralWithColor(pos, targetScene, coralColor);
    }
}

// Same as spawnCoral, but with a configurable color so sentiment can tint it
// without needing to touch the original spawnCoral() callers elsewhere.
function spawnCoralWithColor(position, targetScene, color) {
    const geo = new THREE.BoxGeometry(0.2, 0.5, 0.2);
    const mat = new THREE.MeshLambertMaterial({ color: color });
    const coral = new THREE.Mesh(geo, mat);

    coral.position.set(position.x, position.y, position.z);
    targetScene.add(coral);
}