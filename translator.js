// Translation module with Claude API, Gemini API, and free API fallback
// Azure Speech Services for TTS

const CLAUDE_API_URL = 'https://api.anthropic.com/v1/messages';
const CLAUDE_MODEL = 'claude-3-5-sonnet-20241022';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro:generateContent';
const MYMEMORY_API_URL = 'https://api.mymemory.translated.net/get';

// Azure Speech Services configuration
const AZURE_SPEECH_REGION = 'eastus'; // Can be customized by user
const AZURE_VOICES = {
    'en-US': 'en-US-JennyNeural',
    'zh-CN': 'zh-CN-XiaoxiaoNeural'
};

// Language code mappings
const LANG_CODES = {
    'en-US': { code: 'en', name: 'English' },
    'zh-CN': { code: 'zh', name: 'Chinese' }
};

// Language detection function
function detectLanguage(text) {
    // Check if text contains Chinese characters (including simplified and traditional)
    // Unicode ranges: CJK Unified Ideographs (4E00-9FFF), CJK Extension A (3400-4DBF)
    const chineseRegex = /[\u3400-\u4DBF\u4E00-\u9FFF]/;

    if (chineseRegex.test(text)) {
        console.log('Detected language: Chinese');
        return 'zh-CN';
    } else {
        console.log('Detected language: English');
        return 'en-US';
    }
}

async function translateWithClaude(text, sourceLang, targetLang, apiKey) {
    if (!apiKey || apiKey.trim() === '') {
        throw new Error('No API key provided');
    }

    const sourceName = LANG_CODES[sourceLang]?.name || sourceLang;
    const targetName = LANG_CODES[targetLang]?.name || targetLang;

    const prompt = `Translate the following ${sourceName} text to ${targetName}.
Only provide the translation, no explanations or additional text:

${text}`;

    try {
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
            throw new Error(`Claude API error: ${response.status} ${errorData.error?.message || ''}`);
        }

        const data = await response.json();
        return data.content[0].text.trim();
    } catch (error) {
        console.error('Claude API error:', error);
        throw error;
    }
}

// Azure Speech TTS function
async function synthesizeSpeechAzure(text, lang, azureKey, azureRegion = AZURE_SPEECH_REGION) {
    console.log('🔊 Azure Speech TTS - Starting...');
    console.log(`   Text length: ${text.length} characters`);
    console.log(`   Language: ${lang}`);
    console.log(`   Region: ${azureRegion}`);
    console.log(`   API Key: ${azureKey ? azureKey.substring(0, 8) + '...' : 'NOT PROVIDED'}`);

    if (!azureKey || azureKey.trim() === '') {
        throw new Error('No Azure Speech API key provided');
    }

    const voiceName = AZURE_VOICES[lang] || AZURE_VOICES['en-US'];
    console.log(`   Voice: ${voiceName}`);

    const ssml = `<speak version='1.0' xml:lang='${lang}'>
        <voice name='${voiceName}'>${text}</voice>
    </speak>`;

    const url = `https://${azureRegion}.tts.speech.microsoft.com/cognitiveservices/v1`;
    console.log(`   API URL: ${url}`);

    try {
        console.log('   Making API request...');
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Ocp-Apim-Subscription-Key': azureKey,
                'Content-Type': 'application/ssml+xml',
                'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3'
            },
            body: ssml
        });

        console.log(`   Response status: ${response.status} ${response.statusText}`);

        if (!response.ok) {
            const errorText = await response.text().catch(() => '');
            console.error(`❌ Azure Speech API error: ${response.status}`);
            console.error(`   Error details: ${errorText}`);
            throw new Error(`Azure Speech API error: ${response.status} ${errorText || response.statusText}`);
        }

        // Return the audio blob
        const audioBlob = await response.blob();
        console.log(`✅ Azure Speech: Generated audio successfully`);
        console.log(`   Audio size: ${audioBlob.size} bytes`);
        console.log(`   Audio type: ${audioBlob.type}`);
        return audioBlob;
    } catch (error) {
        console.error('❌ Azure Speech API error:', error);
        console.error('   Error name:', error.name);
        console.error('   Error message:', error.message);
        throw error;
    }
}

async function translateWithGemini(text, sourceLang, targetLang, apiKey) {
    if (!apiKey || apiKey.trim() === '') {
        throw new Error('No API key provided');
    }

    const sourceName = LANG_CODES[sourceLang]?.name || sourceLang;
    const targetName = LANG_CODES[targetLang]?.name || targetLang;

    const prompt = `Translate the following ${sourceName} text to ${targetName}.
Only provide the translation, no explanations or additional text:

${text}`;

    try {
        const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: prompt
                    }]
                }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 1024
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('Gemini API error details:', errorData);
            throw new Error(`Gemini API error: ${response.status} ${errorData.error?.message || JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        console.log('Gemini API response:', data);

        if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
            console.error('Unexpected Gemini response format:', data);
            throw new Error('Gemini API returned unexpected response format');
        }

        return data.candidates[0].content.parts[0].text.trim();
    } catch (error) {
        console.error('Gemini API error:', error);
        throw error;
    }
}

async function translateWithFree(text, sourceLang, targetLang) {
    const sourceCode = LANG_CODES[sourceLang]?.code || 'en';
    const targetCode = LANG_CODES[targetLang]?.code || 'zh';

    const url = `${MYMEMORY_API_URL}?q=${encodeURIComponent(text)}&langpair=${sourceCode}|${targetCode}`;

    try {
        const response = await fetch(url);

        if (!response.ok) {
            throw new Error(`Translation API error: ${response.status}`);
        }

        const data = await response.json();

        if (data.responseStatus !== 200) {
            throw new Error('Translation failed');
        }

        return data.responseData.translatedText;
    } catch (error) {
        console.error('Free API error:', error);
        throw error;
    }
}

// Detect which API key type is provided
function detectAPIKeyType(apiKey) {
    if (!apiKey || apiKey.trim() === '') {
        return 'none';
    }

    console.log(`🔍 Detecting API key type for: ${apiKey.substring(0, 10)}...`);

    // Claude API keys start with 'sk-ant-'
    if (apiKey.startsWith('sk-ant-')) {
        console.log('   Detected: Claude API key');
        return 'claude';
    }

    // Gemini API keys start with 'AIza'
    if (apiKey.startsWith('AIza')) {
        console.log('   Detected: Gemini API key');
        return 'gemini';
    }

    // Azure Speech keys are 32-character alphanumeric strings
    // They can contain letters (a-z, A-Z) and numbers (0-9)
    if (/^[a-zA-Z0-9]{32}$/.test(apiKey)) {
        console.log('   Detected: Azure Speech API key (32 chars)');
        return 'azure';
    }

    // If it's a long alphanumeric string but not exactly 32 chars, might still be Azure
    // Some Azure keys can be different lengths
    if (/^[a-zA-Z0-9]{24,}$/.test(apiKey) && !apiKey.startsWith('AIza') && !apiKey.startsWith('sk-')) {
        console.log('   Detected: Possibly Azure Speech API key (long alphanumeric)');
        return 'azure';
    }

    // Default to trying Claude format
    console.log('   Detected: Unknown format, defaulting to Claude');
    return 'claude';
}

async function translate(text, sourceLang, targetLang, apiKey = '', autoDetect = true) {
    // Auto-detect language if enabled
    if (autoDetect) {
        const detectedLang = detectLanguage(text);
        sourceLang = detectedLang;
        // Set target to opposite language
        targetLang = detectedLang === 'zh-CN' ? 'en-US' : 'zh-CN';
        console.log(`Auto-detected: ${sourceLang} → ${targetLang}`);
    }

    console.log(`Translating from ${sourceLang} to ${targetLang}: "${text}"`);

    // Try AI API if API key is provided
    if (apiKey && apiKey.trim() !== '') {
        const apiType = detectAPIKeyType(apiKey);
        console.log(`Detected API key type: ${apiType}`);

        try {
            if (apiType === 'gemini') {
                console.log('Attempting translation with Gemini API...');
                const translation = await translateWithGemini(text, sourceLang, targetLang, apiKey);
                console.log('Gemini API translation successful');
                return { translation, detectedLang: sourceLang, targetLang };
            } else if (apiType === 'azure') {
                console.log('Azure Speech key detected - will be used for TTS only');
                // Azure is for TTS, not translation - fall through to free API
            } else if (apiType === 'claude') {
                console.warn('⚠️ Claude API cannot be called directly from browser due to CORS restrictions.');
                console.warn('   Use Gemini API instead, or set up a backend server.');
                // Fall through to free API
            }
        } catch (error) {
            console.warn(`${apiType} API failed, falling back to free API:`, error.message);
        }
    }

    // Fallback to free API
    try {
        console.log('Using free translation API...');
        const translation = await translateWithFree(text, sourceLang, targetLang);
        console.log('Free API translation successful');
        return { translation, detectedLang: sourceLang, targetLang };
    } catch (error) {
        console.error('All translation methods failed:', error);
        throw new Error('Translation failed. Please check your connection and try again.');
    }
}
