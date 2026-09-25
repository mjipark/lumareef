// guide.js - Floating tips
// Short, step-by-step hints that float next to the thing they're about
// (the island, the orb, the menu, the Save button...). Each place has its own
// little tour. It plays automatically the first time you visit that place,
// and the "?" button in the corner replays it whenever you like.
//
// app.js calls showGuideForSection(section) whenever you switch places.

const TIP_TOURS = {
    home: [
        { target: 'center', gesture: 'drag', text: '<b>Drag</b> left or right to turn your island.' },
        { target: '#dive-cue', fallback: 'bottom', text: '<b>Scroll down</b> (or swipe up on a phone) to dive into the aquarium.' },
        { target: '#nav-orb', text: 'Tap the <b>orb</b> any time to talk to a fish.' },
        { target: '#menu-toggle', text: 'Open the <b>menu</b> to write in your journal.' }
    ],
    sanctuary: [
        { target: 'center', text: 'Every <b>coral</b> here grew from one of your days. Jellyfish drift in on the quieter ones.' },
        { target: 'center', gesture: 'tap', text: '<b>Tap the water</b> to release bubbles.' },
        { target: '#nav-orb', text: 'Talk to a fish with the <b>orb</b>. Your messages rise as bubbles.' }
    ],
    journal: [
        { target: '#journal-page-textarea', text: '<b>Write</b> a few lines about today, or tap a prompt to start.' },
        { target: '#journal-page-submit', text: '<b>Save</b> it. The AI reads the mood, and a coral grows for it.' },
        { target: '.journal-tab[data-tab="past"]', text: 'Your old entries live in <b>Past entries</b>. You can search them there.' },
        { target: '.journal-calendar', text: 'Or <b>tap a date</b> to jump straight to what you wrote that day.' }
    ],
    about: [
        { target: 'center', gesture: 'scroll', text: '<b>Scroll</b> to follow the story. The plankton changes shape as you go.' }
    ]
};

const TIPS_SEEN_KEY = 'lumareef_tips_seen';
function tipsSeen() { try { return JSON.parse(localStorage.getItem(TIPS_SEEN_KEY) || '{}'); } catch (e) { return {}; } }
function markTipsSeen(section) {
    try { const s = tipsSeen(); s[section] = true; localStorage.setItem(TIPS_SEEN_KEY, JSON.stringify(s)); } catch (e) { /* storage off */ }
}

let tipLayer = null, tipCard = null, tipRing = null, tipGesture = null;
let tipState = null; // { section, steps, index }
let currentSection = 'home';

function buildTipLayer() {
    if (tipLayer) return;
    tipLayer = document.createElement('div');
    tipLayer.id = 'tip-layer';
    tipLayer.innerHTML = `
        <div class="tip-ring" aria-hidden="true"></div>
        <div class="tip-gesture" aria-hidden="true"></div>
        <div class="tip-card" role="dialog" aria-live="polite">
            <div class="tip-step mono"></div>
            <p class="tip-text"></p>
            <div class="tip-actions">
                <button type="button" class="tip-skip">Skip</button>
                <button type="button" class="tip-next">Next</button>
            </div>
        </div>`;
    document.body.appendChild(tipLayer);
    tipCard = tipLayer.querySelector('.tip-card');
    tipRing = tipLayer.querySelector('.tip-ring');
    tipGesture = tipLayer.querySelector('.tip-gesture');
    tipLayer.querySelector('.tip-next').addEventListener('click', e => { e.stopPropagation(); nextTip(); });
    tipLayer.querySelector('.tip-skip').addEventListener('click', e => { e.stopPropagation(); endTips(); });
    window.addEventListener('resize', () => { if (tipState) placeTip(); });
}

function targetRect(step) {
    if (step.target !== 'center') {
        const el = document.querySelector(step.target);
        if (el) {
            const r = el.getBoundingClientRect();
            if (r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' && getComputedStyle(el).opacity !== '0') return r;
        }
        if (step.fallback === 'bottom') {
            const w = window.innerWidth, h = window.innerHeight;
            return { left: w / 2 - 20, top: h - 150, width: 40, height: 40, right: w / 2 + 20, bottom: h - 110 };
        }
    }
    const w = window.innerWidth, h = window.innerHeight;
    return { left: w / 2 - 30, top: h * 0.5 - 30, width: 60, height: 60, right: w / 2 + 30, bottom: h * 0.5 + 30 };
}

function placeTip() {
    const step = tipState.steps[tipState.index];
    const r = targetRect(step);
    const cx = r.left + r.width / 2, cy = r.top + r.height / 2;

    // Soft highlight around the thing the tip is about: a pulsing circle for
    // small targets, a dashed outline hugging larger ones
    const big = step.target !== 'center' && (r.width > 120 || r.height > 120);
    if (big) {
        tipRing.style.width = (r.width + 16) + 'px';
        tipRing.style.height = (r.height + 16) + 'px';
        tipRing.style.left = (r.left - 8) + 'px';
        tipRing.style.top = (r.top - 8) + 'px';
    } else {
        const ringSize = Math.max(Math.max(r.width, r.height) + 20, 56);
        tipRing.style.width = tipRing.style.height = ringSize + 'px';
        tipRing.style.left = (cx - ringSize / 2) + 'px';
        tipRing.style.top = (cy - ringSize / 2) + 'px';
    }
    tipRing.classList.toggle('is-big', big);

    tipGesture.className = 'tip-gesture' + (step.gesture ? ' g-' + step.gesture : '');
    tipGesture.style.left = cx + 'px';
    tipGesture.style.top = cy + 'px';

    // Card sits above the target if there's room, otherwise below
    const cw = tipCard.offsetWidth || 300, ch = tipCard.offsetHeight || 120, gap = 22;
    let top = r.top - ch - gap;
    if (big && top < 16) { top = r.top + 14; }
    let below = false;
    if (top < 16) { top = r.bottom + gap; below = true; }
    if (big && r.top - ch - gap < 16 && r.top + 14 + ch < window.innerHeight - 16) { top = r.top + 14; below = false; }
    if (top + ch > window.innerHeight - 16) top = Math.max(16, window.innerHeight - ch - 16);
    let left = Math.min(Math.max(cx - cw / 2, 16), window.innerWidth - cw - 16);
    tipCard.style.left = left + 'px';
    tipCard.style.top = top + 'px';
    tipCard.classList.toggle('below', below);
    tipCard.style.setProperty('--arrow-x', Math.min(Math.max(cx - left, 24), cw - 24) + 'px');
}

function renderTip() {
    const { steps, index } = tipState;
    const step = steps[index];
    tipCard.querySelector('.tip-step').textContent = steps.length > 1 ? `Tip ${index + 1} of ${steps.length}` : 'Tip';
    tipCard.querySelector('.tip-text').innerHTML = step.text;
    tipCard.querySelector('.tip-next').textContent = index === steps.length - 1 ? 'Got it' : 'Next';
    tipCard.querySelector('.tip-skip').style.visibility = index === steps.length - 1 ? 'hidden' : 'visible';
    tipCard.classList.remove('pop');
    void tipCard.offsetWidth;
    tipCard.classList.add('pop');
    placeTip();
    requestAnimationFrame(placeTip); // re-measure once the text has laid out
}

function startTips(section, force) {
    const steps = TIP_TOURS[section];
    if (!steps) return;
    if (!force && tipsSeen()[section]) return;
    buildTipLayer();
    tipState = { section, steps, index: 0 };
    tipLayer.classList.add('visible');
    renderTip();
}

function nextTip() {
    if (!tipState) return;
    if (tipState.index < tipState.steps.length - 1) { tipState.index++; renderTip(); }
    else endTips();
}

function endTips() {
    if (!tipState) return;
    markTipsSeen(tipState.section);
    tipState = null;
    if (tipLayer) tipLayer.classList.remove('visible');
}

// Called by app.js whenever you switch places
function showGuideForSection(section) {
    currentSection = section;
    endTips();
    // wait for the page transition to finish before pointing at things
    setTimeout(() => startTips(section, false), section === 'sanctuary' ? 1900 : 900);
}
// Kept so older calls don't break
function hideGuideBar() { endTips(); }

document.addEventListener('DOMContentLoaded', () => {
    // "?" button: replay the tips for wherever you are
    const help = document.createElement('button');
    help.type = 'button';
    help.id = 'help-toggle';
    help.className = 'help-toggle';
    help.setAttribute('aria-label', 'Show tips for this page');
    help.textContent = '?';
    document.body.appendChild(help);
    help.addEventListener('click', e => { e.stopPropagation(); endTips(); startTips(currentSection, true); });
    const stage = document.getElementById('cube-stage');
    if (stage) stage.addEventListener('click', () => help.classList.add('visible'), { once: true });

    document.addEventListener('keydown', e => {
        if (!tipState) return;
        const tag = document.activeElement ? document.activeElement.tagName : '';
        if (tag === 'TEXTAREA' || tag === 'INPUT') return;
        if (e.key === 'Escape') endTips();
        else if (e.key === 'Enter' || e.code === 'Space') { e.preventDefault(); nextTip(); }
    });
});
