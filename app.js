// Main application logic with state management and speech recognition

const States = {
    IDLE: 'idle',
    LISTENING: 'listening',
    WAITING: 'waiting',
    THINKING: 'thinking',
    TALKING: 'talking'
};

class TranslatorApp {
    constructor() {
        this.currentState = States.IDLE;
        this.sourceLang = 'en-US';
        this.targetLang = 'zh-CN';
        this.autoDetect = true; // Enable auto-detection by default
        this.recognition = null;
        this.synthesis = window.speechSynthesis;
        this.isActive = false;
        this.isTogglingListening = false; // Prevent double-clicking start/stop button
        this.translationTimer = null;
        this.cooldownInterval = null;
        this.lastTranscript = '';
        this.accumulatedTranscript = ''; // Accumulate speech during TALKING state
        this.cooldownDuration = 2500; // 2.5 seconds in milliseconds
        this.showTimer = false; // Timer animation visibility toggle
        this.lastResultIndex = 0; // Track which results we've already processed
        this.noAudioTimer = null; // Timer for detecting no audio in LISTENING state
        this.noAudioTimeout = 5000; // 5 seconds of no audio before returning to IDLE
        this.audioContext = null; // Web Audio API context for audio analysis
        this.currentAudioSource = null; // Currently playing audio source

        this.initializeElements();
        this.initializeSpeechRecognition();
        this.attachEventListeners();
    }

    initializeElements() {
        this.avatarElement = document.getElementById('avatar');
        this.statusElement = document.getElementById('status-text');
        this.startButton = document.getElementById('start-btn');
        this.buttonText = document.getElementById('btn-text');
        this.languageButton = document.getElementById('language-btn');
        this.langDirection = document.getElementById('lang-direction');
        this.timerToggleButton = document.getElementById('timer-toggle-btn');
        this.timerToggleText = document.getElementById('timer-toggle-text');
        this.settingsToggleButton = document.getElementById('settings-toggle');
        this.settingsToggleText = document.getElementById('settings-toggle-text');
        this.settingsPanel = document.getElementById('settings-panel');
        this.apiKeyInput = document.getElementById('api-key');
        this.azureRegionInput = document.getElementById('azure-region');
        this.transcriptionElement = document.getElementById('transcription');
        this.translationElement = document.getElementById('translation');
        this.cooldownTimerElement = document.getElementById('cooldown-timer');
        this.cooldownTextElement = document.getElementById('cooldown-text');
        this.cooldownProgressElement = document.getElementById('cooldown-progress');
        this.stateDisplayElement = document.getElementById('state-display');
        this.recognitionStatusElement = document.getElementById('recognition-status');
    }

    initializeSpeechRecognition() {
        // Check for browser support
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            alert('Speech recognition is not supported in this browser. Please use Chrome or Edge.');
            return;
        }

        this.recognition = new SpeechRecognition();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        // In AUTO mode, use Chinese recognition (it can often pick up English too)
        // This ensures Chinese speech is recognized as Chinese characters, not English phonetics
        this.recognition.lang = 'zh-CN';

        this.recognition.onstart = () => {
            console.log('🟢 Speech recognition started');
            console.log(`   - Current state: ${this.currentState}`);
            console.log(`   - Recognition language: ${this.recognition.lang}`);

            // Reset result index for new recognition session
            this.lastResultIndex = 0;
            console.log('   - Reset lastResultIndex to 0');

            // Update recognition status display
            if (this.recognitionStatusElement) {
                this.recognitionStatusElement.textContent = '🟢 Recognition: Running';
            }
        };

        this.recognition.onresult = (event) => {
            try {
                // Only process NEW results (not already processed ones)
                const newResults = Array.from(event.results).slice(this.lastResultIndex);
                const transcript = newResults
                    .map(result => result[0].transcript)
                    .join('');

                const isFinal = event.results[event.results.length - 1].isFinal;

                console.log(`🎤 Speech ${isFinal ? 'FINAL' : 'interim'}: "${transcript}" | Current State: ${this.currentState}`);

                // Update lastResultIndex when we get a final result
                if (isFinal) {
                    this.lastResultIndex = event.results.length;
                    console.log(`   Updated lastResultIndex to ${this.lastResultIndex}`);
                }

                // If in IDLE state with active session and speech detected → transition to LISTENING
                if (this.currentState === States.IDLE && this.isActive && transcript.trim() !== '') {
                    console.log('🎤 Speech detected in IDLE - transitioning to LISTENING');
                    this.setState(States.LISTENING);
                    // Clear volume callback since we're now in LISTENING
                    audioSync.clearVolumeCallback();
                }

                // Reset no audio timer whenever speech is detected in LISTENING state
                if (this.currentState === States.LISTENING && transcript.trim() !== '') {
                    this.resetNoAudioTimer();
                }

            // If in TALKING state, accumulate speech but DON'T interrupt
            if (this.currentState === States.TALKING) {
                if (isFinal && transcript.trim() !== '') {
                    // Accumulate the transcript
                    if (this.accumulatedTranscript) {
                        this.accumulatedTranscript += ' ' + transcript;
                    } else {
                        this.accumulatedTranscript = transcript;
                    }
                    console.log(`📝 Accumulated during TALKING: "${this.accumulatedTranscript}"`);

                    // Update display to show accumulated text
                    this.transcriptionElement.textContent = this.accumulatedTranscript;
                }
                // Don't interrupt TALKING state - just accumulate and return
                return;
            }

            // If in WAITING state and speech recognition result detected → combine transcripts
            if (this.currentState === States.WAITING) {
                console.log('📝 Speech recognition result during WAITING state - updating transcript');
                console.log(`   - Current transcript: "${transcript}"`);
                console.log(`   - Previous transcript: "${this.lastTranscript}"`);

                // Combine previous transcript with new speech
                // The new speech might be a continuation or new sentence
                if (this.lastTranscript && transcript.trim()) {
                    this.lastTranscript = this.lastTranscript + ' ' + transcript;
                    console.log(`   - Combined transcript: "${this.lastTranscript}"`);
                } else if (transcript.trim()) {
                    this.lastTranscript = transcript;
                }

                // Update display
                this.transcriptionElement.textContent = this.lastTranscript;

                // Note: Timer was already interrupted by volume callback
                // Return early to avoid processing this speech result again below
                return;
            }

            // Update transcript display for LISTENING and other states
            if (isFinal && transcript.trim() !== '') {
                // Accumulate transcripts in LISTENING state
                if (this.lastTranscript && this.lastTranscript.trim() !== '') {
                    this.lastTranscript = this.lastTranscript + ' ' + transcript;
                    console.log(`📝 Accumulated final transcript: "${this.lastTranscript}"`);
                } else {
                    this.lastTranscript = transcript;
                }
                // Update display with accumulated transcript
                this.transcriptionElement.textContent = this.lastTranscript;
            } else if (transcript.trim() !== '') {
                // For interim results, show accumulated + current interim (don't save to lastTranscript yet)
                const displayText = this.lastTranscript ? this.lastTranscript + ' ' + transcript : transcript;
                this.transcriptionElement.textContent = displayText;
                console.log(`📝 Interim display: "${displayText}"`);
            }

            // If final result and in LISTENING state → go to WAITING state
            if (isFinal && transcript.trim() !== '' && this.currentState === States.LISTENING) {
                console.log(`⏱️ Final speech detected - entering WAITING state for ${this.cooldownDuration}ms`);

                // Enter WAITING state immediately
                this.setState(States.WAITING);

                // Stop listening animation but keep monitoring volume for interruptions
                audioSync.stopListeningAnimation();
                audioSync.startVolumeMonitoring();

                // Register volume callback to detect speech immediately
                // Using a higher threshold during WAITING to avoid false triggers from residual noise
                const waitingVolumeThreshold = 50; // Higher than listening threshold (30)
                audioSync.setVolumeCallback((volume) => {
                    // Only interrupt if in WAITING state and volume is above waiting threshold
                    if (this.currentState === States.WAITING && volume > waitingVolumeThreshold) {
                        console.log(`🔊 Volume detected during WAITING: ${volume.toFixed(1)} (threshold: ${waitingVolumeThreshold}) - interrupting timer!`);
                        this.interruptWaitingState();
                    }
                });

                // Start custom timer animation (75 frames, 30fps, 2.5 seconds) - only if enabled
                if (this.showTimer) {
                    console.log('⏱️ Timer animation is ENABLED - playing timer frames');
                    audioSync.playTimerAnimation(this.avatarElement, () => {
                        // Timer animation complete - start translation
                        console.log('✅ Timer animation complete - starting translation');
                        audioSync.clearVolumeCallback();
                        this.handleTranslation(this.lastTranscript);
                    });
                } else {
                    console.log('⏱️ Timer animation is DISABLED - skipping timer frames');
                }

                // Use setTimeout as backup when timer is disabled, or for interruption tracking
                this.translationTimer = setTimeout(() => {
                    // Only proceed if timer animation is disabled
                    // (If timer is enabled, the animation callback handles translation)
                    if (!this.showTimer) {
                        console.log('✅ Waiting complete - starting translation (no timer animation)');
                        audioSync.clearVolumeCallback();
                        this.handleTranslation(this.lastTranscript);
                    } else {
                        console.log('⏱️ setTimeout completed but timer animation is handling translation');
                    }
                }, this.cooldownDuration);

                console.log(`   - Waiting state entered. Timer ID: ${this.translationTimer}`);
            }
            } catch (error) {
                console.error('❌ Error in onresult handler:', error);
                console.error('   Stack trace:', error.stack);
                // Try to continue - don't crash the entire recognition system
            }
        };

        this.recognition.onerror = (event) => {
            try {
                // Check if it's a non-critical error first
                if (event.error === 'no-speech' || event.error === 'aborted') {
                    console.log(`ℹ️ Speech recognition: ${event.error} (normal, continuing...)`);
                    return;
                }

                // For other errors, log more details
                console.error('🚨 Speech recognition error:', event.error);
                console.error('   Full error event:', event);
                console.error('   Error type:', typeof event.error);
                console.error('   Current state:', this.currentState);

                if (!event || !event.error) {
                    console.error('   - Error event or event.error is missing!');
                    return;
                }

                // Handle different error types
                switch (event.error) {
                    case 'no-speech':
                    case 'aborted':
                        // Already handled above
                        break;

                    case 'audio-capture':
                        // Microphone problem - critical error
                        console.error('   - Audio capture failed - stopping session');
                        this.updateStatus('Error: Microphone not available');
                        this.setState(States.IDLE);
                        this.isActive = false;
                        this.updateButton();
                        break;

                    case 'not-allowed':
                        // Permission denied - critical error
                        console.error('   - Permission denied - stopping session');
                        this.updateStatus('Error: Microphone permission denied');
                        this.setState(States.IDLE);
                        this.isActive = false;
                        this.updateButton();
                        break;

                    case 'network':
                        // Network error - critical for some browsers
                        console.error('   - Network error - stopping session');
                        this.updateStatus('Error: Network issue');
                        this.setState(States.IDLE);
                        this.isActive = false;
                        this.updateButton();
                        break;

                    default:
                        // Other errors - log but continue
                        console.warn(`   - Unhandled error type: ${event.error} (continuing...)`);
                        break;
                }
            } catch (err) {
                console.error('❌ Exception in onerror handler:', err);
            }
        };

        this.recognition.onend = () => {
            console.log('🔴 Speech recognition ended');
            console.log(`   - Current state: ${this.currentState}`);
            console.log(`   - Is active: ${this.isActive}`);

            // Update recognition status display
            if (this.recognitionStatusElement) {
                this.recognitionStatusElement.textContent = '🔴 Recognition: Stopped';
            }

            // Restart immediately if session is active and not in THINKING/TALKING states
            // (IDLE, LISTENING, and WAITING all need recognition to be active)
            if (this.isActive && this.currentState !== States.THINKING && this.currentState !== States.TALKING) {
                console.log('   - Restarting recognition immediately...');
                try {
                    this.recognition.start();
                    console.log('   ✅ Recognition restarted');
                } catch (error) {
                    // If start() fails (already running), retry after brief delay
                    if (error.message && error.message.includes('already')) {
                        console.log('   ⚠️ Recognition already running, no restart needed');
                    } else {
                        console.error('   ❌ Failed to restart recognition:', error);
                        // Retry after 50ms
                        setTimeout(() => {
                            if (this.isActive && this.currentState !== States.THINKING && this.currentState !== States.TALKING) {
                                try {
                                    this.recognition.start();
                                    console.log('   ✅ Recognition restarted (retry)');
                                } catch (retryError) {
                                    console.error('   ❌ Retry failed:', retryError);
                                }
                            }
                        }, 50);
                    }
                }
            } else {
                console.log('   - Not restarting (inactive or in THINKING/TALKING state)');
            }
        };
    }

    attachEventListeners() {
        this.startButton.addEventListener('click', () => this.toggleListening());
        this.languageButton.addEventListener('click', () => this.toggleLanguage());
        this.timerToggleButton.addEventListener('click', () => this.toggleTimerVisibility());
        this.settingsToggleButton.addEventListener('click', () => this.toggleSettings());
    }

    async toggleListening() {
        // Prevent double-clicking
        if (this.isTogglingListening) {
            console.log('Already toggling listening state, ignoring click...');
            return;
        }

        this.isTogglingListening = true;

        try {
            if (!this.isActive) {
                await this.startListening();
            } else {
                this.stopListening();
            }
        } finally {
            this.isTogglingListening = false;
        }
    }

    async startListening() {
        try {
            // Initialize microphone for animation
            await audioSync.initializeMicrophone();

            this.isActive = true;
            // Stay in IDLE state - will transition to LISTENING when audio detected
            this.setState(States.IDLE);
            this.updateButton();

            // Start speech recognition (only if not already running)
            try {
                this.recognition.start();
                console.log('Speech recognition started successfully');
            } catch (error) {
                if (error.message && error.message.includes('already started')) {
                    console.log('Speech recognition already running, continuing...');
                } else {
                    throw error; // Re-throw if it's a different error
                }
            }

            // Start listening animation but stay in idle visually until speech
            audioSync.startListeningAnimation(this.avatarElement);

            // Register volume callback to transition to LISTENING when audio detected
            audioSync.setVolumeCallback((volume) => {
                if (this.currentState === States.IDLE && this.isActive) {
                    console.log(`🔊 Audio detected - scaling up immediately and transitioning to LISTENING`);

                    // Immediately scale to 100% (bypassing CSS transition for instant response)
                    this.avatarElement.style.transform = 'scale(1.0)';

                    // Then transition state (this will start frame animation)
                    this.setState(States.LISTENING);

                    // Clear this callback, we only need it once
                    audioSync.clearVolumeCallback();
                }
            });
        } catch (error) {
            console.error('Error starting listening:', error);
            alert(error.message);
            this.isActive = false;
            this.setState(States.IDLE);
            this.updateButton();
        }
    }

    stopListening() {
        console.log('Stopping session...');
        this.isActive = false;

        // Clear cooldown timer and display
        this.stopCooldownTimer();

        // Clear no audio timer
        this.clearNoAudioTimer();

        // Clear volume callback
        audioSync.clearVolumeCallback();

        // Clear all transcripts and reset for fresh start
        this.accumulatedTranscript = '';
        this.lastTranscript = '';
        this.lastResultIndex = 0;

        // Clear display
        this.transcriptionElement.textContent = '';
        this.translationElement.textContent = '';

        // Stop all ongoing processes
        try {
            this.recognition.stop();
            console.log('Speech recognition stopped');
        } catch (error) {
            console.log('Recognition already stopped or error:', error);
        }
        this.synthesis.cancel();

        // Cleanup audio resources (this will close the microphone stream)
        audioSync.cleanup();

        // Return to idle
        this.avatarElement.src = 'images/idle.png';
        this.setState(States.IDLE);
        this.updateButton();

        console.log('✅ Session stopped - all data cleared for fresh start');
    }

    startCooldownTimer() {
        console.log('⏰ startCooldownTimer called');

        // Show cooldown timer
        if (this.cooldownTimerElement) {
            this.cooldownTimerElement.style.display = 'block';
            console.log('   ✓ Timer element shown');
        }

        const startTime = Date.now();
        const circleCircumference = 157; // 2 * π * r where r=25

        // Update every 50ms for smooth animation
        this.cooldownInterval = setInterval(() => {
            const elapsed = Date.now() - startTime;
            const remaining = Math.max(0, this.cooldownDuration - elapsed);
            const progress = remaining / this.cooldownDuration;

            // Update countdown text
            if (this.cooldownTextElement) {
                this.cooldownTextElement.textContent = (remaining / 1000).toFixed(1);
            }

            // Update progress circle
            if (this.cooldownProgressElement) {
                const offset = circleCircumference * (1 - progress);
                this.cooldownProgressElement.style.strokeDashoffset = offset;
            }

            // Log progress
            if (Math.floor(remaining / 100) !== Math.floor((remaining + 50) / 100)) {
                console.log(`⏱️ Waiting: ${(remaining / 1000).toFixed(1)}s remaining`);
            }

            if (remaining === 0) {
                clearInterval(this.cooldownInterval);
                this.cooldownInterval = null;
            }
        }, 50);
    }

    stopCooldownTimer() {
        try {
            console.log('🔧 stopCooldownTimer called');
            console.log(`   - Before clear - Timer: ${this.translationTimer}, Countdown: ${this.cooldownInterval}`);

            // Clear the translation timer
            if (this.translationTimer) {
                clearTimeout(this.translationTimer);
                this.translationTimer = null;
                console.log('   ✓ Translation timer cleared');
            }

            // Clear the countdown interval
            if (this.cooldownInterval) {
                clearInterval(this.cooldownInterval);
                this.cooldownInterval = null;
                console.log('   ✓ Countdown interval cleared');
            }

            // Hide and reset the timer display
            this.hideCooldownTimer();
            console.log('   ✓ Timer display hidden');
        } catch (error) {
            console.error('❌ Error in stopCooldownTimer:', error);
        }
    }

    hideCooldownTimer() {
        try {
            console.log('👁️ hideCooldownTimer called');
            if (this.cooldownTimerElement) {
                this.cooldownTimerElement.style.display = 'none';
                console.log('   ✓ Timer element hidden');
            }
            if (this.cooldownProgressElement) {
                this.cooldownProgressElement.style.strokeDashoffset = 157;
                console.log('   ✓ Progress reset to 157');
            }
        } catch (error) {
            console.error('❌ Error in hideCooldownTimer:', error);
        }
    }

    interruptWaitingState() {
        console.log('🛑 Interrupting WAITING state!');
        console.log(`   - Timer active: ${this.translationTimer !== null}`);
        console.log(`   - Countdown active: ${this.cooldownInterval !== null}`);
        console.log('   - Stopping timers, returning to LISTENING with smooth transition...');

        // Stop custom timer animation
        audioSync.stopTimerAnimation();

        // Stop volume monitoring
        audioSync.stopVolumeMonitoring();

        // Clear and reset timers (but DON'T restart countdown)
        this.stopCooldownTimer();

        // Clear volume callback - no longer need it
        audioSync.clearVolumeCallback();

        // Quick transition through idle.png without fading opacity
        // This keeps the PNG visible throughout (no transparency/grey background showing)
        this.avatarElement.src = 'images/idle.png';

        // Brief pause on idle, then transition to LISTENING
        setTimeout(() => {
            this.setState(States.LISTENING);
            console.log('   - Timer interrupted. Transitioning to LISTENING state.');

            // Start listening animation
            audioSync.startListeningAnimation(this.avatarElement);
        }, 100);
    }

    startNoAudioTimer() {
        // Clear any existing timer
        this.clearNoAudioTimer();

        console.log(`⏰ Starting no audio timer (${this.noAudioTimeout}ms)`);
        this.noAudioTimer = setTimeout(() => {
            console.log('⏰ No audio detected for 5 seconds - transitioning to IDLE');

            // Only transition if still in LISTENING state and session is active
            if (this.currentState === States.LISTENING && this.isActive) {
                // Transition to IDLE
                this.avatarElement.src = 'images/idle.png';
                this.setState(States.IDLE);
                console.log('   - Returned to IDLE due to inactivity');
            }
        }, this.noAudioTimeout);
    }

    resetNoAudioTimer() {
        // Reset the timer - called when audio is detected
        if (this.currentState === States.LISTENING && this.noAudioTimer !== null) {
            console.log('⏰ Audio detected - resetting no audio timer');
            this.startNoAudioTimer();
        }
    }

    clearNoAudioTimer() {
        if (this.noAudioTimer !== null) {
            clearTimeout(this.noAudioTimer);
            this.noAudioTimer = null;
        }
    }

    async handleTranslation(text) {
        if (!text || text.trim() === '') {
            // No content to translate - return to IDLE
            console.log('⚠️ No content to translate - returning to IDLE');

            if (this.isActive) {
                // Return to IDLE and stay there
                this.avatarElement.src = 'images/idle.png';
                this.setState(States.IDLE);

                try {
                    this.recognition.start();
                } catch (err) {
                    console.log('Recognition already started or error:', err);
                }

                // Note: Speech recognition continues, will detect when user speaks again
            } else {
                this.avatarElement.src = 'images/idle.png';
                this.setState(States.IDLE);
            }
            return;
        }

        // Clear any accumulated transcript (fresh start for next translation cycle)
        this.accumulatedTranscript = '';

        // Stop listening animation (should already be stopped in WAITING state)
        audioSync.stopListeningAnimation();

        // Stop volume monitoring from WAITING state (otherwise it overwrites debug panel!)
        audioSync.stopVolumeMonitoring();

        // Enter thinking state
        this.setState(States.THINKING);
        audioSync.startThinkingAnimation(this.avatarElement);

        try {
            // Get API key
            const apiKey = this.apiKeyInput.value.trim();

            // Translate with auto-detection
            const result = await translate(text, this.sourceLang, this.targetLang, apiKey, this.autoDetect);
            const translation = result.translation;
            const detectedLang = result.detectedLang;
            const targetLang = result.targetLang;

            // Log detected language for debugging
            const sourceName = detectedLang === 'zh-CN' ? 'ZH' : 'EN';
            const targetName = targetLang === 'zh-CN' ? 'ZH' : 'EN';
            console.log(`🌐 Detected: ${sourceName} → ${targetName}`);

            // Update language display (only if NOT in auto-detect mode)
            if (!this.autoDetect) {
                this.langDirection.textContent = `${sourceName} → ${targetName}`;
            }
            // If in auto-detect mode, keep display as "AUTO"

            this.translationElement.textContent = translation;

            // Stop thinking animation before speaking
            audioSync.stopThinkingAnimation();

            // Speak translation in the target language
            await this.speak(translation, targetLang);
        } catch (error) {
            console.error('Translation error:', error);
            this.updateStatus('Translation failed');
            this.translationElement.textContent = 'Translation failed. Please try again.';
            audioSync.stopThinkingAnimation();

            // If session is still active, return to IDLE
            if (this.isActive) {
                this.avatarElement.src = 'images/idle.png';
                this.setState(States.IDLE);
                try {
                    this.recognition.start();
                } catch (err) {
                    console.log('Recognition already started or error:', err);
                }
                // Note: Speech recognition continues, will detect when user speaks again
            } else {
                this.avatarElement.src = 'images/idle.png';
                this.setState(States.IDLE);
            }
        }
    }

    async speak(text, lang = null) {
        console.log('🗣️ Starting speech synthesis');
        console.log(`   Text: "${text.substring(0, 50)}..."`);
        console.log(`   Language: ${lang || this.targetLang}`);

        // Get API key from input
        const apiKey = this.apiKeyInput.value.trim();
        console.log(`   API Key provided: ${apiKey ? 'Yes' : 'No'}`);

        if (apiKey) {
            const keyType = detectAPIKeyType(apiKey);
            console.log(`   Detected key type: ${keyType}`);

            // Check if we should use Azure Speech TTS
            if (keyType === 'azure') {
                console.log('✅ Using Azure Speech TTS');
                return await this.speakWithAzure(text, lang || this.targetLang, apiKey);
            }
        }

        console.log('Using browser SpeechSynthesis (no Azure key or different key type)');
        return await this.speakWithBrowser(text, lang || this.targetLang);
    }

    async speakWithAzure(text, lang, azureKey) {
        try {
            // Get region from input or use default
            const region = this.azureRegionInput && this.azureRegionInput.value.trim()
                ? this.azureRegionInput.value.trim()
                : 'eastus';

            console.log(`📡 Calling Azure Speech API in region: ${region}`);

            // Get audio blob from Azure Speech TTS
            const audioBlob = await synthesizeSpeechAzure(text, lang, azureKey, region);

            // Initialize audio context if needed
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Resume context if suspended
            if (this.audioContext.state === 'suspended') {
                await this.audioContext.resume();
            }

            // Convert blob to array buffer
            const arrayBuffer = await audioBlob.arrayBuffer();
            const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

            // Create source and analyzer
            const source = this.audioContext.createBufferSource();
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 256;
            analyser.smoothingTimeConstant = 0.7;

            source.buffer = audioBuffer;
            source.connect(analyser);
            analyser.connect(this.audioContext.destination);

            this.currentAudioSource = source;

            // Start playing and enter TALKING state
            return new Promise((resolve) => {
                console.log('🎙️ Azure TTS playback started - entering TALKING state');
                this.setState(States.TALKING);

                // Start animation with real-time volume analysis
                const dataArray = new Uint8Array(analyser.frequencyBinCount);
                const getVolumeMultiplier = () => {
                    analyser.getByteFrequencyData(dataArray);
                    const sum = dataArray.reduce((a, b) => a + b, 0);
                    const average = sum / dataArray.length;
                    const max = Math.max(...dataArray);
                    const volume = (average * 0.5) + (max * 0.5);

                    // Map volume (0-255) to speed multiplier (0.5x to 2.0x)
                    // Low volume (0-50) -> 0.5x speed
                    // Medium volume (50-150) -> 1.0x speed
                    // High volume (150+) -> 2.0x speed
                    if (volume < 50) {
                        return 0.5 + (volume / 50) * 0.5; // 0.5x to 1.0x
                    } else if (volume < 150) {
                        return 1.0; // 1.0x (normal)
                    } else {
                        return 1.0 + Math.min(1.0, (volume - 150) / 100); // 1.0x to 2.0x
                    }
                };

                audioSync.startTalkingAnimation(this.avatarElement, getVolumeMultiplier);
                console.log('   Talking animation started with Azure audio analysis');

                source.onended = () => {
                    console.log('Azure TTS playback ended');
                    this.currentAudioSource = null;
                    audioSync.stopTalkingAnimation(this.avatarElement);
                    this.handleSpeechEnd(resolve);
                };

                source.start(0);
            });
        } catch (error) {
            console.error('Azure Speech TTS error:', error);
            console.log('Falling back to browser SpeechSynthesis');
            return await this.speakWithBrowser(text, lang);
        }
    }

    async speakWithBrowser(text, lang) {
        return new Promise((resolve) => {
            // Cancel any ongoing speech
            this.synthesis.cancel();

            // Wait a bit for cancel to complete
            setTimeout(() => {
                // Create utterance
                const utterance = new SpeechSynthesisUtterance(text);
                utterance.lang = lang;
                utterance.rate = 0.9;
                utterance.pitch = 1.0;

                // Log available voices for debugging
                const voices = this.synthesis.getVoices();
                console.log(`   Available voices: ${voices.length}`);
                const matchingVoice = voices.find(v => v.lang.startsWith(lang.substring(0, 2)));
                if (matchingVoice) {
                    console.log(`   Using voice: ${matchingVoice.name} (${matchingVoice.lang})`);
                } else {
                    console.warn(`   ⚠️ No matching voice found for ${lang}`);
                }

                this.setupUtteranceHandlers(utterance, resolve);

                // Speak
                console.log('   📢 Calling synthesis.speak()');
                this.synthesis.speak(utterance);
            }, 100);
        });
    }

    handleSpeechEnd(resolve) {
        // If session is still active, check if there's accumulated text
        if (this.isActive) {
            // Check if user spoke during TALKING state
            if (this.accumulatedTranscript && this.accumulatedTranscript.trim() !== '') {
                console.log(`📦 User spoke during TALKING: "${this.accumulatedTranscript}"`);
                console.log('   - Saving to lastTranscript and returning to IDLE');
                console.log('   - Timer will start when user stops speaking (final result detected)');

                // Save accumulated transcript
                this.lastTranscript = this.accumulatedTranscript;

                // Update display
                this.transcriptionElement.textContent = this.lastTranscript;

                // Clear accumulation
                this.accumulatedTranscript = '';

                // Go to IDLE state and stay there
                this.avatarElement.src = 'images/idle.png';
                this.setState(States.IDLE);

                // Restart speech recognition but stay in IDLE
                try {
                    this.recognition.start();
                } catch (error) {
                    console.log('Recognition already started or error:', error);
                }
            } else {
                // No speech during TALKING - clear everything and go to IDLE
                console.log('No speech detected during TALKING - clearing transcripts and returning to IDLE');

                // Clear all transcripts so next session starts fresh
                this.lastTranscript = '';
                this.accumulatedTranscript = '';
                this.lastResultIndex = 0;
                console.log('   - Cleared all transcripts for fresh start');

                // Clear the display as well
                this.transcriptionElement.textContent = '';
                this.translationElement.textContent = '';

                this.avatarElement.src = 'images/idle.png';
                this.setState(States.IDLE);

                // Restart recognition
                try {
                    this.recognition.start();
                } catch (error) {
                    console.log('Recognition already started or error:', error);
                }
            }
        } else {
            console.log('Session not active - staying in current state');
        }

        resolve();
    }

    setupUtteranceHandlers(utterance, resolve) {
        // Track speaking rate using boundary events
        let wordCount = 0;
        let startTime = null;
        let lastBoundaryTime = null;
        let currentSpeakingRate = 1.0; // Default rate multiplier

        utterance.onstart = () => {
            console.log('🎙️ TTS Speech started - entering TALKING state');
            console.log('   Avatar element:', this.avatarElement);
            console.log('   Current avatar src:', this.avatarElement.src);
            startTime = Date.now();
            wordCount = 0;
            this.setState(States.TALKING);

            // Pass a function that returns current speaking rate
            audioSync.startTalkingAnimation(this.avatarElement, () => currentSpeakingRate);
            console.log('   Talking animation started with dynamic rate');
        };

        utterance.onboundary = (event) => {
            // Boundary event fires for each word
            if (event.name === 'word') {
                wordCount++;
                const currentTime = Date.now();
                const elapsedSeconds = (currentTime - startTime) / 1000;

                // Calculate words per second
                const wordsPerSecond = wordCount / elapsedSeconds;

                // Normal speaking rate is ~2-3 words/second
                // Map to animation speed multiplier (0.5x to 2x)
                // Slow speech (1 wps) -> 0.5x animation speed (30 fps)
                // Normal speech (2.5 wps) -> 1.0x animation speed (60 fps)
                // Fast speech (4+ wps) -> 2.0x animation speed (120 fps)
                if (wordsPerSecond < 2) {
                    currentSpeakingRate = 0.5 + (wordsPerSecond / 2) * 0.5; // 0.5x to 1.0x
                } else if (wordsPerSecond < 3) {
                    currentSpeakingRate = 1.0; // 1.0x (normal)
                } else {
                    currentSpeakingRate = 1.0 + Math.min(1.0, (wordsPerSecond - 3) / 2); // 1.0x to 2.0x
                }

                // Log every 5 words
                if (wordCount % 5 === 0) {
                    console.log(`📊 Speaking rate: ${wordsPerSecond.toFixed(2)} words/sec, Animation multiplier: ${currentSpeakingRate.toFixed(2)}x`);
                }
            }
        };

        utterance.onend = () => {
            console.log('Browser TTS Speech ended');
            audioSync.stopTalkingAnimation(this.avatarElement);
            this.handleSpeechEnd(resolve);
        };

        utterance.onerror = (event) => {
            console.error('🚨 Speech synthesis error:', event);
            console.error('   Error type:', event.error);
            console.error('   Error message:', event.message);

            // Stop any ongoing animations
            audioSync.stopTalkingAnimation(this.avatarElement);
            audioSync.stopThinkingAnimation();

            // If session is still active, check accumulated text and go back to listening
            if (this.isActive) {
                // Check if user spoke during TALKING state (even though error occurred)
                if (this.accumulatedTranscript && this.accumulatedTranscript.trim() !== '') {
                    console.log(`📦 User spoke during TALKING (error occurred): "${this.accumulatedTranscript}"`);
                    console.log('   - Saving to lastTranscript and returning to LISTENING');
                    console.log('   - Timer will start when user stops speaking (final result detected)');

                    // Save accumulated transcript
                    this.lastTranscript = this.accumulatedTranscript;

                    // Update display
                    this.transcriptionElement.textContent = this.lastTranscript;

                    // Clear accumulation
                    this.accumulatedTranscript = '';

                    // Go to IDLE state and stay there
                    this.avatarElement.src = 'images/idle.png';
                    this.setState(States.IDLE);

                    // Restart speech recognition but stay in IDLE
                    try {
                        this.recognition.start();
                    } catch (error) {
                        console.log('   Recognition already started or error:', error);
                    }

                    // Note: Speech recognition continues, will detect when user speaks again
                } else {
                    // No accumulated text, return to IDLE
                    console.log('   Returning to IDLE state after speech error');

                    // Clear lastTranscript so next listening session starts fresh
                    this.lastTranscript = '';
                    console.log('   - Cleared lastTranscript for fresh start');

                    this.avatarElement.src = 'images/idle.png';
                    this.setState(States.IDLE);

                    try {
                        this.recognition.start();
                    } catch (error) {
                        console.log('   Recognition already started or error:', error);
                    }

                    // Note: Speech recognition continues, will detect when user speaks again
                }
            } else {
                this.avatarElement.src = 'images/idle.png';
                this.setState(States.IDLE);
            }
            resolve();
        };
    }

    toggleLanguage() {
        if (this.autoDetect) {
            // Switch to manual mode: EN → ZH
            this.autoDetect = false;
            this.sourceLang = 'en-US';
            this.targetLang = 'zh-CN';
            this.langDirection.textContent = 'EN → ZH';
            this.recognition.lang = 'en-US';
            console.log('📍 Switched to manual mode: EN → ZH (recognition: en-US)');
        } else if (this.sourceLang === 'en-US') {
            // Switch to manual mode: ZH → EN
            this.sourceLang = 'zh-CN';
            this.targetLang = 'en-US';
            this.langDirection.textContent = 'ZH → EN';
            this.recognition.lang = 'zh-CN';
            console.log('📍 Switched to manual mode: ZH → EN (recognition: zh-CN)');
        } else {
            // Switch back to auto mode
            this.autoDetect = true;
            this.langDirection.textContent = 'AUTO';
            // In AUTO mode, use Chinese recognition (can often pick up English too)
            this.recognition.lang = 'zh-CN';
            console.log('📍 Switched to AUTO mode (recognition: zh-CN for better Chinese support)');
        }

        // Clear previous results
        this.transcriptionElement.textContent = '';
        this.translationElement.textContent = '';
    }

    toggleTimerVisibility() {
        this.showTimer = !this.showTimer;

        if (this.showTimer) {
            this.timerToggleText.textContent = 'Hide Timer';
            console.log('⏱️ Timer animation enabled');
        } else {
            this.timerToggleText.textContent = 'Show Timer';
            console.log('⏱️ Timer animation disabled');
        }

        // Update button visual state
        if (this.showTimer) {
            this.timerToggleButton.classList.add('active');
        } else {
            this.timerToggleButton.classList.remove('active');
        }
    }

    toggleSettings() {
        if (this.settingsPanel.style.display === 'none') {
            this.settingsPanel.style.display = 'block';
            this.settingsToggleText.textContent = '⚙️ Hide Settings';
            console.log('⚙️ Settings panel opened');
        } else {
            this.settingsPanel.style.display = 'none';
            this.settingsToggleText.textContent = '⚙️ Settings';
            console.log('⚙️ Settings panel closed');
        }
    }

    setState(newState) {
        const oldState = this.currentState;
        this.currentState = newState;
        this.updateStatus(this.getStatusText(newState));

        // Update body class for CSS state styling
        document.body.className = `state-${newState}`;

        // Clear inline transform when entering IDLE to let CSS control scale
        if (newState === States.IDLE) {
            this.avatarElement.style.transform = '';
        }

        // Update debug display
        if (this.stateDisplayElement) {
            this.stateDisplayElement.textContent = newState.toUpperCase();
        }

        // Handle no audio timer based on state
        if (newState === States.LISTENING) {
            // Start no audio timer when entering LISTENING
            this.startNoAudioTimer();
        } else {
            // Clear timer when leaving LISTENING state
            this.clearNoAudioTimer();
        }

        // Log state change
        console.log(`🔄 STATE CHANGE: ${oldState} → ${newState}`);
    }

    getStatusText(state) {
        switch (state) {
            case States.IDLE:
                return 'Ready';
            case States.LISTENING:
                return 'Listening...';
            case States.WAITING:
                return 'Waiting...';
            case States.THINKING:
                return 'Thinking...';
            case States.TALKING:
                return 'Speaking...';
            default:
                return 'Ready';
        }
    }

    updateStatus(text) {
        this.statusElement.textContent = text;
    }

    updateButton() {
        if (this.isActive) {
            this.buttonText.textContent = 'Stop Session';
            this.startButton.classList.add('listening');
        } else {
            this.buttonText.textContent = 'Start Session';
            this.startButton.classList.remove('listening');
        }
    }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Check if page is opened via file:// protocol
    if (window.location.protocol === 'file:') {
        const warning = document.getElementById('protocol-warning');
        if (warning) {
            warning.style.display = 'block';
            console.warn('⚠️ Page opened via file:// protocol. Microphone permissions will not persist between sessions.');
            console.warn('💡 Solution: Serve the page over HTTP using serve.bat (Windows) or serve.sh (Mac/Linux)');
        }
    }

    const app = new TranslatorApp();
    console.log('Translator app initialized');
});
