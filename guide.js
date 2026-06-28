// guide.js - Guide Narration Bar
// A transparent cutscene-style bar across the bottom of the screen that briefly
// explains each section's purpose, every time you switch sections.
// Dismiss by pressing SPACE, or by clicking the bar itself.

const guideMessages = {
    home: "This is your Surface Island — it reflects your day-to-day life. Tap the water to dive into the Tank below.",
    sanctuary: "Welcome to the Tank of Echoes. Every piece of coral here grew from one of your past check-ins.",
    journal: "This is your Journal — a private log of everything you've checked in with. No one else can see it."
};

let guideHideTimer = null;

/**
 * Generic frame-cycling icon helper. Swaps an <img>'s src through a list of
 * paths on an interval, for a cheap flipbook-style idle animation -- no video
 * file needed, just a few still frames.
 *
 * @param {HTMLImageElement} imgElement - the <img> to animate
 * @param {string[]} framePaths - 2+ image paths, cycled in order then looped
 * @param {number} intervalMs - time between frame swaps
 * @returns {number} the interval ID, in case you need to clearInterval() it later
 */
function startIconCycle(imgElement, framePaths, intervalMs = 800) {
    if (!imgElement || !framePaths || framePaths.length < 2) return null;

    let frameIndex = 0;
    return setInterval(() => {
        frameIndex = (frameIndex + 1) % framePaths.length;
        imgElement.src = framePaths[frameIndex];
    }, intervalMs);
}

function hideGuideBar() {
    const bar = document.getElementById('guide-bar');
    if (!bar) return;
    bar.classList.remove('visible');
    if (guideHideTimer) {
        clearTimeout(guideHideTimer);
        guideHideTimer = null;
    }
}

// Decides whether the bar should use the light (navy text) or dark (white text)
// variant, based on what's actually visible behind it right now.
function getGuideTheme(section) {
    // Tank nav directly means the dark tank scene
    if (section === 'sanctuary') return 'theme-dark';
    if (section === 'home') return 'theme-light';

    // Journal is a full-page dark gradient overlay, so it always gets the
    // dark guide-bar variant regardless of whatever scene is sitting
    // underneath it.
    if (section === 'journal') return 'theme-dark';

    if (typeof activeScene !== 'undefined' && activeScene === 'tank') return 'theme-dark';
    return 'theme-light';
}

function showGuideForSection(section) {
    const bar = document.getElementById('guide-bar');
    const textEl = document.getElementById('guide-bar-text');
    if (!bar || !textEl) return;

    const message = guideMessages[section];
    if (!message) return;

    textEl.innerText = message;
    bar.classList.remove('hidden');

    // Swap theme classes so the glass tint + text color match the scene behind it
    bar.classList.remove('theme-light', 'theme-dark');
    bar.classList.add(getGuideTheme(section));

    // Force a reflow so re-triggering the same section still re-animates the slide-in
    bar.classList.remove('visible');
    requestAnimationFrame(() => bar.classList.add('visible'));

    if (guideHideTimer) clearTimeout(guideHideTimer);
    guideHideTimer = setTimeout(hideGuideBar, 7000);
}

document.addEventListener('DOMContentLoaded', () => {
    const bar = document.getElementById('guide-bar');
    if (bar) {
        bar.addEventListener('click', hideGuideBar);
    }

    // Idle icon animation: cycles the guide bar's icon through a few frames.
    // Currently pointed at a single existing fish sprite repeated, since no
    // original multi-frame artwork exists yet -- swap GUIDE_ICON_FRAMES below
    // once you have real frames (e.g. ['assets/myicon_1.png', 'assets/myicon_2.png', 'assets/myicon_3.png']).
    const guideIconEl = document.querySelector('.guide-bar-icon');
    const GUIDE_ICON_FRAMES = ['assets/ttt_1.png', 'assets/ttt_2.png', 'assets/ttt_3.png']; // placeholder: needs 2+ real frames to actually animate
    if (guideIconEl && GUIDE_ICON_FRAMES.length >= 2) {
        startIconCycle(guideIconEl, GUIDE_ICON_FRAMES, 800);
    }

    // SPACE skips/closes the current narration line
    document.addEventListener('keydown', (event) => {
        const tag = document.activeElement ? document.activeElement.tagName : '';
        const isTyping = tag === 'TEXTAREA' || tag === 'INPUT';
        if (isTyping) return; // don't hijack spacebar while the user is writing an entry

        if (event.code === 'Space' || event.key === ' ') {
            const isVisible = bar && bar.classList.contains('visible');
            if (isVisible) {
                event.preventDefault(); // stop page from scrolling on spacebar
                hideGuideBar();
            }
        }
    });
});