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

    // 2. Spawn a rising bubble in the Tank of Echoes for this message
    if (typeof spawnChatBubble === 'function' && typeof activeScene !== 'undefined' && activeScene === 'tank') {
        spawnChatBubble(userText);
    }

    // 3. Local crisis check runs regardless of the model's response
    const isCrisis = detectCrisisLanguage(userText);


    // 3. Show a "thinking" placeholder bubble with a spinning indicator
    const thinkingBubble = appendThinkingBubble();

    try {
        // 4. Call our local proxy (server.js), which calls Claude server-side
        const journalContext = buildJournalContext();
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system: CHAT_SYSTEM_PROMPT + '\n\n' + journalContext,
                max_tokens: 300,
                messages: chatHistory
            })
        });

        if (!response.ok) {
            throw new Error(`Proxy responded with ${response.status}`);
        }

        const data = await response.json();

        // 5. Extract text blocks from the Anthropic response shape
        const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text);
        const replyText = textBlocks.join('\n').trim() || "Sorry, I'm having trouble finding the words right now.";

        // 6. Update the thinking bubble with the real reply
        resolveThinkingBubble(thinkingBubble, replyText);

        // 7. Save assistant reply to history
        chatHistory.push({ role: 'assistant', content: replyText });
    } catch (err) {
        console.error('Chat API error:', err);
        resolveThinkingBubble(thinkingBubble, "I'm having trouble hearing you through the water right now. Could you try again in a moment?");
        // Don't keep a broken turn in history -- remove the user message we
        // pushed in step 1 so a retry doesn't send a duplicated/confused thread.
        chatHistory.pop();
    }

    // 8. Crisis resources shown independent of whether the API call succeeded
    if (isCrisis) {
        appendCrisisResources();
    }
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
            }
        });
    }

    function handleSend() {
        const text = chatInput.value.trim();
        if (!text) return;
        chatInput.value = '';
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