// Simple Express server to proxy Claude API requests
// This avoids CORS issues and keeps API key secure

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Claude API configuration
const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';

// Translation endpoint
app.post('/api/translate', async (req, res) => {
    try {
        const { text, sourceLang, targetLang } = req.body;

        if (!text) {
            return res.status(400).json({ error: 'Text is required' });
        }

        // Get API key from environment variable
        const apiKey = process.env.CLAUDE_API_KEY;
        if (!apiKey) {
            return res.status(500).json({
                error: 'Claude API key not configured. Please set CLAUDE_API_KEY in .env file'
            });
        }

        // Map language codes to names
        const langNames = {
            'en-US': 'English',
            'zh-CN': 'Chinese'
        };

        const sourceName = langNames[sourceLang] || sourceLang;
        const targetName = langNames[targetLang] || targetLang;

        const prompt = `Translate the following ${sourceName} text to ${targetName}.
Only provide the translation, no explanations or additional text:

${text}`;

        console.log(`📡 Translating: ${sourceLang} → ${targetLang}`);
        console.log(`   Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

        // Call Claude API
        const response = await fetch(CLAUDE_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: CLAUDE_MODEL,
                max_tokens: 1024,
                messages: [{
                    role: 'user',
                    content: prompt
                }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('❌ Claude API error:', errorData);
            return res.status(response.status).json({
                error: `Claude API error: ${errorData.error?.message || response.statusText}`
            });
        }

        const data = await response.json();
        const translation = data.content[0].text.trim();

        console.log(`✅ Translation: "${translation.substring(0, 50)}${translation.length > 50 ? '...' : ''}"`);

        res.json({ translation });
    } catch (error) {
        console.error('❌ Server error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    const hasApiKey = !!process.env.CLAUDE_API_KEY;
    res.json({
        status: 'ok',
        apiKeyConfigured: hasApiKey,
        message: hasApiKey ? 'Server is ready' : 'CLAUDE_API_KEY not set in .env'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 Translation Server Started');
    console.log('='.repeat(60));
    console.log(`📍 Server running on: http://localhost:${PORT}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🌐 Translation endpoint: http://localhost:${PORT}/api/translate`);
    console.log('');

    if (process.env.CLAUDE_API_KEY) {
        console.log('✅ Claude API key configured');
    } else {
        console.log('⚠️  Claude API key NOT configured!');
        console.log('   Create a .env file with: CLAUDE_API_KEY=your-key-here');
    }

    console.log('='.repeat(60));
});
