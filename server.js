// server.js (Your local backend, now powered by Ollama instead of the
// Anthropic API)
//
// WHY THIS CHANGED: this project originally called Anthropic's Claude API,
// which requires a real, billed API key from console.anthropic.com. Since
// the goal here is to run everything free and local, this version instead
// talks to Ollama (https://ollama.com) running on your own machine.
//
// IMPORTANT: "Claude via Ollama" isn't a real thing -- Ollama runs
// open-weight models (Llama, Qwen, Gemma, etc.), not Claude. This file now
// calls a local Llama model through Ollama instead.
//
// chat.js, sentiment.js, and islands.js were NOT changed -- they still call
// our own /api/chat route the exact same way, with the exact same request
// shape ({ system, max_tokens, messages }) and expect the exact same
// response shape back ({ content: [{ type: 'text', text: '...' }] }).
// This file is the only thing that changed: it now translates that request
// into Ollama's format, calls Ollama instead of Anthropic, then translates
// Ollama's reply back into the same shape the frontend already expects.
require('dotenv').config();
const express = require('express');
const path = require('path');
const app = express();
app.use(express.json());

// Serve the static frontend files (index.html, app.js, style.css, assets/, etc.)
// from the same folder this server.js lives in.
app.use(express.static(__dirname));

// Ollama's local server, started automatically when Ollama is installed/running.
const OLLAMA_URL = 'http://localhost:11434/api/chat';

// Which local model to use. Must already be pulled via `ollama pull <name>`
// -- check what you have with `ollama list`. Override via .env if you'd
// rather point this at a different model without editing code.
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1';

app.post('/api/chat', async (req, res) => {
    try {
        // `system` is optional -- sentiment.js style calls might not send one,
        // but chat.js needs it for CHAT_SYSTEM_PROMPT + journal context.
        const { messages, system, max_tokens } = req.body;

        // Ollama's /api/chat has no separate `system` field (unlike
        // Anthropic) -- the system prompt is just another message in the
        // array, with role "system", placed first.
        const ollamaMessages = system
            ? [{ role: 'system', content: system }, ...messages]
            : messages;

        const ollamaResponse = await fetch(OLLAMA_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OLLAMA_MODEL,
                messages: ollamaMessages,
                stream: false, // we want one complete JSON object back, not a token stream
                options: {
                    // Ollama's rough equivalent of Anthropic's max_tokens.
                    num_predict: max_tokens || 1024
                }
            })
        });

        if (!ollamaResponse.ok) {
            const errText = await ollamaResponse.text();
            throw new Error(`Ollama responded with ${ollamaResponse.status}: ${errText}`);
        }

        const ollamaData = await ollamaResponse.json();

        // Ollama's reply shape: { message: { role: 'assistant', content: '...' }, ... }
        // Anthropic's (and what chat.js/sentiment.js/islands.js expect):
        // { content: [{ type: 'text', text: '...' }] }
        // Translate here so nothing on the frontend needs to change.
        const replyText = (ollamaData.message && ollamaData.message.content) || '';

        res.json({
            content: [{ type: 'text', text: replyText }]
        });
    } catch (error) {
        console.error('Ollama API error:', error);
        console.error(
            'If this says "fetch failed" or "ECONNREFUSED", Ollama likely isn\'t ' +
            'running -- start it with `ollama serve` (or just open the Ollama app), ' +
            'and make sure the model below has been pulled: ' + OLLAMA_MODEL
        );
        res.status(500).json({ error: error.message });
    }
});

app.listen(3000, () => console.log('Proxy server running on http://127.0.0.1:3000 (using Ollama model: ' + OLLAMA_MODEL + ')'));