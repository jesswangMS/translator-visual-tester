// Simplified translation module - Azure Speech handles translation
// This file is kept for legacy browser TTS fallback only

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

// Note: Translation is now handled by Azure Speech Translation in azureSpeech.js
// This function is kept for compatibility but should not be used
async function translate(text, sourceLang, targetLang, apiKey = '', autoDetect = true) {
    console.warn('⚠️  translate() function is deprecated. Use Azure Speech Translation instead.');
    throw new Error('Translation is now handled by Azure Speech Services. This function is deprecated.');
}
