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
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
    return entry;
}

// Patches an existing entry's analysis field after the fact (since sentiment
// analysis is an async API call that finishes after the entry is first saved).
function updateJournalEntryAnalysis(entryId, analysis) {
    const entries = getJournalEntries();
    const target = entries.find(e => e.id === entryId);
    if (!target) return;
    target.analysis = analysis;
    localStorage.setItem(JOURNAL_STORAGE_KEY, JSON.stringify(entries));
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
}

function renderJournalList() {
    const listEl = document.getElementById('journal-entry-list');
    if (!listEl) return;

    let entries = getJournalEntries().slice().reverse(); // newest first

    if (calSelectedDateKey) {
        entries = entries.filter(e => getLocalDateKey(e.createdAt) === calSelectedDateKey);
    }

    if (entries.length === 0) {
        listEl.innerHTML = calSelectedDateKey
            ? '<p class="journal-empty">No check-ins on this date.</p>'
            : '<p class="journal-empty">No check-ins yet. Write your first one above.</p>';
        return;
    }

    listEl.innerHTML = entries.map(entry => `
        <div class="journal-entry">
            <div class="journal-entry-date">${formatEntryDate(entry.createdAt)}</div>
            <div class="journal-entry-text">${escapeHtml(entry.text)}</div>
            ${entry.images && entry.images.length ? `<div class="journal-entry-images">${entry.images.map(src => `<img class="journal-entry-img" src="${src}" alt="Attached photo">`).join('')}</div>` : ''}
        </div>
    `).join('');
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

    if (onStatusUpdate) onStatusUpdate('Reading your entry...');

    // Refresh the journal list/calendar immediately so a new entry shows up
    // right away even before analysis finishes (the analysis only affects
    // the reef's fish/coral, not the journal list's own contents).
    if (typeof renderCalendar === 'function') renderCalendar();
    if (typeof renderJournalList === 'function') renderJournalList();

    if (typeof analyzeJournalEntry === 'function') {
        const analysis = await analyzeJournalEntry(text);
        updateJournalEntryAnalysis(entry.id, analysis);
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
        const vibeLabel = moodVibes[analysis && analysis.mood] || '✓ Checked in';
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
        modal.classList.remove('hidden');
        textarea.value = '';
        textarea.focus();
    }

    function closeModal() {
        modal.classList.add('hidden');
    }

    checkinBtn.addEventListener('click', (event) => {
        event.stopPropagation(); // don't let this trigger the dive-on-click handler in app.js
        openModal();
    });

    cancelBtn.addEventListener('click', closeModal);

    // Click on the dark backdrop (but not the box itself) also closes it
    modal.addEventListener('click', (event) => {
        if (event.target === modal) closeModal();
    });

    submitBtn.addEventListener('click', async () => {
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
    textarea.addEventListener('keydown', (event) => {
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
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
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
                reader.onload = e => resolve(e.target.result);
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

            await submitJournalEntry(text, imagesToSave, (statusMsg) => {
                if (pageStatus) pageStatus.innerText = statusMsg;
            });

            pageSubmitBtn.disabled = false;
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