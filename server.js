// Simple Express server for static file serving and Azure Speech token endpoint
// Serves the translator app and provides secure token endpoint for Azure Speech

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Azure Speech token endpoint (secure - doesn't expose API key to client)
app.get('/api/speech-token', (req, res) => {
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION || 'eastus';

    if (!speechKey || speechKey === 'your-azure-speech-key-here') {
        return res.status(500).json({
            error: 'Azure Speech key not configured. Please set AZURE_SPEECH_KEY in .env file'
        });
    }

    res.json({
        token: speechKey,
        region: speechRegion
    });
});

// Free Translation endpoint using MyMemory API
app.post('/api/translate', async (req, res) => {
    const { text, from, to } = req.body;

    try {
        const axios = require('axios');

        // Map language codes to MyMemory format
        const langMap = {
            'en': 'en-US',
            'zh-Hans': 'zh-CN',
            'zh-CN': 'zh-CN'
        };

        const sourceLang = langMap[from] || from;
        const targetLang = langMap[to] || to;

        // Use MyMemory free translation API (no key required, 1000 words/day)
        const endpoint = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceLang}|${targetLang}`;

        const response = await axios.get(endpoint);

        if (response.data.responseStatus === 200) {
            const translation = response.data.responseData.translatedText;
            console.log(`✅ Translation: "${text}" → "${translation}"`);
            res.json({ translation });
        } else {
            throw new Error('Translation API returned error');
        }
    } catch (error) {
        console.error('Translation error:', error.response?.data || error.message);

        // Fallback: return original text if translation fails
        console.log('⚠️  Translation failed, returning original text');
        res.json({ translation: text });
    }
});

// Azure Speech TTS endpoint
app.post('/api/synthesize', async (req, res) => {
    const { text, lang } = req.body;
    const speechKey = process.env.AZURE_SPEECH_KEY;
    const speechRegion = process.env.AZURE_SPEECH_REGION || 'eastus';

    if (!speechKey || speechKey === 'your-azure-speech-key-here') {
        return res.status(500).json({
            error: 'Azure Speech key not configured'
        });
    }

    try {
        const axios = require('axios');

        // Map language codes to voice names
        const voiceMap = {
            'en': 'en-US-JennyNeural',
            'en-US': 'en-US-JennyNeural',
            'zh-Hans': 'zh-CN-XiaoxiaoNeural',
            'zh-CN': 'zh-CN-XiaoxiaoNeural'
        };

        const voiceName = voiceMap[lang] || voiceMap['en-US'];
        const endpoint = `https://${speechRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;

        const ssml = `
            <speak version='1.0' xml:lang='en-US'>
                <voice name='${voiceName}'>${text}</voice>
            </speak>
        `;

        const response = await axios.post(endpoint, ssml, {
            headers: {
                'Ocp-Apim-Subscription-Key': speechKey,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-16khz-128kbitrate-mono-mp3'
            },
            responseType: 'arraybuffer'
        });

        res.set('Content-Type', 'audio/mpeg');
        res.send(Buffer.from(response.data));
    } catch (error) {
        console.error('TTS error:', error.response?.data || error.message);
        res.status(500).json({
            error: 'TTS failed',
            details: error.response?.data || error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    const hasApiKey = process.env.AZURE_SPEECH_KEY && process.env.AZURE_SPEECH_KEY !== 'your-azure-speech-key-here';
    res.json({
        status: 'ok',
        apiKeyConfigured: hasApiKey,
        message: hasApiKey ? 'Server is ready with Azure Speech' : 'AZURE_SPEECH_KEY not set in .env'
    });
});

// Start server
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('🚀 Azure Speech Translator Server Started');
    console.log('='.repeat(60));
    console.log(`📍 Server running on: http://localhost:${PORT}`);
    console.log(`🔍 Health check: http://localhost:${PORT}/api/health`);
    console.log(`🎙️ Speech token endpoint: http://localhost:${PORT}/api/speech-token`);
    console.log('');

    const speechKey = process.env.AZURE_SPEECH_KEY;
    if (speechKey && speechKey !== 'your-azure-speech-key-here') {
        console.log(`✅ Azure Speech key configured (Region: ${process.env.AZURE_SPEECH_REGION || 'eastus'})`);
    } else {
        console.log('⚠️  Azure Speech key NOT configured!');
        console.log('   Update .env file with: AZURE_SPEECH_KEY=your-key-here');
    }

    console.log('='.repeat(60));
});
