module.exports = async (req, res) => {
    // Only allow POST requests for the chat API
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed. Use POST.' });
    }

    try {
        const { messages, system, max_tokens } = req.body;
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not set.' });
        }

        // 1. Translate our frontend's format (which expects Anthropic/OpenAI shape)
        // into the format that the Gemini REST API expects.
        let systemInstruction = null;
        if (system) {
            systemInstruction = {
                parts: [{ text: system }]
            };
        }

        const contents = messages.map(msg => ({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }]
        }));

        const geminiReqBody = {
            contents,
            generationConfig: {
                maxOutputTokens: max_tokens || 1024
            }
        };

        if (systemInstruction) {
            geminiReqBody.systemInstruction = systemInstruction;
        }

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
        
        // 2. Send request to Google's Gemini API
        const response = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(geminiReqBody)
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Gemini API error ${response.status}: ${errText}`);
        }

        const data = await response.json();
        
        // 3. Extract the text reply from Gemini's response structure
        const replyText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

        // 4. Translate back into the format the frontend (chat.js, sentiment.js) expects
        res.json({
            content: [{ type: 'text', text: replyText }]
        });

    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ error: error.message });
    }
};
