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
        this.showTimer = true; // Timer animation visibility toggle (default: show)
        this.lastResultIndex = 0; // Track which results we've already processed
        this.noAudioTimer = null; // Timer for detecting no viable speech in LISTENING state
        this.noAudioTimeout = 2000; // 2 seconds - return to IDLE if no viable speech
        this.interimResultTimer = null; // Timer to finalize interim results if no final result comes
        this.interimResultTimeout = 2000; // 2 seconds after last interim result, treat as final
        this.audioContext = null; // Web Audio API context for audio analysis
        this.currentAudioSource = null; // Currently playing audio source

        // AGGRESSIVELY DISABLE browser speech synthesis
        // Cancel any existing synthesis immediately
        if (window.speechSynthesis) {
            window.speechSynthesis.cancel();
            console.log('🚫 Browser speech synthesis disabled - using Azure TTS only');
        }

        this.initializeElements();
        this.initializeSpeechRecognition();
        this.attachEventListeners();
        this.initializeUIState();
    }

    initializeUIState() {
        // Set timer button text based on default showTimer state
        if (this.showTimer) {
            this.timerToggleText.textContent = 'Hide Timer';
            this.timerToggleButton.classList.add('active');
        } else {
            this.timerToggleText.textContent = 'Show Timer';
            this.timerToggleButton.classList.remove('active');
        }
    }

    validateSpeech(text) {
        // Filter out invalid or nonsensical speech
        if (!text || text.trim() === '') {
            return false;
        }

        const trimmed = text.trim();

        // Reject if too short (less than 2 characters)
        if (trimmed.length < 2) {
            console.log(`⚠️ Rejected: Too short (${trimmed.length} chars): "${trimmed}"`);
            return false;
        }

        // Reject if it's just punctuation or symbols
        const alphanumericCount = (trimmed.match(/[\w\u4e00-\u9fa5]/g) || []).length;
        if (alphanumericCount < 2) {
            console.log(`⚠️ Rejected: Too few alphanumeric characters: "${trimmed}"`);
            return false;
        }

        // Reject common speech recognition errors, filler words, and noise
        const commonErrors = [
            // English filler words
            'uh', 'um', 'ah', 'eh', 'mm', 'hmm', 'hm', 'mhm', 'mmm',
            'uh huh', 'mm hmm', 'uh uh', 'uhh', 'umm', 'ahh', 'hmm hmm',
            'oh', 'ooh', 'oof', 'whoa', 'yeah', 'yep', 'nope', 'nah',
            // Single letters/articles that shouldn't be translated alone
            'a', 'i', 'the', 'and', 'or', 'but', 'in', 'on', 'at',
            // Chinese filler words
            '啊', '嗯', '呃', '哦', '哎', '唉', '诶', '额', '嘿',
            '嗯嗯', '啊啊', '哦哦', '呃呃',
            // Common meaningless sounds
            'shh', 'ssh', 'tsk', 'pfft', 'ugh', 'gah', 'bah',
            'ha', 'haha', 'heh', 'hehe'
        ];

        // Check both exact match and if the text starts/ends with filler words
        const lowerTrimmed = trimmed.toLowerCase();
        if (commonErrors.includes(lowerTrimmed)) {
            console.log(`⚠️ Rejected: Filler word/noise: "${trimmed}"`);
            return false;
        }

        // Also reject if it's ONLY filler words (space-separated)
        const words = lowerTrimmed.split(/\s+/);
        const allFillers = words.every(word => commonErrors.includes(word));
        if (allFillers) {
            console.log(`⚠️ Rejected: Only filler words: "${trimmed}"`);
            return false;
        }

        // Reject if it's mostly repetitive characters (e.g., "aaaa", "1111")
        const uniqueChars = new Set(trimmed.toLowerCase().replace(/\s/g, '')).size;
        if (trimmed.length >= 4 && uniqueChars <= 2) {
            console.log(`⚠️ Rejected: Repetitive characters: "${trimmed}"`);
            return false;
        }

        console.log(`✅ Valid speech: "${trimmed}"`);
        return true;
    }

    initializeElements() {
        this.avatarElement = document.getElementById('avatar');
        // Initialize canvas for avatar rendering
        audioSync.initCanvas(this.avatarElement);
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
        this.debugToggleButton = document.getElementById('debug-toggle');
        this.debugToggleText = document.getElementById('debug-toggle-text');
        this.debugPanel = document.getElementById('debug-panel');
        this.apiKeyInput = document.getElementById('api-key'); // May be null if using Azure backend
        this.azureRegionInput = document.getElementById('azure-region');
        this.transcriptionElement = document.getElementById('transcription');
        this.translationElement = document.getElementById('translation');
        this.cooldownTimerElement = document.getElementById('cooldown-timer-display');
        this.cooldownTextElement = document.getElementById('cooldown-text');
        this.cooldownProgressElement = document.getElementById('cooldown-progress');
        this.stateDisplayElement = document.getElementById('state-display');
        this.recognitionStatusElement = document.getElementById('recognition-status');
    }

    showIdleImage() {
        // Draw idle image to canvas
        if (audioSync.spriteSheets.idle) {
            audioSync.drawToCanvas(audioSync.spriteSheets.idle);
        }
    }

    // Helper method for Azure Speech SDK - continuous recognition doesn't need manual restarts
    restartRecognitionIfNeeded() {
        // With Azure Speech SDK continuous recognition, this is handled automatically
        // The sessionStopped event handler will restart if needed
        console.log('   Note: Azure continuous recognition handles restarts automatically');
    }

    async initializeSpeechRecognition() {
        // Use Azure Speech SDK for better accuracy
        const SpeechSDK = window.SpeechSDK;

        if (!SpeechSDK) {
            alert('Azure Speech SDK is not loaded. Please refresh the page.');
            return;
        }

        try {
            // Try to get API key from localStorage first
            const savedKey = localStorage.getItem('azureSpeechKey');
            const savedRegion = localStorage.getItem('azureSpeechRegion');

            if (savedKey && savedRegion) {
                console.log('🔑 Using saved Azure Speech key from localStorage');
                this.speechToken = savedKey;
                this.speechRegion = savedRegion;
                console.log(`✅ Using saved credentials for region: ${this.speechRegion}`);
            } else {
                // Fallback: Try to get from backend (only works when running locally)
                try {
                    if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
                        console.log('🔑 Attempting to get Azure Speech token from local backend...');
                        const tokenResponse = await fetch('http://localhost:3000/api/speech-token');

                        if (tokenResponse.ok) {
                            const tokenData = await tokenResponse.json();
                            if (tokenData.token && tokenData.region) {
                                this.speechToken = tokenData.token;
                                this.speechRegion = tokenData.region;
                                console.log(`✅ Got Azure Speech token from backend for region: ${this.speechRegion}`);
                            }
                        }
                    } else {
                        console.log('ℹ️ Not on localhost - client-side API key required');
                    }
                } catch (backendError) {
                    console.log('ℹ️ Backend not available (this is OK if using client-side key)');
                }

                // If still no key, prompt user
                if (!this.speechToken || !this.speechRegion) {
                    alert('⚠️ Please enter your Azure Speech API key in the Settings panel before starting a session.');
                    // Open settings panel
                    document.getElementById('settings-panel').style.display = 'block';
                    return;
                }
            }

            // Set initial language (zh-CN for AUTO mode)
            this.currentRecognitionLang = 'zh-CN';

            // Create recognizer (will be recreated when language changes)
            this.createAzureRecognizer();

        } catch (error) {
            console.error('❌ Failed to initialize Azure Speech:', error);
            alert('Failed to initialize Azure Speech Recognition. Please check your API key in Settings and try again.');
        }
    }

    createAzureRecognizer() {
        const SpeechSDK = window.SpeechSDK;

        // Create speech config using subscription key (not authorization token)
        const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
            this.speechToken,
            this.speechRegion
        );

        // Set recognition language
        speechConfig.speechRecognitionLanguage = this.currentRecognitionLang;
        console.log(`🌐 Azure recognizer language: ${this.currentRecognitionLang}`);

        // Create audio config from default microphone
        const audioConfig = SpeechSDK.AudioConfig.fromDefaultMicrophoneInput();

        // Create recognizer
        if (this.recognition) {
            // Clean up old recognizer
            this.recognition.close();
        }

        this.recognition = new SpeechSDK.SpeechRecognizer(speechConfig, audioConfig);

        // Store reference for cleanup
        this.speechConfig = speechConfig;
        this.audioConfig = audioConfig;

        // Azure Speech SDK event: sessionStarted
        this.recognition.sessionStarted = (s, e) => {
            console.log('🟢 Azure Speech recognition session started');
            console.log(`   - Current state: ${this.currentState}`);
            console.log(`   - Recognition language: ${this.currentRecognitionLang}`);

            // Update recognition status display
            if (this.recognitionStatusElement) {
                this.recognitionStatusElement.textContent = '🟢 Recognition: Running';
            }
        };

        // Azure Speech SDK event: recognizing (interim results)
        this.recognition.recognizing = (s, e) => {
            try {
                const transcript = e.result.text;
                if (!transcript || transcript.trim() === '') return;

                console.log(`🎤 Speech interim: "${transcript}" | Current State: ${this.currentState}`);

                // Transition from IDLE to LISTENING immediately when speech detected
                if (this.currentState === States.IDLE && this.isActive) {
                    console.log('🎤 Speech detected in IDLE - transitioning to LISTENING');
                    this.setState(States.LISTENING);
                    // Start animation for volume monitoring
                    audioSync.startListeningAnimation(this.avatarElement);
                    this.startNoAudioTimer(); // Start 2-second timeout
                }

                // Handle interim results
                if (this.currentState === States.LISTENING && transcript.trim() !== '') {
                    // Reset no-audio timer
                    this.resetNoAudioTimer();
                    // For interim results in LISTENING state, set a timer to auto-finalize
                    // if no final result comes within 2 seconds
                    if (this.interimResultTimer) {
                        clearTimeout(this.interimResultTimer);
                    }
                    this.interimResultTimer = setTimeout(() => {
                        console.log('⏰ No final result received - treating last interim as final');
                        console.log(`   Last transcript: "${this.lastTranscript || transcript}"`);
                        // Manually trigger finalization by calling the WAITING state logic
                        if (this.currentState === States.LISTENING) {
                            const finalTranscript = this.lastTranscript || transcript;
                            if (finalTranscript.trim() !== '') {
                                this.lastTranscript = finalTranscript;
                                this.transcriptionElement.textContent = finalTranscript;

                                // Validate the speech before processing
                                if (!this.validateSpeech(finalTranscript)) {
                                    console.log('❌ Speech validation failed - ignoring and staying in LISTENING state');
                                    this.lastTranscript = '';
                                    this.transcriptionElement.textContent = '';
                                    this.startNoAudioTimer();
                                    return;
                                }

                                console.log(`✅ Auto-finalized - entering WAITING state for ${this.cooldownDuration}ms`);
                                this.setState(States.WAITING);
                                audioSync.stopListeningAnimation();
                                audioSync.startVolumeMonitoring();

                                // Start timer and wait for translation
                                const waitingVolumeThreshold = 50;
                                audioSync.setVolumeCallback((volume) => {
                                    if (this.currentState === States.WAITING && volume > waitingVolumeThreshold) {
                                        console.log(`🔊 Volume detected during WAITING: ${volume.toFixed(1)} - interrupting timer!`);
                                        this.interruptWaitingState();
                                    }
                                });

                                if (this.showTimer) {
                                    audioSync.playTimerAnimation(this.avatarElement, this.cooldownDuration, () => {
                                        console.log('✅ Timer animation complete - validating before translation');
                                        audioSync.clearVolumeCallback();
                                        if (this.lastTranscript && this.validateSpeech(this.lastTranscript)) {
                                            this.handleTranslation(this.lastTranscript);
                                        } else {
                                            console.error('❌ Validation failed - returning to IDLE');
                                            this.lastTranscript = '';
                                            this.transcriptionElement.textContent = '';
                                            this.setState(States.IDLE);
                                            this.showIdleImage();
                                            // Azure continuous recognition stays running
                                        }
                                    });
                                }

                                this.translationTimer = setTimeout(() => {
                                    if (!this.showTimer) {
                                        audioSync.clearVolumeCallback();
                                        if (this.lastTranscript && this.validateSpeech(this.lastTranscript)) {
                                            this.handleTranslation(this.lastTranscript);
                                        } else {
                                            console.error('❌ Validation failed - returning to IDLE');
                                            this.lastTranscript = '';
                                            this.transcriptionElement.textContent = '';
                                            this.setState(States.IDLE);
                                            this.showIdleImage();
                                            // Azure continuous recognition stays running
                                        }
                                    }
                                }, this.cooldownDuration);
                            }
                        }
                    }, this.interimResultTimeout);
                }

                // If in IDLE state with active session and speech detected → transition to LISTENING
                if (this.currentState === States.IDLE && this.isActive && transcript.trim() !== '') {
                    console.log('🎤 Speech detected in IDLE - transitioning to LISTENING');
                    this.setState(States.LISTENING);
                    // Clear volume callback since we're now in LISTENING
                    audioSync.clearVolumeCallback();
                }

                // For interim results, show in display (don't save to lastTranscript yet)
                const displayText = this.lastTranscript ? this.lastTranscript + ' ' + transcript : transcript;
                this.transcriptionElement.textContent = displayText;
                console.log(`📝 Interim display: "${displayText}"`);

            } catch (error) {
                console.error('❌ Error in recognizing handler:', error);
            }
        };

        // Azure Speech SDK event: recognized (final results)
        this.recognition.recognized = (s, e) => {
            try {
                const transcript = e.result.text;
                if (!transcript || transcript.trim() === '') return;

                console.log(`🎤 Speech FINAL: "${transcript}" | Current State: ${this.currentState}`);

                // Clear interim result timer since we got a final result
                if (this.interimResultTimer) {
                    clearTimeout(this.interimResultTimer);
                    this.interimResultTimer = null;
                }

                // If in TALKING state, accumulate speech but DON'T interrupt
                if (this.currentState === States.TALKING) {
                    if (this.accumulatedTranscript) {
                        this.accumulatedTranscript += ' ' + transcript;
                    } else {
                        this.accumulatedTranscript = transcript;
                    }
                    console.log(`📝 Accumulated during TALKING: "${this.accumulatedTranscript}"`);
                    this.transcriptionElement.textContent = this.accumulatedTranscript;
                    return;
                }

                // If in WAITING state, combine transcripts
                if (this.currentState === States.WAITING) {
                    console.log('📝 Final speech during WAITING - updating transcript');
                    if (this.lastTranscript && transcript.trim()) {
                        this.lastTranscript = this.lastTranscript + ' ' + transcript;
                    } else if (transcript.trim()) {
                        this.lastTranscript = transcript;
                    }
                    this.transcriptionElement.textContent = this.lastTranscript;
                    return;
                }

                // Accumulate final transcripts (volume-based transitions will handle state changes)
                if (this.lastTranscript && this.lastTranscript.trim() !== '') {
                    this.lastTranscript = this.lastTranscript + ' ' + transcript;
                    console.log(`📝 Accumulated final transcript: "${this.lastTranscript}"`);
                } else {
                    this.lastTranscript = transcript;
                }
                this.transcriptionElement.textContent = this.lastTranscript;

                // LISTENING → WAITING: Only when we have valid recognized speech
                if (this.currentState === States.LISTENING) {
                    console.log(`⏱️ Final speech detected - validating before entering WAITING`);

                    // Validate the speech before processing
                    if (!this.validateSpeech(this.lastTranscript)) {
                        console.log('❌ Speech validation failed - staying in LISTENING state');
                        console.log(`   Rejected text: "${this.lastTranscript}"`);
                        // Clear the invalid transcript and stay in LISTENING state
                        this.lastTranscript = '';
                        this.transcriptionElement.textContent = '';
                        return;
                    }

                    console.log(`✅ Speech validated - entering WAITING state for ${this.cooldownDuration}ms`);

                    // Clear the no-audio timer since we have valid speech
                    this.clearNoAudioTimer();

                    // Enter WAITING state immediately
                    this.setState(States.WAITING);

                    // Stop listening animation but keep monitoring volume for interruptions
                    audioSync.stopListeningAnimation();
                    audioSync.startVolumeMonitoring();

                    // Start cooldown timer
                    if (this.showTimer) {
                        audioSync.playTimerAnimation(this.avatarElement, this.cooldownDuration, () => {
                            console.log('✅ Timer complete - entering THINKING');
                            this.setState(States.THINKING);
                            audioSync.stopVolumeMonitoring();
                            audioSync.startThinkingAnimation(this.avatarElement);

                            // Translate (speech already validated)
                            setTimeout(() => {
                                this.handleTranslation(this.lastTranscript);
                            }, 100);
                        });
                    } else {
                        // Backup timeout if timer disabled
                        setTimeout(() => {
                            if (this.currentState === States.WAITING) {
                                console.log('✅ Cooldown complete - entering THINKING');
                                this.setState(States.THINKING);
                                audioSync.stopVolumeMonitoring();
                                audioSync.startThinkingAnimation(this.avatarElement);

                                // Translate (speech already validated)
                                setTimeout(() => {
                                    this.handleTranslation(this.lastTranscript);
                                }, 100);
                            }
                        }, this.cooldownDuration);
                    }
                }

            } catch (error) {
                console.error('❌ Error in recognized handler:', error);
            }
        };

        // Azure Speech SDK event: canceled (errors)
        this.recognition.canceled = (s, e) => {
            const SpeechSDK = window.SpeechSDK;
            console.error('🚨 Azure Speech recognition canceled:', e.reason);

            if (e.reason === SpeechSDK.CancellationReason.Error) {
                console.error('   Error code:', e.errorCode);
                console.error('   Error details:', e.errorDetails);

                // Handle critical errors
                if (e.errorCode === 'ConnectionFailure' || e.errorCode === 'AuthenticationFailure') {
                    alert(`Speech recognition error: ${e.errorDetails}`);
                    this.stopListening();
                    return;
                }
            }

            // For other cancellations, just log
            console.log('   Recognition will restart automatically if session is active');
        };

        // Azure Speech SDK event: sessionStopped
        this.recognition.sessionStopped = (s, e) => {
            console.log('🔴 Azure Speech recognition session stopped');

            // Restart if session is still active and not in THINKING/TALKING
            if (this.isActive && this.currentState !== States.THINKING && this.currentState !== States.TALKING) {
                console.log('   - Restarting recognition...');
                setTimeout(() => {
                    if (this.isActive) {
                        try {
                            this.recognition.startContinuousRecognitionAsync();
                        } catch (error) {
                            console.error('   - Failed to restart:', error);
                        }
                    }
                }, 100);
            }
        };
    }


    attachEventListeners() {
        this.startButton.addEventListener('click', () => this.toggleListening());
        this.languageButton.addEventListener('click', () => this.toggleLanguage());
        this.timerToggleButton.addEventListener('click', () => this.toggleTimerVisibility());
        this.settingsToggleButton.addEventListener('click', () => this.toggleSettings());
        this.debugToggleButton.addEventListener('click', () => this.toggleDebug());
    }

    async toggleListening() {
        console.log('🔘 Start Session button clicked');

        // Detect iOS
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
        if (isIOS) {
            console.log('📱 iOS device detected');
        }

        // Prevent double-clicking
        if (this.isTogglingListening) {
            console.log('Already toggling listening state, ignoring click...');
            return;
        }

        this.isTogglingListening = true;

        try {
            if (!this.isActive) {
                console.log('➡️ Starting session...');
                await this.startListening();
            } else {
                console.log('⏹️ Stopping session...');
                this.stopListening();
            }
        } catch (error) {
            console.error('❌ Error in toggleListening:', error);
            alert(`Failed to start: ${error.message}`);
        } finally {
            this.isTogglingListening = false;
        }
    }

    async startListening() {
        try {
            // Check if Azure Speech SDK is available
            if (typeof window.SpeechSDK === 'undefined') {
                throw new Error('Azure Speech SDK not loaded. Please refresh the page.');
            }
            console.log('✅ Azure Speech SDK is available');

            // Preload ALL animation frames (listening, thinking, timer, talking) before starting
            console.log('📦 Preloading all animation frames...');
            await Promise.all([
                audioSync.preloadEssentialFrames(),
                audioSync.preloadTalkingFrames()
            ]);
            console.log('✅ All frames preloaded and ready!');

            // Initialize microphone for animation
            console.log('🎤 Initializing microphone...');
            await audioSync.initializeMicrophone();
            console.log('✅ Microphone initialized');

            this.isActive = true;

            // Start Azure Speech continuous recognition
            console.log('🎙️ Starting Azure Speech continuous recognition...');
            const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

            this.recognition.startContinuousRecognitionAsync(
                () => {
                    console.log('✅ Azure Speech recognition started successfully');
                },
                (error) => {
                    console.error('❌ Failed to start Azure Speech recognition:', error);
                    const errorMsg = isIOS
                        ? `iOS Safari may have limited support for Azure Speech SDK. Error: ${error}`
                        : `Failed to start speech recognition: ${error}`;
                    throw new Error(errorMsg);
                }
            );

            // Start in IDLE state - will transition to LISTENING when user speaks
            this.setState(States.IDLE);
            this.showIdleImage();

            // Start listening animation for volume monitoring (will transition to LISTENING on speech)
            audioSync.startListeningAnimation(this.avatarElement);

            // Set up volume callback for state transitions based on volume
            // Speech recognition (not silence) triggers LISTENING → WAITING

            audioSync.setVolumeCallback((volume) => {
                if (!this.isActive) return;

                const threshold = audioSync.volumeThreshold; // Use configurable threshold

                // IDLE → LISTENING: Instant transition when volume detected
                if (this.currentState === States.IDLE && volume > threshold) {
                    console.log(`🔊 Volume detected (${volume.toFixed(1)}) - transitioning to LISTENING`);
                    this.setState(States.LISTENING);
                    audioSync.startListeningAnimation(this.avatarElement);
                    this.startNoAudioTimer(); // Start 2-second timeout
                }

                // LISTENING: Just monitor volume, speech recognition will trigger WAITING
                else if (this.currentState === States.LISTENING) {
                    // No action needed - speech recognition handles LISTENING → WAITING transition
                }

                // WAITING: Monitor for interruption
                else if (this.currentState === States.WAITING) {
                    if (volume > threshold) {
                        console.log(`🔊 Audio detected during WAITING (${volume.toFixed(1)}) - returning to LISTENING`);
                        // Cancel timers and return to LISTENING
                        audioSync.stopTimerAnimation();
                        audioSync.stopVolumeMonitoring();
                        this.setState(States.LISTENING);
                        audioSync.startListeningAnimation(this.avatarElement);
                        this.startNoAudioTimer(); // Restart 2-second timeout
                    }
                }
            });

            // Delay button update by 500ms to match microphone initialization period
            // This keeps "Start Session" showing until system is fully ready
            setTimeout(() => {
                if (this.isActive) {
                    this.updateButton();
                    console.log('✅ System fully initialized and ready');
                }
            }, 500);
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

        // Clear interim result timer
        if (this.interimResultTimer) {
            clearTimeout(this.interimResultTimer);
            this.interimResultTimer = null;
        }

        // Clear volume callback
        audioSync.clearVolumeCallback();

        // Clear all transcripts and reset for fresh start
        this.accumulatedTranscript = '';
        this.lastTranscript = '';
        this.lastResultIndex = 0;

        // Clear display
        this.transcriptionElement.textContent = '';
        this.translationElement.textContent = '';

        // Stop Azure Speech continuous recognition
        if (this.recognition) {
            this.recognition.stopContinuousRecognitionAsync(
                () => {
                    console.log('✅ Azure Speech recognition stopped');
                },
                (error) => {
                    console.log('⚠️ Error stopping recognition:', error);
                }
            );
        }
        this.synthesis.cancel();

        // Cleanup audio resources (this will close the microphone stream)
        audioSync.cleanup();

        // Return to idle
        this.showIdleImage();
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
        this.showIdleImage();

        // Brief pause on idle, then transition to LISTENING
        setTimeout(() => {
            this.setState(States.LISTENING);
            console.log('   - Timer interrupted. Transitioning to LISTENING state.');

            // Start listening animation (no-audio timer auto-started by setState)
            audioSync.startListeningAnimation(this.avatarElement);
        }, 50);
    }

    startNoAudioTimer() {
        // Start timer - if no viable speech within 2 seconds, return to IDLE
        this.clearNoAudioTimer();

        console.log(`⏰ Starting LISTENING timeout (${this.noAudioTimeout}ms)`);
        this.noAudioTimer = setTimeout(() => {
            console.log('⏰ No viable speech detected within 2 seconds');

            // Only transition if still in LISTENING state and session is active
            if (this.currentState === States.LISTENING && this.isActive) {
                console.log('   → Returning to IDLE');
                this.lastTranscript = '';
                this.transcriptionElement.textContent = '';
                this.setState(States.IDLE);
                this.showIdleImage();
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
        console.log(`🌐 handleTranslation called`);
        console.log(`   Text: "${text}"`);
        console.log(`   Text length: ${text ? text.length : 0}`);
        console.log(`   Current state: ${this.currentState}`);

        if (!text || text.trim() === '') {
            // No content to translate - return to IDLE
            console.error('❌ No content to translate - returning to IDLE');

            if (this.isActive) {
                // Return to IDLE and stay there
                this.showIdleImage();
                this.setState(States.IDLE);

                // Azure continuous recognition stays running automatically

                // Note: Speech recognition continues, will detect when user speaks again
            } else {
                this.showIdleImage();
                this.setState(States.IDLE);
            }
            return;
        }

        // Clear accumulated transcript at START of translation cycle
        // This prevents any speech captured during previous TALKING state from interfering
        this.accumulatedTranscript = '';
        console.log('   - Cleared accumulatedTranscript at start of translation');

        // Stop listening animation (should already be stopped in WAITING state)
        audioSync.stopListeningAnimation();

        // Stop volume monitoring from WAITING state (otherwise it overwrites debug panel!)
        audioSync.stopVolumeMonitoring();

        // IMPORTANT: Stop speech recognition during THINKING/TALKING to prevent echo
        try {
            if (this.recognition) {
                this.recognition.stopContinuousRecognitionAsync(
                    () => console.log('🔴 Stopped speech recognition for THINKING/TALKING state'),
                    (error) => console.log('Recognition stop error:', error)
                );
            }
        } catch (error) {
            console.log('Recognition already stopped or error:', error);
        }

        // Enter thinking state
        this.setState(States.THINKING);
        audioSync.startThinkingAnimation(this.avatarElement);

        try {
            // Determine source and target languages
            let detectedLang, targetLang;

            if (this.autoDetect) {
                // AUTO mode: Detect language from text
                detectedLang = detectLanguage(text);
                targetLang = detectedLang === 'zh-CN' ? 'en-US' : 'zh-CN';
                console.log(`🌐 AUTO mode - Detected: ${detectedLang} → ${targetLang}`);
            } else {
                // MANUAL mode: Use user-selected languages
                detectedLang = this.sourceLang;
                targetLang = this.targetLang;
                console.log(`🌐 MANUAL mode - Using: ${detectedLang} → ${targetLang}`);
            }

            // Log detected language for debugging
            const sourceName = detectedLang === 'zh-CN' ? 'ZH' : 'EN';
            const targetName = targetLang === 'zh-CN' ? 'ZH' : 'EN';
            console.log(`   Translation: ${sourceName} → ${targetName}`);

            // Update language display (only if in auto-detect mode)
            if (this.autoDetect) {
                this.langDirection.textContent = `${sourceName} → ${targetName}`;
            }

            // Translate using Azure Speech Translation
            console.log('🔄 Translating with Azure Speech...');
            const translation = await this.translateWithAzure(text, detectedLang, targetLang);

            // Validate translation output before speaking
            if (!this.validateSpeech(translation)) {
                console.log('❌ Translation result is invalid/nonsensical - skipping speech');
                this.translationElement.textContent = '[Invalid translation - try again]';
                audioSync.stopThinkingAnimation();

                // Return to IDLE and restart recognition
                if (this.isActive) {
                    this.showIdleImage();
                    this.setState(States.IDLE);
                    console.log('🔄 Restarting speech recognition after invalid translation...');
                    this.recognition.startContinuousRecognitionAsync(
                        () => console.log('✅ Recognition restarted successfully'),
                        (error) => console.error('❌ Failed to restart recognition:', error)
                    );
                    audioSync.startListeningAnimation(this.avatarElement);
                }
                return;
            }

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
                this.showIdleImage();
                this.setState(States.IDLE);
                // Azure continuous recognition stays running automatically
                // Note: Speech recognition continues, will detect when user speaks again
            } else {
                this.showIdleImage();
                this.setState(States.IDLE);
            }
        }
    }

    async translateWithAzure(text, sourceLang, targetLang) {
        try {
            // Map language codes to MyMemory format
            const langMap = {
                'en-US': 'en-US',
                'zh-CN': 'zh-CN',
                'en': 'en-US',
                'zh-Hans': 'zh-CN'
            };

            const sourceCode = langMap[sourceLang] || sourceLang;
            const targetCode = langMap[targetLang] || targetLang;

            console.log(`📡 Translating: ${sourceCode} → ${targetCode}`);

            // Try backend first (if available - only works locally)
            try {
                const backendUrl = window.location.hostname === 'localhost'
                    ? 'http://localhost:3000/api/translate'
                    : '/api/translate';
                const backendResponse = await fetch(backendUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        text: text,
                        from: sourceLang === 'en-US' ? 'en' : 'zh-Hans',
                        to: targetLang === 'zh-CN' ? 'zh-Hans' : 'en'
                    })
                });

                if (backendResponse.ok) {
                    const data = await backendResponse.json();
                    return data.translation;
                }
            } catch (backendError) {
                console.log('ℹ️ Backend not available, using direct API call');
            }

            // Fallback: Call MyMemory API directly (free, no key required)
            const endpoint = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${sourceCode}|${targetCode}`;
            const response = await fetch(endpoint);

            if (!response.ok) {
                throw new Error(`Translation API error: ${response.status}`);
            }

            const data = await response.json();
            if (data.responseStatus === 200) {
                const translation = data.responseData.translatedText;
                console.log(`✅ Translation: "${text}" → "${translation}"`);
                return translation;
            } else {
                throw new Error('Translation API returned error');
            }
        } catch (error) {
            console.error('❌ Translation failed:', error);
            // Fallback: return original text
            return text;
        }
    }

    async speak(text, lang = null) {
        console.log('🗣️ Starting speech synthesis');
        console.log(`   Text: "${text.substring(0, 50)}..."`);
        console.log(`   Language: ${lang || this.targetLang}`);

        // Stop any currently playing audio source
        if (this.currentAudioSource) {
            try {
                this.currentAudioSource.stop();
                this.currentAudioSource.disconnect();
                console.log('🛑 Stopped previous audio in speak()');
            } catch (e) {
                console.log('Previous audio already stopped');
            }
            this.currentAudioSource = null;
        }

        // Cancel any ongoing browser speech synthesis
        if (this.synthesis) {
            this.synthesis.cancel();
        }

        // Always use Azure Speech TTS
        console.log('✅ Using Azure Speech TTS');
        return await this.speakWithAzureBackend(text, lang || this.targetLang);
    }

    async speakWithAzureBackend(text, lang) {
        return new Promise((resolve, reject) => {
            try {
                // STOP any currently playing audio source first
                if (this.currentAudioSource) {
                    try {
                        this.currentAudioSource.stop();
                        this.currentAudioSource.disconnect();
                        console.log('🛑 Stopped previous audio source');
                    } catch (e) {
                        console.log('Previous audio already stopped:', e);
                    }
                    this.currentAudioSource = null;
                }

                // TRIPLE-CHECK: Cancel browser speech synthesis in multiple ways
                if (window.speechSynthesis) {
                    // Method 1: Cancel any queued utterances
                    window.speechSynthesis.cancel();

                    // Method 2: Also pause if speaking
                    if (window.speechSynthesis.speaking) {
                        window.speechSynthesis.pause();
                        window.speechSynthesis.cancel();
                    }

                    console.log('🚫 BLOCKED: Browser speech synthesis forcefully cancelled');
                }

                const SpeechSDK = window.SpeechSDK;
                console.log(`🗣️ Using Azure Speech SDK ONLY for TTS (${lang})`);

                // Create speech config
                const speechConfig = SpeechSDK.SpeechConfig.fromSubscription(
                    this.speechToken,
                    this.speechRegion
                );

                // Map language to voice
                const voiceMap = {
                    'en': 'en-US-JennyNeural',
                    'en-US': 'en-US-JennyNeural',
                    'zh-Hans': 'zh-CN-XiaoxiaoNeural',
                    'zh-CN': 'zh-CN-XiaoxiaoNeural'
                };
                speechConfig.speechSynthesisVoiceName = voiceMap[lang] || voiceMap['en-US'];

                // Create synthesizer (Azure plays audio automatically)
                const synthesizer = new SpeechSDK.SpeechSynthesizer(speechConfig);
                console.log('🔊 Created Azure synthesizer - will play audio once');

                // Synthesize speech
                console.log('🗣️ Calling speakTextAsync...');
                synthesizer.speakTextAsync(
                    text,
                    async (result) => {
                        if (result.reason === SpeechSDK.ResultReason.SynthesizingAudioCompleted) {
                            console.log('✅ TTS synthesis completed');

                            // FINAL CHECK: Cancel browser synthesis right before playing Azure audio
                            if (window.speechSynthesis) {
                                window.speechSynthesis.cancel();
                            }

                            try {
                                // Convert audio data to blob
                                const audioBlob = new Blob([result.audioData], { type: 'audio/mpeg' });

                                // Initialize audio context
                                if (!this.audioContext) {
                                    this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
                                }

                                if (this.audioContext.state === 'suspended') {
                                    await this.audioContext.resume();
                                }

                                // Decode audio
                                const arrayBuffer = await audioBlob.arrayBuffer();
                                const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

                                // Create source and analyzer
                                const source = this.audioContext.createBufferSource();
                                const analyser = this.audioContext.createAnalyser();
                                analyser.fftSize = 256;
                                analyser.smoothingTimeConstant = 0.7;

                                source.buffer = audioBuffer;
                                source.connect(analyser);
                                // DON'T connect to destination - Azure already plays, we just analyze volume
                                // analyser.connect(this.audioContext.destination);

                                this.currentAudioSource = source;

                                // Enter TALKING state
                                console.log('🎙️ Azure TTS playback started - entering TALKING state');
                                this.setState(States.TALKING);

                                // Start animation with volume analysis (AE-style)
                                const dataArray = new Uint8Array(analyser.frequencyBinCount);

                                // AE-style parameters
                                const threshold = 0.01;      // Almost zero threshold to distinguish silence vs sound
                                const slowSpeed = 1.0;       // Speed when basically silent
                                const minFastSpeed = 1.0;    // Min speed when sound is present
                                const maxFastSpeed = audioSync.maxAnimationSpeed; // Max speed when loud (adjustable via slider)
                                const maxAmp = 20.0;         // Max amplitude for mapping
                                const samples = 5;           // Number of samples for smoothing
                                const smoothDuration = 200;  // 200ms smoothing window

                                // Store recent amplitude samples for smoothing
                                const ampHistory = [];
                                const sampleInterval = smoothDuration / samples;
                                let lastSampleTime = Date.now();

                                // Ease in/out function for smooth speed transitions
                                const easeInOut = (t, inVal, outVal, minSpeed, maxSpeed) => {
                                    if (t <= inVal) return minSpeed;
                                    if (t >= outVal) return maxSpeed;
                                    const normalized = (t - inVal) / (outVal - inVal);
                                    const eased = normalized < 0.5
                                        ? 2 * normalized * normalized
                                        : 1 - Math.pow(-2 * normalized + 2, 2) / 2;
                                    return minSpeed + (maxSpeed - minSpeed) * eased;
                                };

                                const getVolumeMultiplier = () => {
                                    // Get current volume
                                    analyser.getByteFrequencyData(dataArray);
                                    const sum = dataArray.reduce((a, b) => a + b, 0);
                                    const average = sum / dataArray.length;
                                    const max = Math.max(...dataArray);
                                    const volume = (average * 0.5) + (max * 0.5);
                                    const amp = Math.min(volume, 255) / 255 * maxAmp; // Normalize to 0-20 range

                                    // Add to history with timestamp
                                    const now = Date.now();
                                    ampHistory.push({ time: now, amp: amp });

                                    // Remove old samples outside smoothing window
                                    const cutoffTime = now - smoothDuration;
                                    while (ampHistory.length > 0 && ampHistory[0].time < cutoffTime) {
                                        ampHistory.shift();
                                    }

                                    // Calculate smoothed amplitude (average of recent samples)
                                    const totalAmp = ampHistory.reduce((sum, sample) => sum + sample.amp, 0);
                                    const smoothed = ampHistory.length > 0 ? totalAmp / ampHistory.length : 0;

                                    // Determine speed based on threshold
                                    let speed;
                                    if (smoothed < threshold) {
                                        speed = slowSpeed;
                                    } else {
                                        // Map amplitude from threshold..maxAmp to minFastSpeed..maxFastSpeed
                                        speed = easeInOut(smoothed, threshold, maxAmp, minFastSpeed, maxFastSpeed);
                                    }

                                    return speed;
                                };

                                audioSync.startTalkingAnimation(this.avatarElement, getVolumeMultiplier);

                                // Handle playback end
                                source.onended = () => {
                                    console.log('Azure TTS playback ended');
                                    this.currentAudioSource = null;
                                    audioSync.stopTalkingAnimation(this.avatarElement);
                                    this.showIdleImage();

                                    // Clear transcripts
                                    this.lastTranscript = '';
                                    this.transcriptionElement.textContent = '';

                                    // Return to IDLE
                                    if (this.isActive) {
                                        this.setState(States.IDLE);

                                        // CRITICAL: Restart recognition after TTS ends
                                        console.log('🔄 Restarting speech recognition...');
                                        this.recognition.startContinuousRecognitionAsync(
                                            () => console.log('✅ Recognition restarted successfully'),
                                            (error) => console.error('❌ Failed to restart recognition:', error)
                                        );

                                        // Restart listening animation immediately for instant response
                                        console.log('🎤 Restarting listening animation for continuous volume monitoring');
                                        audioSync.startListeningAnimation(this.avatarElement);
                                    }

                                    synthesizer.close();
                                    resolve();
                                };

                                // Start source for volume analysis (even though not connected to speakers)
                                source.start(0);
                            } catch (audioError) {
                                console.error('❌ Audio processing failed:', audioError);
                                synthesizer.close();
                                reject(audioError);
                            }
                        } else {
                            console.error('❌ TTS synthesis failed:', result.reason);
                            synthesizer.close();
                            reject(new Error('TTS synthesis failed'));
                        }
                    },
                    (error) => {
                        console.error('❌ Azure TTS error:', error);
                        synthesizer.close();
                        reject(error);
                    }
                );
            } catch (error) {
                console.error('❌ Azure TTS setup failed:', error);
                reject(error);
            }
        });
    }

    // REMOVED: speakWithBrowser() function
    // Browser speech synthesis is no longer used - Azure TTS only

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
                this.showIdleImage();
                this.setState(States.IDLE);

                // Restart speech recognition but stay in IDLE
                console.log('🔄 Restarting speech recognition...');
                this.recognition.startContinuousRecognitionAsync(
                    () => console.log('✅ Recognition restarted successfully'),
                    (error) => console.error('❌ Failed to restart recognition:', error)
                );
                audioSync.startListeningAnimation(this.avatarElement);
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

                this.showIdleImage();
                this.setState(States.IDLE);

                // Restart recognition
                console.log('🔄 Restarting speech recognition...');
                this.recognition.startContinuousRecognitionAsync(
                    () => console.log('✅ Recognition restarted successfully'),
                    (error) => console.error('❌ Failed to restart recognition:', error)
                );
                audioSync.startListeningAnimation(this.avatarElement);
            }
        } else {
            console.log('Session not active - staying in current state');
        }

        resolve();
    }

    // REMOVED: setupUtteranceHandlers() function
    // Only used by removed speakWithBrowser() - no longer needed

    toggleLanguage() {
        if (this.autoDetect) {
            // Switch to manual mode: EN → ZH
            this.autoDetect = false;
            this.sourceLang = 'en-US';
            this.targetLang = 'zh-CN';
            this.langDirection.textContent = 'EN → ZH';
            this.currentRecognitionLang = 'en-US';
            console.log('📍 Switched to manual mode: EN → ZH (recognition: en-US)');
        } else if (this.sourceLang === 'en-US') {
            // Switch to manual mode: ZH → EN
            this.sourceLang = 'zh-CN';
            this.targetLang = 'en-US';
            this.langDirection.textContent = 'ZH → EN';
            this.currentRecognitionLang = 'zh-CN';
            console.log('📍 Switched to manual mode: ZH → EN (recognition: zh-CN)');
        } else {
            // Switch back to auto mode
            this.autoDetect = true;
            this.langDirection.textContent = 'AUTO';
            this.currentRecognitionLang = 'zh-CN';
            console.log('📍 Switched to AUTO mode (recognition: zh-CN for better Chinese support)');
        }

        // Clear previous results
        this.transcriptionElement.textContent = '';
        this.translationElement.textContent = '';

        // Restart recognition if session is active to apply language change
        if (this.isActive) {
            console.log('🔄 Recreating Azure recognizer with new language...');

            // Stop current recognition
            if (this.recognition) {
                this.recognition.stopContinuousRecognitionAsync(() => {
                    // Recreate recognizer with new language
                    this.createAzureRecognizer();

                    // Restart recognition
                    this.recognition.startContinuousRecognitionAsync(
                        () => console.log('✅ Recognition restarted with new language'),
                        (error) => console.error('❌ Failed to restart:', error)
                    );
                });
            }
        }
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
        // Close debug panel if open
        if (this.debugPanel.style.display === 'block') {
            this.debugPanel.style.display = 'none';
            this.debugToggleText.textContent = 'Debug Tools';
        }

        if (this.settingsPanel.style.display === 'none') {
            this.settingsPanel.style.display = 'block';
            this.settingsToggleText.textContent = 'Hide Settings';
            console.log('⚙️ Settings panel opened');
        } else {
            this.settingsPanel.style.display = 'none';
            this.settingsToggleText.textContent = 'Settings';
            console.log('⚙️ Settings panel closed');
        }
    }

    toggleDebug() {
        // Close settings panel if open
        if (this.settingsPanel.style.display === 'block') {
            this.settingsPanel.style.display = 'none';
            this.settingsToggleText.textContent = 'Settings';
        }

        if (this.debugPanel.style.display === 'none') {
            this.debugPanel.style.display = 'block';
            this.debugToggleText.textContent = 'Hide Debug Tools';
            console.log('🔧 Debug tools panel opened');
        } else {
            this.debugPanel.style.display = 'none';
            this.debugToggleText.textContent = 'Debug Tools';
            console.log('🔧 Debug tools panel closed');
        }
    }

    setState(newState) {
        const oldState = this.currentState;
        this.currentState = newState;
        this.updateStatus(this.getStatusText(newState));

        // Log state change with transcript info
        if (oldState === States.LISTENING && newState === States.IDLE) {
            console.log(`⚠️ LISTENING → IDLE transition`);
            console.log(`   Current transcript: "${this.lastTranscript}"`);
            console.log(`   Display text: "${this.transcriptionElement.textContent}"`);
        }

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
        // Note: Volume-based silence detection handles LISTENING → WAITING transition
        // No direct LISTENING → IDLE transition
        if (newState === States.LISTENING) {
            // No timer needed - volume detection handles transitions
            // this.startNoAudioTimer(); // DISABLED
        } else {
            // Clear timer when leaving LISTENING state
            this.clearNoAudioTimer();
            // Also clear interim result timer when leaving LISTENING
            if (this.interimResultTimer) {
                clearTimeout(this.interimResultTimer);
                this.interimResultTimer = null;
            }
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

// Wait for Azure Speech SDK to load
function waitForSpeechSDK() {
    return new Promise((resolve) => {
        if (window.SpeechSDK) {
            console.log('✅ Azure Speech SDK already loaded');
            resolve();
            return;
        }

        console.log('⏳ Waiting for Azure Speech SDK to load...');
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait
        const checkInterval = setInterval(() => {
            attempts++;
            if (window.SpeechSDK) {
                console.log('✅ Azure Speech SDK loaded');
                clearInterval(checkInterval);
                resolve();
            } else if (attempts >= maxAttempts) {
                console.error('❌ Azure Speech SDK failed to load after 5 seconds');
                clearInterval(checkInterval);
                alert('Failed to load Azure Speech SDK. Please refresh the page or check your internet connection.');
                resolve(); // Resolve anyway to not block initialization
            }
        }, 100);
    });
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', async () => {
    // Check if page is opened via file:// protocol
    if (window.location.protocol === 'file:') {
        const warning = document.getElementById('protocol-warning');
        if (warning) {
            warning.style.display = 'block';
            console.warn('⚠️ Page opened via file:// protocol. Microphone permissions will not persist between sessions.');
            console.warn('💡 Solution: Serve the page over HTTP using serve.bat (Windows) or serve.sh (Mac/Linux)');
        }
    }

    // Wait for Azure Speech SDK to be available
    await waitForSpeechSDK();

    const app = new TranslatorApp();
    console.log('Translator app initialized');

    // ===== Setup UI Controls First (before microphone init) =====
    console.log('🎛️ Setting up UI controls...');

    // Avatar size slider handler
    const avatarSizeSlider = document.getElementById('avatar-size');
    const avatarSizeValue = document.getElementById('avatar-size-value');

    if (avatarSizeSlider && avatarSizeValue) {
        avatarSizeSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            avatarSizeValue.textContent = value + '%';
            audioSync.avatarScale = value / 100; // Convert percentage to 0-1 scale

            // Redraw current image to apply new scale immediately
            app.showIdleImage();
            console.log(`Avatar scale updated to ${value}%`);
        });
    }

    // Cooldown timer slider handler
    const cooldownSlider = document.getElementById('cooldown-timer');
    const cooldownValue = document.getElementById('cooldown-timer-value');

    console.log('🎛️ Cooldown slider elements:', { slider: cooldownSlider, value: cooldownValue });

    if (cooldownSlider && cooldownValue) {
        console.log('✅ Attaching cooldown slider handler');
        console.log(`   Current value: ${cooldownSlider.value}ms`);
        console.log(`   App cooldown: ${app.cooldownDuration}ms`);

        // Initialize display with current app value
        cooldownValue.textContent = (app.cooldownDuration / 1000).toFixed(1) + 's';
        cooldownSlider.value = app.cooldownDuration;

        cooldownSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            app.cooldownDuration = value;
            cooldownValue.textContent = (value / 1000).toFixed(1) + 's';
            console.log(`🎛️ Cooldown duration changed: ${value}ms (${(value / 1000).toFixed(1)}s)`);
            console.log(`   App cooldownDuration is now: ${app.cooldownDuration}ms`);
        });
    } else {
        console.error('❌ Cooldown slider elements not found!');
        console.error(`   Slider: ${cooldownSlider}, Value display: ${cooldownValue}`);
    }

    // Microphone sensitivity slider handler
    const micSensitivitySlider = document.getElementById('mic-sensitivity');
    const micSensitivityValue = document.getElementById('mic-sensitivity-value');

    if (micSensitivitySlider && micSensitivityValue) {
        micSensitivitySlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            audioSync.volumeThreshold = value;
            micSensitivityValue.textContent = value;
            console.log(`Microphone sensitivity updated to ${value} (higher = less sensitive)`);
        });
    }

    // Animation speed slider handler
    const animationSpeedSlider = document.getElementById('animation-speed');
    const animationSpeedValue = document.getElementById('animation-speed-value');

    if (animationSpeedSlider && animationSpeedValue) {
        animationSpeedSlider.addEventListener('input', (e) => {
            const value = parseInt(e.target.value);
            audioSync.maxAnimationSpeed = value;
            animationSpeedValue.textContent = value + 'x';
            console.log(`Animation speed updated to ${value}x max speed`);
        });
    }

    console.log('✅ All UI controls set up');

    // Pre-initialize microphone on page load to prevent startup spike
    // This "warms up" the microphone before user starts session
    console.log('🎤 Pre-initializing microphone to prevent startup spike...');
    try {
        await audioSync.initializeMicrophone();
        console.log('✅ Microphone pre-initialized successfully');
    } catch (error) {
        console.warn('⚠️ Could not pre-initialize microphone (will request on Start):', error.message);
    }

    // Azure API Key management
    const azureKeyInput = document.getElementById('azure-key-input');
    const azureRegionInput = document.getElementById('azure-region-input');
    const saveKeyBtn = document.getElementById('save-key-btn');
    const clearKeyBtn = document.getElementById('clear-key-btn');
    const keyStatus = document.getElementById('key-status');

    // Load saved key on startup
    const savedKey = localStorage.getItem('azureSpeechKey');
    const savedRegion = localStorage.getItem('azureSpeechRegion');
    if (savedKey && savedRegion) {
        azureKeyInput.value = savedKey;
        azureRegionInput.value = savedRegion;
        keyStatus.style.display = 'block';
        keyStatus.style.background = '#d4edda';
        keyStatus.style.color = '#155724';
        keyStatus.textContent = '✅ API key loaded from browser storage';
    }

    // Save key button
    saveKeyBtn.addEventListener('click', () => {
        const key = azureKeyInput.value.trim();
        const region = azureRegionInput.value;

        if (!key) {
            keyStatus.style.display = 'block';
            keyStatus.style.background = '#f8d7da';
            keyStatus.style.color = '#721c24';
            keyStatus.textContent = '❌ Please enter an API key';
            return;
        }

        // Save to localStorage
        localStorage.setItem('azureSpeechKey', key);
        localStorage.setItem('azureSpeechRegion', region);

        // Update app instance
        app.speechToken = key;
        app.speechRegion = region;

        keyStatus.style.display = 'block';
        keyStatus.style.background = '#d4edda';
        keyStatus.style.color = '#155724';
        keyStatus.textContent = `✅ API key saved! Region: ${region}. Refresh the page to use it.`;

        console.log(`🔑 Azure Speech key saved for region: ${region}`);
    });

    // Clear key button
    clearKeyBtn.addEventListener('click', () => {
        localStorage.removeItem('azureSpeechKey');
        localStorage.removeItem('azureSpeechRegion');
        azureKeyInput.value = '';
        azureRegionInput.value = 'eastus';

        keyStatus.style.display = 'block';
        keyStatus.style.background = '#fff3cd';
        keyStatus.style.color = '#856404';
        keyStatus.textContent = '⚠️ API key cleared. Enter a new key to use the app.';

        console.log('🔑 Azure Speech key cleared from localStorage');
    });

    // Load and display idle image on startup
    const idleImg = new Image();
    idleImg.onload = () => {
        audioSync.spriteSheets.idle = idleImg;
        app.showIdleImage();
        console.log('✅ Idle image loaded and displayed');
    };
    idleImg.src = 'images/idle.png';
});
