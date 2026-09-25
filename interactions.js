// interactions.js - Small interactions that make the site feel alive
//   1. Nav: a small capsule; its menu button opens a full-screen index of places
//   2. Orb: the glowing orb in the nav opens the fish chat from anywhere
//   3. Pages open as a circle that grows out of the button you pressed
//   4. Headlines rise in word by word
//   5. Custom bubble cursor (mouse only)
//   6. Tap the water: ripples on the reef, bubbles in the aquarium
//   7. Journal cards tilt toward the pointer
//   8. Magnetic buttons

(function () {
    const fine = window.matchMedia('(pointer: fine)').matches;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    // ---- 1. Menu: the capsule's button opens a full-screen index -------------------
    const nav = document.querySelector('.side-nav');
    const toggle = document.getElementById('menu-toggle');
    const sectionLabel = document.getElementById('capsule-section');
    function setMenu(open) {
        document.body.classList.toggle('menu-open', open);
        if (toggle) {
            toggle.setAttribute('aria-expanded', String(open));
            toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
        }
        if (open) {
            const sky = document.getElementById('sky-caption');
            const foot = document.getElementById('menu-sky');
            if (sky && foot && sky.textContent) foot.textContent = sky.textContent;
        }
    }
    if (toggle) toggle.addEventListener('click', e => { e.stopPropagation(); setMenu(!document.body.classList.contains('menu-open')); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') setMenu(false); });
    if (nav) {
        // Capture phase: app.js stops propagation on the nav buttons
        nav.addEventListener('click', e => {
            const btn = e.target.closest('button[data-nav]');
            if (btn) setTimeout(() => setMenu(false), 120);
            else if (e.target === nav || e.target.classList.contains('menu-inner')) setMenu(false);
        }, true);
        // Keep the capsule's label in sync with the active place
        const syncLabel = () => {
            const active = nav.querySelector('button[data-nav].active');
            if (active && sectionLabel && sectionLabel.textContent !== active.dataset.label) {
                sectionLabel.classList.remove('swap');
                void sectionLabel.offsetWidth;
                sectionLabel.textContent = active.dataset.label;
                sectionLabel.classList.add('swap');
            }
        };
        new MutationObserver(syncLabel).observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });
        // Hovering one place softly dims the others
        nav.querySelectorAll('button[data-nav]').forEach(btn => {
            btn.addEventListener('pointerenter', () => nav.classList.add('has-hover'));
            btn.addEventListener('pointerleave', () => nav.classList.remove('has-hover'));
        });
    }

    // ---- 2. Orb opens the chat anywhere ------------------------------------------------
    const orb = document.getElementById('nav-orb');
    if (orb) orb.addEventListener('click', e => {
        e.stopPropagation();
        const chat = document.getElementById('chat-panel');
        if (chat && !chat.classList.contains('hidden')) { chat.classList.add('hidden'); orb.classList.remove('open'); return; }
        const talk = document.getElementById('talk-to-fish-btn');
        if (talk) talk.click();
        orb.classList.add('open');
    });
    const chatPanel = document.getElementById('chat-panel');
    if (chatPanel && orb) new MutationObserver(() => orb.classList.toggle('open', !chatPanel.classList.contains('hidden')))
        .observe(chatPanel, { attributes: true, attributeFilter: ['class'] });

    // ---- 3. Pages grow out of the button you pressed ---------------------------------
    let lastPress = { x: window.innerWidth / 2, y: window.innerHeight - 40 };
    document.addEventListener('pointerdown', e => { lastPress = { x: e.clientX, y: e.clientY }; }, true);
    document.querySelectorAll('.journal-page').forEach(page => {
        let wasHidden = page.classList.contains('hidden');
        new MutationObserver(() => {
            const hidden = page.classList.contains('hidden');
            if (hidden === wasHidden) return; // ignore our own class changes
            wasHidden = hidden;
            if (!hidden) {
                page.style.setProperty('--ox', lastPress.x + 'px');
                page.style.setProperty('--oy', lastPress.y + 'px');
                page.classList.remove('reveal-in');
                void page.offsetWidth; // restart the animation
                page.classList.add('reveal-in');
            }
        }).observe(page, { attributes: true, attributeFilter: ['class'] });
    });

    // ---- 4. Headlines rise in word by word -------------------------------------------
    function splitWords(el) {
        if (el.dataset.split) return;
        el.dataset.split = '1';
        let i = 0;
        const walk = node => {
            Array.from(node.childNodes).forEach(child => {
                if (child.nodeType === 3) {
                    const frag = document.createDocumentFragment();
                    child.textContent.split(/(\s+)/).forEach(part => {
                        if (!part) return;
                        if (/^\s+$/.test(part)) { frag.appendChild(document.createTextNode(part)); return; }
                        const w = document.createElement('span');
                        w.className = 'w';
                        w.style.setProperty('--i', i++);
                        w.textContent = part;
                        frag.appendChild(w);
                    });
                    child.replaceWith(frag);
                } else if (child.nodeType === 1 && child.tagName !== 'BR') {
                    walk(child);
                }
            });
        };
        walk(el);
    }
    document.querySelectorAll('.display-mix').forEach(splitWords);

    // ---- 5. Bubble cursor (mouse only) -----------------------------------------------
    const cursor = document.getElementById('cursor');
    if (cursor && fine && !reduced) {
        document.body.classList.add('has-cursor');
        const ring = cursor.querySelector('.cursor-ring'), dot = cursor.querySelector('.cursor-dot');
        const label = cursor.querySelector('.cursor-label');
        let x = -100, y = -100, rx = -100, ry = -100;
        window.addEventListener('pointermove', e => { x = e.clientX; y = e.clientY; }, { passive: true });
        (function loop() {
            rx += (x - rx) * 0.18; ry += (y - ry) * 0.18;
            dot.style.transform = `translate(${x}px, ${y}px)`;
            ring.style.transform = `translate(${rx}px, ${ry}px)`;
            requestAnimationFrame(loop);
        })();
        document.addEventListener('pointerover', e => {
            const t = e.target;
            const interactive = t.closest('button, a, label, .cal-day, textarea, input, .cube-stage');
            const onWater = t.closest('#canvas-container') && !interactive;
            cursor.classList.toggle('is-hover', !!interactive);
            cursor.classList.toggle('is-water', !!onWater);
            let text = '';
            if (onWater && typeof activeScene !== 'undefined') text = activeScene === 'tank' ? 'Tap' : 'Drag · Scroll';
            if (t.closest('.cube-stage')) text = 'Enter';
            label.textContent = text;
        });
        document.addEventListener('pointerdown', () => cursor.classList.add('is-down'));
        document.addEventListener('pointerup', () => cursor.classList.remove('is-down'));
    }

    // ---- 6. Tap the water ------------------------------------------------------------
    const canvasBox = document.getElementById('canvas-container');
    let downAt = null;
    if (canvasBox) {
        canvasBox.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY }; });
        canvasBox.addEventListener('pointerup', e => {
            if (!downAt || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 8) return; // it was a drag
            if (typeof activeScene !== 'undefined' && activeScene === 'tank') {
                if (typeof releaseBubbles === 'function') releaseBubbles(e.clientX, e.clientY);
            }
            const ripple = document.createElement('span');
            ripple.className = 'water-ripple';
            ripple.style.left = e.clientX + 'px';
            ripple.style.top = e.clientY + 'px';
            document.body.appendChild(ripple);
            setTimeout(() => ripple.remove(), 1400);
        });
    }

    // ---- 7. Journal cards tilt toward the pointer ------------------------------------
    const list = document.getElementById('journal-entry-list');
    if (list && fine && !reduced) {
        list.addEventListener('pointermove', e => {
            const card = e.target.closest('.journal-entry');
            if (!card) return;
            const r = card.getBoundingClientRect();
            const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
            card.style.transform = `perspective(900px) rotateX(${-py * 4}deg) rotateY(${px * 5}deg) translateY(-2px)`;
            card.style.setProperty('--mx', (px + 0.5) * 100 + '%');
            card.style.setProperty('--my', (py + 0.5) * 100 + '%');
        });
        list.addEventListener('pointerout', e => {
            const card = e.target.closest('.journal-entry');
            if (card && !card.contains(e.relatedTarget)) card.style.transform = '';
        });
    }

    // ---- 8. Magnetic buttons ---------------------------------------------------------
    if (fine && !reduced) {
        document.querySelectorAll('.notebook-save-btn, .sound-toggle, .nav-orb, .menu-toggle').forEach(btn => {
            btn.addEventListener('pointermove', e => {
                const r = btn.getBoundingClientRect();
                btn.style.translate = `${(e.clientX - (r.left + r.width / 2)) * 0.2}px ${(e.clientY - (r.top + r.height / 2)) * 0.3}px`;
            });
            btn.addEventListener('pointerleave', () => { btn.style.translate = ''; });
        });
    }
})();
