// islands.js - Memory Islands
//
// Once a day "closes" (passes midnight in Korea time), every journal entry
// written that day gets bundled into a single "Memory Island" -- a small
// voxel landmass that appears scattered around the Surface Island. Gemini
// reads that day's entries and returns a short title/summary/mood for it.
// Days with fewer than 2 entries are skipped entirely (not enough to
// meaningfully summarize), and today itself is never bundled since it
// hasn't closed yet.
//
// Persisted to localStorage so islands are generated once and then just
// reloaded on every visit -- no duplicate API calls, no jumping around.
//
// Talks to our own local proxy at /api/chat (see server.js), same pattern
// as sentiment.js and chat.js -- never calls api.anthropic.com directly.
//
// Depends on globals from app.js (THREE, scene, createVoxel) and from
// journal.js (getJournalEntries). Must load after both.

const ISLAND_STORAGE_KEY = 'lumareef_islands_v2';
const ISLAND_WEEKLY_KEY  = 'lumareef_weekly_islands_v2';

// ---- GENERATION MODE --------------------------------------------------------
// ISLAND_DEV_MODE = true  → uses N-minute windows so you can demo without waiting for midnight.
// ISLAND_DEV_MODE = false → real KST daily behavior (one island per day after midnight).
//
// Set to 30 minutes for submission demo so islands appear quickly.
const ISLAND_DEV_MODE = true;
const ISLAND_DEV_WINDOW_MINUTES = 1; // each "day" = 1 minute for demo

// ---- KST day-bucketing helpers -------------------------------------------

// Korea is UTC+9 with no DST, so this is a fixed offset.
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;

// Returns the "YYYY-MM-DD" calendar date a given timestamp falls on, in KST,
// regardless of what timezone the browser itself is running in.
function getKstDateKey(isoOrDate) {
    const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
    const kst = new Date(d.getTime() + KST_OFFSET_MS);
    const y = kst.getUTCFullYear();
    const m = String(kst.getUTCMonth() + 1).padStart(2, '0');
    const day = String(kst.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Today's KST date key, used to make sure we never bundle "today" --
// the day isn't over yet, so it shouldn't be summarized as a finished island.
function getTodayKstDateKey() {
    return getKstDateKey(new Date());
}

// ---- Dev-mode window-bucketing helpers ------------------------------------
// Same idea as the KST day key, but the "day" is an N-minute slice of time
// since the epoch, so testing doesn't require waiting for a real day to end.

function getDevWindowKey(isoOrDate) {
    const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
    const windowMs = ISLAND_DEV_WINDOW_MINUTES * 60 * 1000;
    const windowIndex = Math.floor(d.getTime() / windowMs);
    return `dev-${windowIndex}`;
}

function getCurrentDevWindowKey() {
    return getDevWindowKey(new Date());
}

function getEntryBucketKey(createdAt) {
    return ISLAND_DEV_MODE ? getDevWindowKey(createdAt) : getKstDateKey(createdAt);
}

function getCurrentOpenBucketKey() {
    return ISLAND_DEV_MODE ? getCurrentDevWindowKey() : getTodayKstDateKey();
}

// Friendly label for an island's date/window key.
function formatIslandDateLabel(dateKey) {
    if (ISLAND_DEV_MODE && dateKey.startsWith('dev-')) {
        // Reconstruct an approximate real time from the window index, just
        // for a readable label during testing (e.g. "8:14 PM window").
        const windowIndex = parseInt(dateKey.slice(4), 10);
        const windowMs = ISLAND_DEV_WINDOW_MINUTES * 60 * 1000;
        const approxTime = new Date(windowIndex * windowMs);
        return approxTime.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }) + ' window';
    }
    // dateKey is "YYYY-MM-DD" in KST terms already, so we parse it as a plain
    // date rather than re-running it through any timezone conversion.
    const [y, m, d] = dateKey.split('-').map(Number);
    const localDate = new Date(y, m - 1, d);
    return localDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

// ---- Persistence -----------------------------------------------------------

// Saved shape: { [dateKey]: { dateKey, title, summary, mood, advice, color, entryIds: [...], position: {x,y,z}, createdAt } }
function getSavedIslands() {
    try {
        const raw = localStorage.getItem(ISLAND_STORAGE_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch (err) {
        console.warn('Could not read saved islands:', err);
        return {};
    }
}

function saveIslandRecord(record) {
    const all = getSavedIslands();
    all[record.dateKey] = record;
    localStorage.setItem(ISLAND_STORAGE_KEY, JSON.stringify(all));
    return record;
}

// ---- Grouping journal entries into closed (non-current) buckets -----------

function groupEntriesByClosedKstDay(entries) {
    const openKey = getCurrentOpenBucketKey();
    const groups = {}; // bucketKey -> [entries]

    entries.forEach(entry => {
        const bucketKey = getEntryBucketKey(entry.createdAt);
        if (bucketKey === openKey) return; // current bucket hasn't closed yet
        if (!groups[bucketKey]) groups[bucketKey] = [];
        groups[bucketKey].push(entry);
    });

    return groups;
}

// ---- Gemini summarization --------------------------------------------------

const ISLAND_SYSTEM_PROMPT = `You read a batch of personal journal entries all written on the same day, for a reflective journaling app called LUMA REEF. Respond with ONLY a JSON object, no preamble, no markdown fences, in this exact shape:

{"title": "2-4 word evocative concept name", "summary": "1-2 sentence reflection on the day, written gently and warmly, second person (\"you\")", "mood": "positive" | "neutral" | "negative" | "mixed", "advice": "1 short sentence of gentle, encouraging advice or encouragement for the day, second person (\"you\")"}

Rules:
- title: should read like the name of a small place or feeling, not a literal label (e.g. "Quiet Harbor", "Restless Tide", "Steady Ground") -- evoke the day rather than just naming its topic.
- summary: warm and validating, never clinical, never a diagnosis. Reflect back what the day seemed to hold without inventing specifics that weren't written.
- mood: the overall emotional shape of the day across all entries. Use "mixed" if entries pull in clearly different emotional directions.
- advice: one small, kind, actionable nudge or piece of encouragement that fits the day's mood -- never clinical, never prescriptive about mental health, just a gentle human-sounding note (e.g. "Maybe give yourself credit for getting through a hard one." or "Try carrying a little of today's calm into tomorrow.").
- Never include any text outside the JSON object.`;

function stripCodeFencesIsland(text) {
    return text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
}

const gentleAdvices = [
    'Be gentle with yourself today.',
    'Take things one breath at a time.',
    'It is okay to feel whatever you are feeling.',
    'Tomorrow is a new day.',
    'Give yourself a moment to just exist.',
    'You are doing the best you can.',
    'Let your mind rest for a little while.',
    'Every small step counts.',
    'Breathe in peace, breathe out worry.',
    'You do not have to have everything figured out right now.',
    'Allow yourself space to grow at your own pace.',
    'Your feelings are valid and matter.',
    'You carry more strength than you know.',
    'There is no rush; take your time.',
    'Embrace the quiet moments of today.'
];
const moodChoices = ['positive', 'neutral', 'negative', 'mixed'];

function getIslandFallback() {
    return {
        title: 'A Day Remembered',
        summary: 'A day of check-ins, gathered here.',
        mood: moodChoices[Math.floor(Math.random() * moodChoices.length)],
        advice: gentleAdvices[Math.floor(Math.random() * gentleAdvices.length)]
    };
}

async function summarizeDayWithGemini(dayEntries) {
    const entryText = dayEntries.map((e, i) => `Entry ${i + 1}: ${e.text}`).join('\n\n');

    try {
        const response = await fetch(LUMA_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system: ISLAND_SYSTEM_PROMPT,
                max_tokens: 250,
                messages: [{ role: 'user', content: entryText }]
            })
        });

        if (!response.ok) {
            throw new Error(`Proxy responded with ${response.status}`);
        }

        const data = await response.json();
        const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text);
        const cleaned = stripCodeFencesIsland(textBlocks.join('\n'));
        const parsed = JSON.parse(cleaned);

        if (!parsed.title || !parsed.summary || !parsed.mood) {
            console.warn('Island summary returned unexpected shape:', parsed);
            return ISLAND_FALLBACK;
        }
        // advice is allowed to be missing on older/odd model output -- fall
        // back to a generic gentle line rather than losing the whole island.
        if (!parsed.advice) {
            parsed.advice = gentleAdvices[Math.floor(Math.random() * gentleAdvices.length)];
        }
        return parsed;
    } catch (err) {
        console.error('Island summarization failed:', err);
        return getIslandFallback();
    }
}

// ---- Island type assignment ------------------------------------------------
// Each mood maps to a unique island visual theme for diversity on the reef.
// positive → tropical forest island
// neutral  → sandy beach island
// negative → icy iceberg
// mixed    → volcanic rocky island
// weekly   → grand archipelago (large merged form)

const islandTypeByMood = {
    positive: 'forest',
    neutral:  'sand',
    negative: 'iceberg',
    mixed:    'volcanic',
};

const islandColorByMood = {
    positive: 0x5dbb6f,   // forest green
    neutral:  0xe8c97a,   // warm sand
    negative: 0xa8d8ea,   // icy blue
    mixed:    0x8a6c5e,   // volcanic brown-red
    weekly:   0xf7c59f,   // warm golden
};

// ---- Deterministic-but-scattered placement --------------------------------
// Seeded off the dateKey so a given island always lands in the same spot
// across reloads, rather than jumping around every time positions are recomputed.

function seededRandom(seedStr) {
    let h = 0;
    for (let i = 0; i < seedStr.length; i++) {
        h = (h * 31 + seedStr.charCodeAt(i)) >>> 0;
    }
    return function next() {
        h = (h * 1664525 + 1013904223) >>> 0;
        return h / 4294967296;
    };
}

function pickScatteredPosition(dateKey, existingPositions) {
    const rand = seededRandom(dateKey);
    const minRadius = 3.0;
    const maxRadius = 7.5;

    // A few attempts to avoid stacking directly on top of an already-placed island
    for (let attempt = 0; attempt < 8; attempt++) {
        const angle = rand() * Math.PI * 2;
        const radius = minRadius + rand() * (maxRadius - minRadius);
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * radius;

        const tooClose = existingPositions.some(p => {
            const dx = p.x - x, dz = p.z - z;
            return Math.sqrt(dx * dx + dz * dz) < 1.4;
        });
        if (!tooClose) {
            return { x, y: -1.0, z };
        }
    }
    // Fall back to whatever the last attempt produced rather than looping forever
    const angle = rand() * Math.PI * 2;
    const radius = minRadius + rand() * (maxRadius - minRadius);
    return { x: Math.cos(angle) * radius, y: -1.0, z: Math.sin(angle) * radius };
}

// ---- Three.js mesh creation — diverse island types -------------------------

const islandRegistry = []; // [{ dateKey, mesh, extras:[], record }]

function createIslandMesh(record) {
    const isWeekly = !!record.isWeekly;
    const mood = record.mood || 'neutral';
    const type = isWeekly ? 'weekly' : (islandTypeByMood[mood] || 'sand');
    const px = record.position.x, py = record.position.y, pz = record.position.z;
    const extras = []; 

    let baseColor, baseSideColor, leafColor, leafSideColor, trunkColor, trunkSideColor;

    if (type === 'iceberg') {
        baseColor = 0xd6f0f8; baseSideColor = 0x7ecce8;
        leafColor = 0xeeeeee; leafSideColor = 0xcccccc;
        trunkColor = 0x4a4a4a; trunkSideColor = 0x333333;
    } else if (type === 'volcanic') {
        baseColor = 0x5a3a2a; baseSideColor = 0x3d2518;
        leafColor = 0xe66235; leafSideColor = 0xb3401c;
        trunkColor = 0x5e3a24; trunkSideColor = 0x402515;
    } else if (type === 'forest') {
        baseColor = 0x4c8c5e; baseSideColor = 0x2e6640;
        leafColor = 0xa3b19b; leafSideColor = 0x8f9e87;
        trunkColor = 0xd7c4b7; trunkSideColor = 0xbeae9e;
    } else if (type === 'weekly') {
        baseColor = 0xf7c59f; baseSideColor = 0xc49060;
        leafColor = 0xffb7c5; leafSideColor = 0xd98f9e;
        trunkColor = 0x4a3b32; trunkSideColor = 0x332822;
    } else { // sand
        baseColor = 0xe8c97a; baseSideColor = 0xc4a04e;
        leafColor = 0xd9b99b; leafSideColor = 0xb59b81;
        trunkColor = 0x8b5a2b; trunkSideColor = 0x6e4722;
    }

    // Main base voxel (anchor for clicking)
    const baseW = isWeekly ? 1.8 : 1.2;
    const baseH = isWeekly ? 0.5 : 0.4;
    const mesh = createVoxel(baseW, baseH, baseW, px, py, pz, baseColor, baseSideColor);
    mesh.userData = { type: 'memoryIsland', dateKey: record.dateKey };

    // Procedurally generate attached land chunks
    const rand = seededRandom(record.dateKey);
    const numChunks = isWeekly ? 4 : Math.floor(rand() * 3) + 1;
    const islandVoxels = [{x: px, y: py + baseH/2, z: pz, w: baseW}];
    
    for (let i = 0; i < numChunks; i++) {
        const cw = (0.4 + rand() * 0.6) * (isWeekly ? 1.5 : 1);
        const ch = 0.2 + rand() * 0.5;
        const ox = px + (rand() - 0.5) * 1.5;
        const oz = pz + (rand() - 0.5) * 1.5;
        const cy = py - 0.2 + rand() * 0.4;
        
        const chunk = createVoxel(cw, ch, cw, ox, cy, oz, baseColor, baseSideColor);
        chunk.userData = { type: 'memoryIsland', dateKey: record.dateKey };
        extras.push(chunk);
        islandVoxels.push({x: ox, y: cy + ch/2, z: oz, w: cw});
    }

    // Procedurally spawn trees/features based on theme colors
    const numTrees = isWeekly ? 3 : Math.floor(rand() * 2) + 1;
    for (let i = 0; i < numTrees; i++) {
        const v = islandVoxels[Math.floor(rand() * islandVoxels.length)];
        const tx = v.x + (rand() - 0.5) * (v.w * 0.5);
        const tz = v.z + (rand() - 0.5) * (v.w * 0.5);
        
        const th = 0.3 + rand() * 0.5;
        const trunk = createVoxel(0.15, th, 0.15, tx, v.y + th/2, tz, trunkColor, trunkSideColor);
        trunk.userData = { type: 'memoryIsland', dateKey: record.dateKey };
        extras.push(trunk);
        
        const lh = v.y + th;
        const ls = 0.4 + rand() * 0.4;
        const leaves = createVoxel(ls, ls, ls, tx, lh, tz, leafColor, leafSideColor);
        leaves.userData = { type: 'memoryIsland', dateKey: record.dateKey };
        extras.push(leaves);
        
        // Occasional extra leaf clump
        if (rand() > 0.5) {
            const exx = tx + (rand() - 0.5) * ls;
            const exz = tz + (rand() - 0.5) * ls;
            const exy = lh + (rand() - 0.5) * (ls * 0.5);
            const extraLeaves = createVoxel(ls*0.6, ls*0.6, ls*0.6, exx, exy, exz, leafColor, leafSideColor);
            extraLeaves.userData = { type: 'memoryIsland', dateKey: record.dateKey };
            extras.push(extraLeaves);
        }
    }

    islandRegistry.push({ dateKey: record.dateKey, mesh, extras, record });
    return mesh;
}

function loadSavedIslandsIntoScene() {
    const saved = getSavedIslands();
    Object.values(saved).forEach(record => createIslandMesh(record));
}

// ---- Main generation pass --------------------------------------------------
// Call on app load. Finds closed KST days with 2+ entries that don't already
// have a saved island, summarizes each via Gemini, persists, and renders.
async function generateMissingIslands() {
    if (typeof getJournalEntries !== 'function') return;

    const entries = getJournalEntries();
    const groups = groupEntriesByClosedKstDay(entries);
    const saved = getSavedIslands();
    const existingPositions = Object.values(saved).map(r => r.position);

    const pendingDateKeys = Object.keys(groups).filter(dateKey => {
        return !saved[dateKey] && groups[dateKey].length >= 2;
    });

    for (const dateKey of pendingDateKeys) {
        const dayEntries = groups[dateKey];
        const summary = await summarizeDayWithGemini(dayEntries);
        const position = pickScatteredPosition(dateKey, existingPositions);
        existingPositions.push(position); // so the next island in this same pass avoids it too

        const record = {
            dateKey,
            title: summary.title,
            summary: summary.summary,
            mood: summary.mood,
            advice: summary.advice,
            entryIds: dayEntries.map(e => e.id),
            position,
            createdAt: new Date().toISOString()
        };

        saveIslandRecord(record);
        createIslandMesh(record);
    }
}

// ---- Weekly Merge -----------------------------------------------------------
// After each Sunday midnight KST (or every 7 windows in dev mode), all islands
// from the past week are merged into one grand 'weekly' archipelago island.
// The individual daily islands remain visible; the weekly one is added on top.

function getSavedWeeklyIslands() {
    try {
        const raw = localStorage.getItem(ISLAND_WEEKLY_KEY);
        return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
}

function saveWeeklyIsland(record) {
    const all = getSavedWeeklyIslands();
    all[record.dateKey] = record;
    localStorage.setItem(ISLAND_WEEKLY_KEY, JSON.stringify(all));
}

// In KST: returns the ISO week start key (Monday) for a given date
function getKstWeekKey(isoOrDate) {
    const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
    const kst = new Date(d.getTime() + KST_OFFSET_MS);
    const day = kst.getUTCDay(); // 0=Sun,1=Mon...
    const monday = new Date(kst);
    monday.setUTCDate(kst.getUTCDate() - ((day + 6) % 7));
    return `week-${monday.getUTCFullYear()}-${String(monday.getUTCMonth()+1).padStart(2,'0')}-${String(monday.getUTCDate()).padStart(2,'0')}`;
}

function getCurrentWeekKey() {
    return ISLAND_DEV_MODE
        ? `week-dev-${Math.floor(Date.now() / (ISLAND_DEV_WINDOW_MINUTES * 60 * 1000 * 7))}`
        : getKstWeekKey(new Date());
}

const WEEKLY_SYSTEM_PROMPT = `You are reading a collection of daily memory island summaries from a week in the journaling app LUMA REEF. Each island represents one day. Merge them into a single weekly reflection. Respond with ONLY a JSON object in this exact shape:
{"title": "2-4 word evocative weekly concept", "summary": "2-3 sentence warm reflection on the whole week", "mood": "positive" | "neutral" | "negative" | "mixed", "advice": "One gentle encouraging sentence for the week ahead"}
No other text outside the JSON.`;

async function generateWeeklyMergeIfNeeded() {
    const saved = getSavedIslands();
    const allRecords = Object.values(saved);
    if (allRecords.length < 2) return; // need at least 2 daily islands to merge

    // Group daily islands by week key, skip the current open week
    const currentWeekKey = getCurrentWeekKey();
    const weekGroups = {};
    allRecords.forEach(r => {
        const wKey = ISLAND_DEV_MODE
            ? `week-dev-${Math.floor(parseInt((r.dateKey || '').replace('dev-', '') || '0', 10) / 7)}`
            : getKstWeekKey(r.createdAt || r.dateKey);
        if (wKey === currentWeekKey) return; // don't close the current week
        if (!weekGroups[wKey]) weekGroups[wKey] = [];
        weekGroups[wKey].push(r);
    });

    const savedWeekly = getSavedWeeklyIslands();
    const existingPositions = Object.values(savedWeekly).map(r => r.position)
        .concat(allRecords.map(r => r.position));

    for (const [wKey, records] of Object.entries(weekGroups)) {
        if (savedWeekly[wKey]) continue; // already merged this week
        if (records.length < 2) continue; // need at least 2 days

        // Summarize the week via AI
        const weekText = records.map((r, i) => `Day ${i+1} (${r.title}): ${r.summary}`).join('\n\n');
        let summary = { title: 'A Week Remembered', summary: 'A week of reflections.', mood: 'neutral', advice: 'Keep going.' };
        try {
            const response = await fetch(LUMA_API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    system: WEEKLY_SYSTEM_PROMPT,
                    max_tokens: 300,
                    messages: [{ role: 'user', content: weekText }]
                })
            });
            if (response.ok) {
                const data = await response.json();
                const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('');
                const parsed = JSON.parse(text.trim().replace(/^```json\s*/i,'').replace(/```$/,'').trim());
                if (parsed.title) summary = parsed;
            }
        } catch (err) { console.warn('Weekly merge summarization failed:', err); }

        const position = pickScatteredPosition(wKey, existingPositions);
        existingPositions.push(position);

        // Weekly islands sit slightly higher to stand out
        position.y = -0.8;

        const weeklyRecord = {
            dateKey: wKey,
            isWeekly: true,
            title: summary.title,
            summary: summary.summary,
            mood: summary.mood,
            advice: summary.advice,
            entryIds: records.flatMap(r => r.entryIds || []),
            position,
            createdAt: new Date().toISOString()
        };
        saveWeeklyIsland(weeklyRecord);
        createIslandMesh(weeklyRecord);
        console.log(`[islands.js] Weekly merge created: ${wKey}`);
    }
}

function loadSavedWeeklyIslandsIntoScene() {
    const saved = getSavedWeeklyIslands();
    Object.values(saved).forEach(record => createIslandMesh(record));
}

// Also support touch tap on canvas for mobile island clicking
function initIslandTouchHandling() {
    const canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer) return;
    canvasContainer.addEventListener('touchend', (event) => {
        if (typeof activeScene !== 'undefined' && activeScene !== 'reef') return;
        if (typeof isSubmerged !== 'undefined' && isSubmerged) return;
        if (islandRegistry.length === 0) return;
        const touch = event.changedTouches[0];
        const rect = canvasContainer.getBoundingClientRect();
        if (!islandPointer || !islandRaycaster) return;
        islandPointer.x = ((touch.clientX - rect.left) / rect.width) * 2 - 1;
        islandPointer.y = -((touch.clientY - rect.top) / rect.height) * 2 + 1;
        islandRaycaster.setFromCamera(islandPointer, camera);
        const hits = islandRaycaster.intersectObjects(getIslandClickableMeshes());
        if (hits.length > 0) {
            event.stopPropagation();
            const dateKey = hits[0].object.userData.dateKey;
            const found = islandRegistry.find(e => e.dateKey === dateKey);
            if (found) openIslandWidget(found.record, touch.clientX, touch.clientY);
        }
    }, true);
}

// ---- Click handling (raycasting against islandRegistry's meshes) ----------
// Wired up separately from app.js's existing canvas-click (the dive trigger)
// so a click on an island opens its widget instead of submerging the scene.

let islandRaycaster = null;
let islandPointer = null;

function getIslandClickableMeshes() {
    const list = [];
    islandRegistry.forEach(entry => {
        list.push(entry.mesh);
        (entry.extras || []).forEach(e => list.push(e));
    });
    return list;
}

function initIslandClickHandling() {
    islandRaycaster = new THREE.Raycaster();
    islandPointer = new THREE.Vector2();

    const canvasContainer = document.getElementById('canvas-container');
    if (!canvasContainer) return;

    canvasContainer.addEventListener('click', (event) => {
        // Only meaningful in the reef scene, after the start overlay is gone,
        // and not while mid-dive (isSubmerged) -- islands live on the surface.
        if (typeof activeScene !== 'undefined' && activeScene !== 'reef') return;
        if (typeof isSubmerged !== 'undefined' && isSubmerged) return;
        if (islandRegistry.length === 0) return;

        const rect = canvasContainer.getBoundingClientRect();
        islandPointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        islandPointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        islandRaycaster.setFromCamera(islandPointer, camera);
        const hits = islandRaycaster.intersectObjects(getIslandClickableMeshes());

        if (hits.length > 0) {
            // Stop this click from also triggering app.js's dive-on-click handler
            event.stopPropagation();
            const dateKey = hits[0].object.userData.dateKey;
            const found = islandRegistry.find(entry => entry.dateKey === dateKey);
            if (found) openIslandWidget(found.record, event.clientX, event.clientY);
        }
    }, true); // capture phase, so we get first look before app.js's listener
}

// ---- Click widget (small floating card, anchored near the click point) ----

function getJournalEntriesByIds(ids) {
    if (typeof getJournalEntries !== 'function') return [];
    const all = getJournalEntries();
    const idSet = new Set(ids);
    return all.filter(e => idSet.has(e.id));
}

function closeIslandWidget() {
    const widget = document.getElementById('island-widget');
    if (widget) widget.remove();
}

function openIslandWidget(record, clientX, clientY) {
    closeIslandWidget(); // only one open at a time

    const dayEntries = getJournalEntriesByIds(record.entryIds);

    const widget = document.createElement('div');
    widget.id = 'island-widget';
    widget.className = 'island-widget mood-' + (record.mood || 'neutral');

    widget.innerHTML = `
        <button type="button" class="island-widget-close" aria-label="Close">&times;</button>
        <div class="island-widget-date">${formatIslandDateLabel(record.dateKey)}</div>
        <h3 class="island-widget-title">${escapeHtml(record.title)}</h3>
        <p class="island-widget-summary">${escapeHtml(record.summary)}</p>
        ${record.advice ? `<p class="island-widget-advice">${escapeHtml(record.advice)}</p>` : ''}
        <div class="island-widget-entries">
            ${dayEntries.map(e => `<div class="island-widget-entry">${escapeHtml(e.text)}</div>`).join('')}
        </div>
    `;

    document.body.appendChild(widget);

    // Position near the click, but clamped so it stays fully on-screen
    const widgetWidth = 300;
    const widgetMaxHeight = 360;
    let left = clientX + 16;
    let top = clientY - 20;

    if (left + widgetWidth > window.innerWidth - 16) {
        left = clientX - widgetWidth - 16;
    }
    if (top + widgetMaxHeight > window.innerHeight - 16) {
        top = window.innerHeight - widgetMaxHeight - 16;
    }
    if (top < 16) top = 16;
    if (left < 16) left = 16;

    widget.style.left = `${left}px`;
    widget.style.top = `${top}px`;

    requestAnimationFrame(() => widget.classList.add('visible'));

    widget.querySelector('.island-widget-close').addEventListener('click', (e) => {
        e.stopPropagation();
        closeIslandWidget();
    });
}

// Click-away-to-close, without interfering with app.js's own canvas click logic
document.addEventListener('click', (event) => {
    const widget = document.getElementById('island-widget');
    if (!widget) return;
    if (widget.contains(event.target)) return;
    closeIslandWidget();
});

// ---- Boot -------------------------------------------------------------------
// Poll until createVoxel is ready (it's defined in app.js which loads first,
// but on mobile the scripts can execute in parallel so we guard against a race).

function tryBootIslands() {
    if (typeof createVoxel !== 'function' || typeof THREE === 'undefined') {
        setTimeout(tryBootIslands, 100);
        return;
    }
    loadSavedIslandsIntoScene();
    loadSavedWeeklyIslandsIntoScene();
    initIslandClickHandling();
    initIslandTouchHandling();
    generateMissingIslands();
    generateWeeklyMergeIfNeeded();

    // Re-check periodically — every 30min in demo mode, every hour in real mode
    const checkInterval = ISLAND_DEV_MODE
        ? ISLAND_DEV_WINDOW_MINUTES * 60 * 1000
        : 60 * 60 * 1000; // 1 hour
    setInterval(() => {
        generateMissingIslands();
        generateWeeklyMergeIfNeeded();
    }, checkInterval);

    if (ISLAND_DEV_MODE) {
        console.log(`[islands.js] Demo mode: ${ISLAND_DEV_WINDOW_MINUTES}-min windows. Checking every ${ISLAND_DEV_WINDOW_MINUTES} min.`);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Small delay ensures app.js's synchronous top-level code (createVoxel, scene, etc.)
    // has had a chance to run even on slower mobile JS engines
    setTimeout(tryBootIslands, 200);
});