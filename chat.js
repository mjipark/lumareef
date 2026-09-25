// chat.js - "Talk to a fish" emotional support companion
// Lives in the Tank. Has light awareness of journal entries
// so it can react to what the user has actually written, plus a general chat mode.
//
// IMPORTANT: this is a support companion, not a therapist or crisis service.
// A lightweight local keyword check runs on every message BEFORE/ALONGSIDE the
// API call so that crisis resources are shown even if the model response misses it.
//
// Talks to our own local proxy at /api/chat (see server.js), NOT directly to
// api.anthropic.com -- direct browser calls to Anthropic are blocked by CORS,
// and the proxy is what keeps the real API key server-side out of the browser.

const CHAT_SYSTEM_PROMPT = `You are a small, sweet fish living in the user's personal digital sanctuary called LUMA REEF. The user comes here to check in with their feelings. Your role:

- Be warm, affectionate, and genuinely tender -- like a gentle, caring friend who's always happy to see them. Use soft, sweet language naturally (e.g. "oh sweetheart," "that sounds tough, love," small caring touches like that), but don't overdo it to the point of sounding fake or sugary.
- Be encouraging and full of soft praise when it fits -- celebrate even small wins, and reassure them gently when things are hard.
- Short, natural responses (2-5 sentences) - this is a chat, not an essay.
- You are a supportive companion, NOT a therapist, doctor, or crisis counselor. Never diagnose, never claim clinical expertise.
- If the user references something from their journal entries (provided below), respond to it specifically and warmly.
- If the user seems to be in serious distress, gently encourage them to talk to a real person they trust, or a counselor - without being alarmist or clinical about it.
- Keep a calm, sweet, slightly playful undersea tone, but don't be silly or dismissive of real feelings -- sweetness should never come at the cost of taking them seriously.
- Never pretend to be a licensed professional or claim you can replace one.`;

// Minimal local safety net: if any of these patterns appear, we show crisis
// resources directly in the chat UI, independent of whatever the model says.
const CRISIS_PATTERNS = [
    /\bkill myself\b/i,
    /\bsuicid/i,
    /\bend my life\b/i,
    /\bwant to die\b/i,
    /\bself[\s-]?harm/i,
    /\bhurt myself\b/i,
    /\bno reason to live\b/i
];

function detectCrisisLanguage(text) {
    return CRISIS_PATTERNS.some(pattern => pattern.test(text));
}

function appendChatMessage(role, text) {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg chat-msg-' + role;
    bubble.innerText = text;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
}

// Same bubble shape as appendChatMessage, but shows three bouncing dots
// (Instagram/Messenger-style typing indicator) instead of literal '...'
// text while waiting on the model's reply -- swap it out later with
// resolveThinkingBubble() once the real reply (or an error fallback) is ready.
function appendThinkingBubble() {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return null;

    const bubble = document.createElement('div');
    bubble.className = 'chat-msg chat-msg-assistant chat-msg-thinking';
    bubble.innerHTML = `
        <div class="chat-typing-dots" aria-label="Thinking...">
            <span></span><span></span><span></span>
        </div>
    `;
    messagesEl.appendChild(bubble);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return bubble;
}

// Clears the spinner markup and drops in the final reply as plain text,
// going back to the same .innerText approach appendChatMessage uses
// elsewhere (keeps user-authored/model-generated text safely escaped).
function resolveThinkingBubble(bubble, text) {
    if (!bubble) return;
    bubble.classList.remove('chat-msg-thinking');
    bubble.innerText = text;
}

function appendCrisisResources() {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    const box = document.createElement('div');
    box.className = 'chat-crisis-box';
    box.innerHTML = `
        <strong>If you're going through something serious, please reach out to a real person.</strong>
        <ul>
            <li>Korea: 1393 (Suicide Prevention Hotline, 24/7) or 129 (Mental Health Crisis Line)</li>
            <li>Outside Korea: please search for your local crisis line, or contact someone you trust right now</li>
        </ul>
        <span>This fish cares about you, but it isn't equipped to help with this alone.</span>
    `;
    messagesEl.appendChild(box);
    messagesEl.scrollTop = messagesEl.scrollHeight;
}

// Build conversation history for the API, including a short window of recent
// journal entries so the fish can react to actual check-ins when relevant.
let chatHistory = []; // [{role: 'user'|'assistant', content: '...'}]

function buildJournalContext() {
    if (typeof getJournalEntries !== 'function') return '';
    const entries = getJournalEntries().slice(-5); // last 5 entries, oldest first
    if (entries.length === 0) return 'The user has no journal entries yet.';

    return 'Recent journal entries (most recent last):\n' + entries.map(e =>
        `- (${new Date(e.createdAt).toLocaleDateString()}) ${e.text}`
    ).join('\n');
}

async function sendChatMessage(userText) {
    // 1. Show user message in UI immediately
    appendChatMessage('user', userText);
    chatHistory.push({ role: 'user', content: userText });

    // 2. Spawn a rising bubble for the user's question in the Tank of Echoes
    if (typeof spawnChatBubble === 'function' && typeof activeScene !== 'undefined' && activeScene === 'tank') {
        spawnChatBubble(userText);
    }

    // 3. Local crisis check runs regardless of the model's response
    const isCrisis = detectCrisisLanguage(userText);

    // 4. Show a "thinking" placeholder bubble
    const thinkingBubble = appendThinkingBubble();
    const panel = document.getElementById('chat-panel');
    if (panel) panel.classList.add('is-thinking');

    try {
        // 5. Call our Vercel serverless function (/api/chat)
        const journalContext = buildJournalContext();
        const response = await fetch(LUMA_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system: CHAT_SYSTEM_PROMPT + '\n\n' + journalContext,
                max_tokens: 300,
                messages: chatHistory
            })
        });

        const responseText = await response.text();
        console.log('[chat] API raw response status:', response.status, responseText.slice(0, 300));

        if (!response.ok) {
            throw new Error(`API ${response.status}: ${responseText.slice(0, 200)}`);
        }

        const data = JSON.parse(responseText);

        // 6. Extract text — handles both Anthropic {content:[{type:'text',text:'...'}]} shape
        //    and any plain {reply:'...'} shape we might get
        let replyText = '';
        if (data.content && Array.isArray(data.content)) {
            replyText = data.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
        } else if (data.reply) {
            replyText = data.reply;
        } else if (typeof data === 'string') {
            replyText = data;
        }
        replyText = replyText || "I hear you, sweet friend. Let me think for a moment...";

        // 7. Update the thinking bubble with the real reply
        resolveThinkingBubble(thinkingBubble, replyText);

        // 8. Save assistant reply to history
        chatHistory.push({ role: 'assistant', content: replyText });

        // 9. Also spawn a bubble for the AI reply (summarized) in the Tank
        if (typeof spawnChatBubble === 'function' && typeof activeScene !== 'undefined' && activeScene === 'tank') {
            spawnChatBubble(replyText);
        }

    } catch (err) {
        console.error('[chat] API error:', err);
        resolveThinkingBubble(thinkingBubble, "I'm having a little trouble with the current right now — try again in a moment? 🐠");
        chatHistory.pop(); // remove failed user turn
    }

    if (panel) panel.classList.remove('is-thinking');

    // 10. Crisis resources shown independent of API result
    if (isCrisis) {
        appendCrisisResources();
    }
}




// Quick-start replies shown under the greeting; tapping one sends it
const CHAT_SUGGESTIONS = ['I had a good day', "I'm feeling a bit anxious", 'What did I write this week?', 'I just need to vent'];
function appendSuggestions() {
    const messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;
    const wrap = document.createElement('div');
    wrap.className = 'chat-suggestions';
    CHAT_SUGGESTIONS.forEach(text => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'chat-chip';
        b.textContent = text;
        b.addEventListener('click', () => { wrap.remove(); sendChatMessage(text); });
        wrap.appendChild(b);
    });
    messagesEl.appendChild(wrap);
}

document.addEventListener('DOMContentLoaded', () => {
    const talkBtn = document.getElementById('talk-to-fish-btn');
    const chatPanel = document.getElementById('chat-panel');
    const chatInput = document.getElementById('chat-input');
    const chatSend = document.getElementById('chat-send');

    if (talkBtn) {
        talkBtn.addEventListener('click', (event) => {
            event.stopPropagation();
            if (typeof closeAllPanels === 'function') closeAllPanels();
            chatPanel.classList.remove('hidden');

            // Greet once per session on first open
            const messagesEl = document.getElementById('chat-messages');
            if (messagesEl && messagesEl.children.length === 0) {
                appendChatMessage('assistant', "Oh, hi there! I've been swimming around your reef thinking about you. How are you doing today, sweet friend?");
                appendSuggestions();
            }
            setTimeout(() => chatInput && chatInput.focus(), 350);
        });
    }

    // The box grows with what you type (up to a few lines); Send lights up
    // only when there's something to send
    function syncInput() {
        if (!chatInput) return;
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
        if (chatSend) chatSend.disabled = !chatInput.value.trim();
    }
    if (chatInput) chatInput.addEventListener('input', syncInput);

    function handleSend() {
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';
        syncInput();
        const chips = document.querySelector('.chat-suggestions');
        if (chips) chips.remove();
        sendChatMessage(text);
    }

    if (chatSend) chatSend.addEventListener('click', handleSend);
    if (chatInput) {
        chatInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                handleSend();
            }
        });
    }
});