// islands.js - Memory Islands
//
// Once a day "closes" (passes midnight in Korea time), every journal entry
// written that day gets bundled into a single "Memory Island" -- a small
// voxel landmass that appears scattered around the Surface Island. Claude
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

const ISLAND_STORAGE_KEY = 'lumareef_islands';

// ---- DEV/TEST MODE ----------------------------------------------------------
// Flip this to false to go back to real behavior: one island per KST
// calendar day, only after that day has actually ended.
//
// While true, "days" are replaced with fixed-size time windows so you can
// test island generation in minutes instead of waiting for midnight KST.
// A window only "closes" (becomes eligible for an island) once the current
// time has moved past its end -- the *current* window is always left open,
// mirroring how "today" is never bundled in real mode.
const ISLAND_DEV_MODE = true;
const ISLAND_DEV_WINDOW_MINUTES = 1; // each "day" = this many minutes

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

// ---- Claude summarization --------------------------------------------------

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

const ISLAND_FALLBACK = { title: 'A Day Remembered', summary: 'A day of check-ins, gathered here.', mood: 'neutral', advice: 'Be gentle with yourself today.' };

async function summarizeDayWithClaude(dayEntries) {
    const entryText = dayEntries.map((e, i) => `Entry ${i + 1}: ${e.text}`).join('\n\n');

    try {
        const response = await fetch('/api/chat', {
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
            parsed.advice = ISLAND_FALLBACK.advice;
        }
        return parsed;
    } catch (err) {
        console.error('Island summarization failed:', err);
        return ISLAND_FALLBACK;
    }
}

// ---- Mood -> color, matching agent.js's sentiment palette for consistency --

const islandColorByMood = {
    positive: 0xffb86b,
    neutral: 0x8fb8b0,
    negative: 0x6b7fa3,
    mixed: 0xc9a7d1
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

// ---- Three.js mesh creation -------------------------------------------------

const islandRegistry = []; // [{ dateKey, mesh, record }]

function createIslandMesh(record) {
    const color = islandColorByMood[record.mood] || islandColorByMood.neutral;
    const mesh = createVoxel(1.0, 0.45, 1.0, record.position.x, record.position.y, record.position.z, color, 0x1d2d44);
    mesh.userData = { type: 'memoryIsland', dateKey: record.dateKey };

    // Small floating marker on top so these read as distinct, tappable landmarks
    // rather than just another shoreline voxel.
    const markerGeo = new THREE.ConeGeometry(0.12, 0.28, 6);
    const markerMat = new THREE.MeshLambertMaterial({ color: color, flatShading: true });
    const marker = new THREE.Mesh(markerGeo, markerMat);
    marker.position.set(record.position.x, record.position.y + 0.45, record.position.z);
    marker.userData = { type: 'memoryIsland', dateKey: record.dateKey };
    scene.add(marker);

    islandRegistry.push({ dateKey: record.dateKey, mesh, marker, record });
    return mesh;
}

function loadSavedIslandsIntoScene() {
    const saved = getSavedIslands();
    Object.values(saved).forEach(record => createIslandMesh(record));
}

// ---- Main generation pass --------------------------------------------------
// Call on app load. Finds closed KST days with 2+ entries that don't already
// have a saved island, summarizes each via Claude, persists, and renders.
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
        const summary = await summarizeDayWithClaude(dayEntries);
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

// ---- Click handling (raycasting against islandRegistry's meshes) ----------
// Wired up separately from app.js's existing canvas-click (the dive trigger)
// so a click on an island opens its widget instead of submerging the scene.

let islandRaycaster = null;
let islandPointer = null;

function getIslandClickableMeshes() {
    const list = [];
    islandRegistry.forEach(entry => {
        list.push(entry.mesh);
        list.push(entry.marker);
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
        // Not ready yet — retry in 100ms
        setTimeout(tryBootIslands, 100);
        return;
    }
    loadSavedIslandsIntoScene();
    initIslandClickHandling();
    generateMissingIslands(); // fire-and-forget; new islands pop in once Gemini responds

    if (ISLAND_DEV_MODE) {
        console.log(`[islands.js] DEV MODE: ${ISLAND_DEV_WINDOW_MINUTES}-minute windows instead of KST days. Checking for newly-closed windows every ${ISLAND_DEV_WINDOW_MINUTES} minute(s).`);
        setInterval(generateMissingIslands, ISLAND_DEV_WINDOW_MINUTES * 60 * 1000);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    // Small delay ensures app.js's synchronous top-level code (createVoxel, scene, etc.)
    // has had a chance to run even on slower mobile JS engines
    setTimeout(tryBootIslands, 200);
});