// journal.js - Check-In UI & Entry Storage
// Step 1: capture a journal entry from the user and store it.
// Sentiment/theme analysis (step 2) and lifeform-mapping (step 3) will read
// from the entries this file saves.

const JOURNAL_STORAGE_KEY = 'lumareef_entries';

// Pull all saved entries from localStorage (newest last)
function getJournalEntries() {
    try {
        const raw = localStorage.getItem(JOURNAL_STORAGE_KEY);
        return raw ? JSON.parse(raw) : [];
    } catch (err) {
        console.warn('Could not read journal entries:', err);
        return [];
    }
}

// Save one new entry. analysis defaults to null if not provided (e.g. before
// sentiment.js finishes analyzing it) and can be filled in afterward via
// updateJournalEntryAnalysis().
function saveJournalEntry(text, images = [], analysis = null) {
    const entries = getJournalEntries();
    const entry = {
        id: Date.now(),
        text: text,
        images: images, // array of data-URL strings
        createdAt: new Date().toISOString(),
        analysis: analysis
    };
    entries.push(entry);
    try {
        localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
        // Browser storage is ~5MB; photos stored as data URLs fill it fast.
        // Keep the words even if the photos don't fit.
        if (images.length) {
            console.warn('Storage full -- saving entry without photos:', err);
            entry.images = [];
            entry.photosDropped = true;
            localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
        } else {
            throw err;
        }
    }
    return entry;
}

// Shrinks a photo before storing it so a few pictures don't use up the
// browser's small storage quota. Returns a JPEG data URL (max 1024px side).
function compressImageDataUrl(dataUrl, maxSide = 1024, quality = 0.75) {
    return new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
            const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            resolve(canvas.toDataURL('image/jpeg', quality));
        };
        img.onerror = () => resolve(dataUrl);
        img.src = dataUrl;
    });
}

// Patches an existing entry's analysis field after the fact (since sentiment
// analysis is an async API call that finishes after the entry is first saved).
function updateJournalEntryAnalysis(entryId, analysis) {
    const entries = getJournalEntries();
    const target = entries.find(e => e.id === entryId);
    if (!target) return;
    target.analysis = analysis;
    try {
        localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
    } catch (err) {
        console.warn('Could not store entry analysis:', err);
    }
}

// Format an ISO timestamp into something readable, e.g. "Jun 26, 2026 - 3:42 PM"
function formatEntryDate(isoString) {
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
        + ' - ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

// Closes any open side panel (journal) and check-in modal isn't included --
// nav switches shouldn't silently discard an in-progress entry.
function closeAllPanels() {
    document.querySelectorAll('.side-panel').forEach(panel => panel.classList.add('hidden'));
    const journalPage = document.getElementById('journal-page');
    if (journalPage) journalPage.classList.add('hidden');
    const aboutPage = document.getElementById('about-page');
    if (aboutPage) aboutPage.classList.add('hidden');
}

function renderJournalList() {
    const listEl = document.getElementById('journal-entry-list');
    if (!listEl) return;

    let entries = getJournalEntries().slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)); // newest first

    if (calSelectedDateKey) {
        entries = entries.filter(e => getLocalDateKey(e.createdAt) === calSelectedDateKey);
    }

    const filterLabel = document.getElementById('days-filter-label');
    if (filterLabel) {
        filterLabel.textContent = calSelectedDateKey
            ? new Date(calSelectedDateKey + 'T12:00:00').toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })
            : 'All entries, newest first';
    }

    if (entries.length === 0) {
        listEl.innerHTML = calSelectedDateKey
            ? '<div class="journal-empty"><strong>Nothing written on this day.</strong><span class="mono">Pick another date, or tap it again to see everything.</span></div>'
            : '<div class="journal-empty"><strong>Your first entry will appear here.</strong><span class="mono">Each one grows a coral in your reef and the aquarium.</span></div>';
        if (typeof updateJournalStats === 'function') updateJournalStats();
        return;
    }

    const MOOD_NAME = { positive: 'Bright', neutral: 'Steady', negative: 'Heavy', mixed: 'Mixed' };
    let lastMonth = '';
    listEl.innerHTML = entries.map(entry => {
        const monthLabel = new Date(entry.createdAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
        const divider = monthLabel !== lastMonth ? `<h3 class="month-divider mono">${monthLabel}</h3>` : '';
        lastMonth = monthLabel;
        const a = entry.analysis || {};
        const mood = a.sentiment || 'pending';
        const themes = Array.isArray(a.themes) ? a.themes.slice(0, 3) : [];
        return `${divider}
        <article class="journal-entry mood-${mood}">
            <div class="entry-rail"><span class="entry-dot"></span></div>
            <div class="entry-body">
                <div class="journal-entry-date mono">${formatEntryDate(entry.createdAt)}</div>
                <div class="journal-entry-text">${escapeHtml(entry.text)}</div>
                ${entry.images && entry.images.length ? `<div class="journal-entry-images">${entry.images.map(src => `<img class="journal-entry-img" src="${src}" alt="Attached photo">`).join('')}</div>` : ''}
                <div class="entry-tags mono">
                    <span class="mood-tag">${MOOD_NAME[mood] || 'Reading the mood…'}</span>
                    ${themes.map(t => `<span>#${escapeHtml(String(t))}</span>`).join('')}
                </div>
            </div>
        </article>`;
    }).join('');
    if (typeof updateJournalStats === 'function') updateJournalStats();
}

// Numbers and mood mix in the Journal's left column
function updateJournalStats() {
    const entries = getJournalEntries();
    const days = new Set(entries.map(e => getLocalDateKey(e.createdAt)));
    const now = new Date();
    const monthPrefix = getLocalDateKey(now).slice(0, 7);
    let streak = 0;
    const d = new Date(now);
    if (!days.has(getLocalDateKey(d))) d.setDate(d.getDate() - 1); // today not written yet still keeps yesterday's streak
    while (days.has(getLocalDateKey(d))) { streak++; d.setDate(d.getDate() - 1); }
    const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    set('stat-total', entries.length);
    set('stat-month', [...days].filter(k => k.startsWith(monthPrefix)).length);
    set('stat-streak', streak);
    set('past-count', entries.length);

    const counts = { positive: 0, neutral: 0, mixed: 0, negative: 0 };
    entries.forEach(e => { const s = e.analysis && e.analysis.sentiment; if (counts[s] != null) counts[s]++; });
    const total = Object.values(counts).reduce((x, y) => x + y, 0);
    const bar = document.getElementById('mood-mix-bar'), legend = document.getElementById('mood-mix-legend');
    const NAMES = { positive: 'Bright', neutral: 'Steady', mixed: 'Mixed', negative: 'Heavy' };
    if (bar) bar.innerHTML = total ? Object.keys(counts).filter(k => counts[k]).map(k => `<i class="mood-${k}" style="flex:${counts[k]}"></i>`).join('') : '';
    if (legend) legend.innerHTML = total
        ? Object.keys(counts).filter(k => counts[k]).map(k => `<span><b class="mood-${k}"></b>${NAMES[k]} ${Math.round(counts[k] / total * 100)}%</span>`).join('')
        : 'Your moods will show up here.';
}

// Minimal HTML escaping since entry text is user-authored and gets injected via innerHTML
function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ---- Calendar widget --------------------------------------------------
// Local-time calendar (not the KST bucketing islands.js uses) -- the
// calendar is just "which days, on my own clock, did I write something",
// so it should match whatever the entry timestamps look like to the user.

let calViewYear = new Date().getFullYear();
let calViewMonth = new Date().getMonth(); // 0-indexed
let calSelectedDateKey = null; // 'YYYY-MM-DD' in local time, or null = show all

function getLocalDateKey(isoOrDate) {
    const d = (isoOrDate instanceof Date) ? isoOrDate : new Date(isoOrDate);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

// Set of date keys that have at least one entry, for the calendar's ring markers
function getDateKeysWithEntries() {
    const entries = getJournalEntries();
    const set = new Set();
    entries.forEach(e => set.add(getLocalDateKey(e.createdAt)));
    return set;
}

function renderCalendar() {
    const grid = document.getElementById('cal-grid');
    const label = document.getElementById('cal-month-label');
    const clearBtn = document.getElementById('cal-clear-filter');
    if (!grid || !label) return;

    const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    label.innerText = `${monthNames[calViewMonth]} ${calViewYear}`;

    const firstOfMonth = new Date(calViewYear, calViewMonth, 1);
    const startWeekday = firstOfMonth.getDay(); // 0 = Sunday
    const daysInMonth = new Date(calViewYear, calViewMonth + 1, 0).getDate();
    const datesWithEntries = getDateKeysWithEntries();
    const todayKey = getLocalDateKey(new Date());

    let html = '';
    // Leading blanks so day 1 lands in the correct weekday column
    for (let i = 0; i < startWeekday; i++) {
        html += '<div class="cal-day cal-day-empty"></div>';
    }

    for (let day = 1; day <= daysInMonth; day++) {
        const dateKey = `${calViewYear}-${String(calViewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const classes = ['cal-day'];
        if (datesWithEntries.has(dateKey)) classes.push('has-entry');
        if (dateKey === todayKey) classes.push('is-today');
        if (dateKey === calSelectedDateKey) classes.push('is-selected');

        html += `<button type="button" class="${classes.join(' ')}" data-date-key="${dateKey}">${day}</button>`;
    }

    grid.innerHTML = html;

    grid.querySelectorAll('.cal-day:not(.cal-day-empty)').forEach(btn => {
        btn.addEventListener('click', () => {
            const key = btn.getAttribute('data-date-key');
            // Tapping the already-selected day clears the filter instead of
            // re-selecting it, so the circle itself doubles as a toggle.
            calSelectedDateKey = (calSelectedDateKey === key) ? null : key;
            renderCalendar();
            renderJournalList();
        });
    });

    if (clearBtn) {
        clearBtn.classList.toggle('hidden', !calSelectedDateKey);
    }
}

function initCalendarNav() {
    const prevBtn = document.getElementById('cal-prev-month');
    const nextBtn = document.getElementById('cal-next-month');
    const clearBtn = document.getElementById('cal-clear-filter');

    if (prevBtn) {
        prevBtn.addEventListener('click', () => {
            calViewMonth -= 1;
            if (calViewMonth < 0) { calViewMonth = 11; calViewYear -= 1; }
            renderCalendar();
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            calViewMonth += 1;
            if (calViewMonth > 11) { calViewMonth = 0; calViewYear += 1; }
            renderCalendar();
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            calSelectedDateKey = null;
            renderCalendar();
            renderJournalList();
        });
    }
}

function openJournalPanel() {
    closeAllPanels();
    // Reset the calendar view to today's month whenever the page is opened
    // fresh, so it never silently opens stuck on whatever month was last
    // browsed in a previous session -- selection filter is preserved though,
    // since closing/reopening the panel shouldn't surprise-clear it.
    const now = new Date();
    calViewYear = now.getFullYear();
    calViewMonth = now.getMonth();
    renderCalendar();
    renderJournalList();
    document.getElementById('journal-page').classList.remove('hidden');
}

// ---- Shared submit pipeline ---------------------------------------------
// Both the Home check-in modal and the in-page diary on the Journal page
// save an entry the exact same way: save immediately (so nothing is lost if
// analysis fails/is slow), then run sentiment analysis, then let agent.js
// spawn a fish/coral from it, then refresh whatever UI is currently showing
// entries. Pulling this into one function means the two entry points can
// never silently drift out of sync with each other.
//
// onStatusUpdate(text) is called with progress messages ('Reading your
// entry...', 'Checked in just now') so each caller can route status text to
// its own status element (the Home overlay's pill vs. the Journal page's
// inline label) without this function needing to know which UI it's in.
async function submitJournalEntry(text, images = [], onStatusUpdate) {
    const entry = saveJournalEntry(text, images);
    console.log('Saved journal entry:', entry);
    if (entry.photosDropped && onStatusUpdate) {
        onStatusUpdate('Saved (photos were too large to keep)');
    }

    if (onStatusUpdate) onStatusUpdate('Reading your entry...');

    // Refresh the journal list/calendar immediately so a new entry shows up
    // right away even before analysis finishes (the analysis only affects
    // the reef's fish/coral, not the journal list's own contents).
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderJournalList === 'function') renderJournalList();

    if (typeof analyzeJournalEntry === 'function') {
        const analysis = await analyzeJournalEntry(text);
        updateJournalEntryAnalysis(entry.id, analysis);
        if (typeof renderJournalList === 'function') renderJournalList(); // show the mood tag
        console.log('Entry analysis:', analysis);

        if (typeof spawnFromAnalysis === 'function') {
            spawnFromAnalysis(analysis);
        }

        // Reef Forecast: translate mood into a living, reef-flavoured vibe label
        const moodVibes = {
            positive: '🌿 Calm Waters today',
            negative: '🧊 Restless Tide today',
            mixed:    '🌊 Shifting Currents today',
            neutral:  '🐚 Steady Reef today'
        };
        const vibeLabel = moodVibes[analysis && (analysis.mood || analysis.sentiment)] || '✓ Checked in';
        if (onStatusUpdate) onStatusUpdate(vibeLabel);
    } else if (onStatusUpdate) {
        onStatusUpdate('✓ Checked in just now');
    }

    return entry;
}


document.addEventListener('DOMContentLoaded', () => {
    const checkinBtn = document.getElementById('checkin-btn');
    const modal = document.getElementById('checkin-modal');
    const textarea = document.getElementById('checkin-textarea');
    const cancelBtn = document.getElementById('checkin-cancel');
    const submitBtn = document.getElementById('checkin-submit');
    const statusText = document.getElementById('status-text');

    function openModal() {
        if (!modal || !textarea) return;
        modal.classList.remove('hidden');
        textarea.value = '';
        textarea.focus();
    }

    function closeModal() {
        if (modal) modal.classList.add('hidden');
    }

    if (checkinBtn) checkinBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        // 'Write Today' goes straight to the Journal page — the real writing space
        const journalPage = document.getElementById('journal-page');
        if (journalPage) {
            journalPage.classList.remove('hidden');
            // Focus the notebook textarea after a brief transition
            setTimeout(() => {
                const ta = document.getElementById('journal-page-textarea');
                if (ta) ta.focus();
            }, 350);
        }
    });

    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    // Click on the dark backdrop (but not the box itself) also closes it
    if (modal) modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });

    if (submitBtn) submitBtn.addEventListener('click', async () => {
        const text = textarea.value.trim();
        if (!text) {
            textarea.focus();
            return;
        }

        // Close immediately so the UI doesn't block on the async analysis call
        closeModal();

        await submitJournalEntry(text, [], (statusMsg) => {
            if (statusText) statusText.innerText = statusMsg;
        });
    });

    // Quick keyboard shortcut: Cmd/Ctrl+Enter submits
    if (textarea) textarea.addEventListener('keydown', (event) => {
        if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
            submitBtn.click();
        }
    });

    // ---- In-page diary on the Journal page itself ----
    const pageTextarea = document.getElementById('journal-page-textarea');
    const pageSubmitBtn = document.getElementById('journal-page-submit');
    const pageStatus = document.getElementById('journal-write-status');
    const notebookDateHeader = document.getElementById('notebook-date-header');
    const notebookImgInput = document.getElementById('notebook-img-input');
    const notebookAttachments = document.getElementById('notebook-attachments');

    // Populate the warm date header
    if (notebookDateHeader) {
        const now = new Date();
        notebookDateHeader.textContent = now.toLocaleDateString(undefined, {
            weekday: 'long', month: 'long', day: 'numeric'
        });
    }

    // Track attached images as data URLs
    let pendingImages = [];

    function renderAttachmentPreviews() {
        if (!notebookAttachments) return;
        notebookAttachments.innerHTML = '';
        pendingImages.forEach((src, idx) => {
            const thumb = document.createElement('div');
            thumb.className = 'notebook-attachment-thumb';

            const img = document.createElement('img');
            img.src = src;
            img.alt = 'Attached photo';

            const removeBtn = document.createElement('button');
            removeBtn.className = 'notebook-attachment-remove';
            removeBtn.textContent = '✕';
            removeBtn.title = 'Remove';
            removeBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                pendingImages.splice(idx, 1);
                renderAttachmentPreviews();
            });

            thumb.appendChild(img);
            thumb.appendChild(removeBtn);
            notebookAttachments.appendChild(thumb);
        });
    }

    if (notebookImgInput) {
        notebookImgInput.addEventListener('change', () => {
            const files = Array.from(notebookImgInput.files || []);
            const readers = files.map(file => new Promise(resolve => {
                const reader = new FileReader();
                reader.onload = e => compressImageDataUrl(e.target.result).then(resolve);
                reader.readAsDataURL(file);
            }));
            Promise.all(readers).then(dataUrls => {
                pendingImages = pendingImages.concat(dataUrls);
                renderAttachmentPreviews();
                notebookImgInput.value = ''; // allow same file re-select
            });
        });
    }

    if (pageTextarea && pageSubmitBtn) {
        pageSubmitBtn.addEventListener('click', async () => {
            const text = pageTextarea.value.trim();
            if (!text && pendingImages.length === 0) {
                pageTextarea.focus();
                return;
            }

            pageSubmitBtn.disabled = true;
            const imagesToSave = pendingImages.slice();
            pageTextarea.value = '';
            pendingImages = [];
            renderAttachmentPreviews();

            try {
                await submitJournalEntry(text, imagesToSave, (statusMsg) => {
                    if (pageStatus) pageStatus.innerText = statusMsg;
                });
                
                // Show success briefly, keeping the journal panel open
                setTimeout(() => {
                    if (pageStatus) pageStatus.innerText = '';
                }, 3000);

            } catch (err) {
                console.error('Save failed:', err);
                if (pageStatus) pageStatus.innerText = 'Error saving entry.';
            } finally {
                pageSubmitBtn.disabled = false;
            }
        });

        // Same Cmd/Ctrl+Enter shortcut as the modal, for consistency
        pageTextarea.addEventListener('keydown', (event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                pageSubmitBtn.click();
            }
        });
    }

    // Calendar month navigation + clear-filter button
    initCalendarNav();

    // Close (x) buttons on the journal side panel
    document.querySelectorAll('[data-close-panel]').forEach(btn => {
        btn.addEventListener('click', (event) => {
            event.stopPropagation();
            const panelId = btn.getAttribute('data-close-panel');
            document.getElementById(panelId).classList.add('hidden');
        });
    });
});