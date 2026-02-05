// Azure Speech Services - Translation and TTS
// Uses Azure Cognitive Services Speech SDK

class AzureSpeechService {
    constructor() {
        this.speechConfig = null;
        this.audioConfig = null;
        this.translationRecognizer = null;
        this.synthesizer = null;
        this.isInitialized = false;
        this.token = null;
        this.region = null;
    }

    // Initialize Azure Speech with token from backend
    async initialize() {
        if (this.isInitialized) {
            console.log('Azure Speech already initialized');
            return;
        }

        try {
            console.log('🔐 Fetching Azure Speech token from backend...');
            const response = await fetch('http://localhost:3000/api/speech-token', {
                method: 'POST'
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || 'Failed to get speech token');
            }

            const data = await response.json();
            this.token = data.token;
            this.region = data.region;

            console.log(`✅ Azure Speech token received (Region: ${this.region})`);

            // Create speech config
            this.speechConfig = SpeechSDK.SpeechTranslationConfig.fromSubscription(this.token, this.region);

            // Set recognition language (will auto-detect between en-US and zh-CN)
            this.speechConfig.speechRecognitionLanguage = 'zh-CN'; // Primary recognition language

            // Add target translation languages
            this.speechConfig.addTargetLanguage('en'); // Translate to English
            this.speechConfig.addTargetLanguage('zh-Hans'); // Translate to Chinese Simplified

            console.log('✅ Azure Speech configured for translation (zh-CN ↔ en)');

            this.isInitialized = true;
        } catch (error) {
            console.error('❌ Failed to initialize Azure Speech:', error);
            throw error;
        }
    }

    // Start translation recognition
    async startTranslationRecognition(onRecognizing, onRecognized, onTranslated) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Create audio config from microphone
        this.audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

        // Create translation recognizer
        this.translationRecognizer = new SpeechSDK.TranslationRecognizer(
            this.speechConfig,
            this.audioConfig
        );

        // Event: Recognizing (interim results)
        this.translationRecognizer.recognizing = (s, e) => {
            if (e.result.reason === SpeechSDK.ResultReason.TranslatingSpeech) {
                const text = e.result.text;
                console.log(`🎤 Recognizing: "${text}"`);
                if (onRecognizing) {
                    onRecognizing(text, e.result.translations);
                }
            }
        };

        // Event: Recognized (final results)
        this.translationRecognizer.recognized = (s, e) => {
            if (e.result.reason === SpeechSDK.ResultReason.TranslatedSpeech) {
                const text = e.result.text;
                const translations = e.result.translations;

                console.log(`✅ Recognized: "${text}"`);
                console.log(`   Translations:`, translations);

                if (onRecognized) {
                    onRecognized(text);
                }

                if (onTranslated && translations) {
                    // Detect source language and get appropriate translation
                    const detectedLang = this.detectLanguage(text);
                    const targetLang = detectedLang === 'zh-CN' ? 'en' : 'zh-Hans';
                    const translation = translations.get(targetLang);

                    console.log(`   Detected: ${detectedLang}, Target: ${targetLang}`);
                    console.log(`   Translation: "${translation}"`);

                    onTranslated(translation, detectedLang, targetLang);
                }
            } else if (e.result.reason === SpeechSDK.ResultReason.NoMatch) {
                console.log('⚠️ No speech recognized');
            }
        };

        // Event: Canceled (errors)
        this.translationRecognizer.canceled = (s, e) => {
            console.error('❌ Translation canceled:', e.reason);
            if (e.reason === SpeechSDK.CancellationReason.Error) {
                console.error('   Error details:', e.errorDetails);
            }
        };

        // Start continuous recognition
        this.translationRecognizer.startContinuousRecognitionAsync(
            () => {
                console.log('🎙️ Translation recognition started');
            },
            (error) => {
                console.error('❌ Failed to start recognition:', error);
            }
        );
    }

    // Stop translation recognition
    async stopTranslationRecognition() {
        if (this.translationRecognizer) {
            await this.translationRecognizer.stopContinuousRecognitionAsync();
            this.translationRecognizer.close();
            this.translationRecognizer = null;
            console.log('🔴 Translation recognition stopped');
        }

        if (this.audioConfig) {
            this.audioConfig.close();
            this.audioConfig = null;
        }
    }

    // Synthesize speech from text
    async synthesizeSpeech(text, lang, onAudioData) {
        if (!this.isInitialized) {
            await this.initialize();
        }

        // Map language codes
        const voiceMap = {
            'en': 'en-US-JennyNeural',
            'en-US': 'en-US-JennyNeural',
            'zh-Hans': 'zh-CN-XiaoxiaoNeural',
            'zh-CN': 'zh-CN-XiaoxiaoNeural'
        };

        const voiceName = voiceMap[lang] || voiceMap['en-US'];

        // Create speech config for synthesis
        const synthConfig = SpeechSDK.SpeechConfig.fromSubscription(this.token, this.region);
        synthConfig.speechSynthesisVoiceName = voiceName;

        console.log(`🔊 Synthesizing speech (Voice: ${voiceName})`);
        console.log(`   Text: "${text.substring(0, 50)}${text.length > 50 ? '...' : ''}"`);

        return new Promise((resolve, reject) => {
            // Use audio config to get the audio data
            const audioConfig = SpeechSDK.AudioConfig.fromDefaultSpeakerOutput();
            const synthesizer = new SpeechSDK.SpeechSynthesizer(synthConfig, audioConfig);

            synthesizer.speakTextAsync(
                text,
                (result) => {
                    if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
                        console.log('✅ Speech synthesis completed');

                        // Get audio data
                        const audioData = result.audioData;
                        const blob = new Blob([audioData], { type: 'audio/mp3' });

                        if (onAudioData) {
                            onAudioData(blob);
                        }

                        synthesizer.close();
                        resolve(blob);
                    } else {
                        console.error('❌ Speech synthesis failed:', result.errorDetails);
                        synthesizer.close();
                        reject(new Error(result.errorDetails));
                    }
                },
                (error) => {
                    console.error('❌ Speech synthesis error:', error);
                    synthesizer.close();
                    reject(error);
                }
            );
        });
    }

    // Simple language detection
    detectLanguage(text) {
        // Check if text contains Chinese characters
        const chineseRegex = /[\u3400-\u4DBF\u4E00-\u9FFF]/;
        return chineseRegex.test(text) ? 'zh-CN' : 'en-US';
    }

    // Cleanup
    cleanup() {
        this.stopTranslationRecognition();
        this.isInitialized = false;
        this.token = null;
        this.region = null;
    }
}

// Create global instance
const azureSpeech = new AzureSpeechService();
