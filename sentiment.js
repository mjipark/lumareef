// sentiment.js - Sentiment & Theme Analysis for Journal Entries
// Calls Claude (via our local proxy at /api/chat -- see server.js) to turn
// raw journal text into structured data: { sentiment, intensity, themes }
// This is what makes agent.js's fish/coral spawning actually mean something,
// instead of being random.
//
// Talks to our own local proxy, NOT directly to api.anthropic.com or a local
// Ollama server -- the proxy is what keeps the real API key server-side.

const SENTIMENT_SYSTEM_PROMPT = `You analyze short personal journal entries for a reflective journaling app.
Given the user's entry, respond with ONLY a JSON object, no preamble, no markdown fences, in this exact shape:

{"sentiment": "positive" | "neutral" | "negative", "intensity": 0.0-1.0, "themes": ["theme1", "theme2"]}

Rules:
- sentiment: the overall emotional tone of the entry.
- intensity: how strongly that tone is expressed (0.0 = very mild, 1.0 = very strong).
- themes: 1-3 short lowercase tags capturing what the entry is about (e.g. "stress", "friendship", "school", "growth", "rest", "conflict"). Infer from content, don't just repeat words verbatim.
- If the entry is empty, ambiguous, or too short to read into, return sentiment "neutral", intensity 0.3, themes [].
- Never include any text outside the JSON object.`;

// Safe default used whenever analysis fails for any reason, so a flaky
// network or a malformed model response never blocks saving the entry itself.
const FALLBACK_ANALYSIS = { sentiment: 'neutral', intensity: 0.3, themes: [] };

// Claude sometimes wraps JSON in markdown fences even when told not to --
// strip those before parsing rather than trusting the output is always raw JSON.
function stripCodeFences(text) {
    return text.trim().replace(/^```json\s*/i, '').replace(/^```\s*/, '').replace(/```$/, '').trim();
}

/**
 * Analyzes a journal entry's text and returns { sentiment, intensity, themes }.
 * Falls back to FALLBACK_ANALYSIS if the API call fails or returns something
 * that doesn't parse as valid JSON in the expected shape.
 */
async function analyzeJournalEntry(text) {
    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system: SENTIMENT_SYSTEM_PROMPT,
                max_tokens: 200,
                messages: [
                    { role: 'user', content: text }
                ]
            })
        });

        if (!response.ok) {
            throw new Error(`Proxy responded with ${response.status}`);
        }

        const data = await response.json();
        const textBlocks = (data.content || []).filter(b => b.type === 'text').map(b => b.text);
        const rawReply = textBlocks.join('\n');

        const cleaned = stripCodeFences(rawReply);
        const parsed = JSON.parse(cleaned);

        // Basic shape validation -- if the model returned valid JSON but the
        // wrong shape, fall back rather than passing garbage downstream to
        // agent.js's spawnFromAnalysis().
        if (!parsed.sentiment || typeof parsed.intensity !== 'number' || !Array.isArray(parsed.themes)) {
            console.warn('Sentiment analysis returned unexpected shape:', parsed);
            return FALLBACK_ANALYSIS;
        }

        return parsed;
    } catch (err) {
        console.error('Sentiment analysis failed:', err);
        return FALLBACK_ANALYSIS;
    }
}