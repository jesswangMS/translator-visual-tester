// Audio synchronization module for listening and talking animations

class AudioSync {
    constructor() {
        this.audioContext = null;
        this.analyser = null;
        this.microphone = null;
        this.microphoneStream = null;
        this.dataArray = null;
        this.animationFrameId = null;
        this.volumeMonitorFrameId = null;
        this.isListening = false;
        this.isMonitoringVolume = false;
        this.isThinking = false;
        this.isTalking = false;
        this.thinkingFrame = 0;
        this.talkingFrame = 0;
        this.isMicrophoneInitialized = false;
        this.volumeCallback = null; // Callback for volume detection
        this.volumeThreshold = 15; // Threshold to detect speech (lowered for faster response)
        this.loopCount = 0; // Track animation loops
        this.smoothedVolume = 0; // Smoothed volume for listening animation
        this.volumeSmoothingFactor = 0.5; // Higher = faster response to volume changes (0.1-0.5 range)
        this.talkingFramesPreloaded = false; // Track if talking frames are preloaded
        this.talkingImages = []; // Preloaded talking frame images
    }

    // Preload talking animation frames to prevent loading issues
    async preloadTalkingFrames() {
        if (this.talkingFramesPreloaded) {
            console.log('✅ Talking frames already preloaded');
            return;
        }

        console.log('📦 Preloading 60 talking frames...');
        const totalFrames = 60;
        const promises = [];

        for (let i = 0; i < totalFrames; i++) {
            const paddedIndex = i.toString().padStart(3, '0');
            const img = new Image();
            const promise = new Promise((resolve, reject) => {
                img.onload = () => {
                    if (i % 10 === 0) {
                        console.log(`   Loaded frame ${i}/${totalFrames}`);
                    }
                    resolve();
                };
                img.onerror = () => {
                    console.error(`   Failed to load frame_${paddedIndex}.png`);
                    reject(new Error(`Failed to load frame_${paddedIndex}.png`));
                };
            });
            img.src = `images/talking/frame_${paddedIndex}.png`;
            this.talkingImages[i] = img;
            promises.push(promise);
        }

        try {
            await Promise.all(promises);
            this.talkingFramesPreloaded = true;
            console.log('✅ All 60 talking frames preloaded successfully');
        } catch (error) {
            console.error('❌ Failed to preload talking frames:', error);
            throw error;
        }
    }

    async initializeMicrophone() {
        // If already initialized, don't request again
        if (this.isMicrophoneInitialized) {
            console.log('Microphone already initialized, reusing existing stream');
            return true;
        }

        try {
            console.log('Requesting microphone access...');
            // Request microphone access
            this.microphoneStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: false,
                    noiseSuppression: false,
                    autoGainControl: false
                }
            });

            // Create audio context and analyser
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            this.analyser = this.audioContext.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.4; // Balanced: responsive but still smooth (0.4)

            // Connect microphone to analyser
            this.microphone = this.audioContext.createMediaStreamSource(this.microphoneStream);
            this.microphone.connect(this.analyser);

            // Create data array for frequency data
            const bufferLength = this.analyser.frequencyBinCount;
            this.dataArray = new Uint8Array(bufferLength);

            this.isMicrophoneInitialized = true;
            console.log('✅ Microphone initialized successfully and will stay active for this session');
            return true;
        } catch (error) {
            console.error('Error initializing microphone:', error);
            throw new Error('Could not access microphone. Please allow microphone permissions.');
        }
    }

    getVolume() {
        if (!this.analyser || !this.dataArray) {
            console.warn('AudioSync: Analyser or dataArray not initialized');
            return 0;
        }

        this.analyser.getByteFrequencyData(this.dataArray);

        // Calculate average volume
        const sum = this.dataArray.reduce((a, b) => a + b, 0);
        const average = sum / this.dataArray.length;

        // Also get the peak volume for better sensitivity
        const max = Math.max(...this.dataArray);

        // Use a combination of average and peak
        // This gives better response to speech
        const volume = (average * 0.5) + (max * 0.5);

        return volume;
    }

    startListeningAnimation(avatarElement) {
        if (this.isListening) return;
        this.isListening = true;
        this.smoothedVolume = 0; // Reset smoothed volume
        let frameCount = 0;

        const updateFrame = () => {
            if (!this.isListening) return;

            const rawVolume = this.getVolume();

            // Apply exponential smoothing to reduce flicker
            // smoothedVolume = smoothedVolume * (1 - factor) + rawVolume * factor
            this.smoothedVolume = this.smoothedVolume * (1 - this.volumeSmoothingFactor) + rawVolume * this.volumeSmoothingFactor;

            // Check if volume exceeds threshold and notify via callback (use raw volume for detection)
            if (this.volumeCallback && rawVolume > this.volumeThreshold) {
                this.volumeCallback(rawVolume);
            }

            // Map smoothed volume (0-150) to frame index (0-20)
            // Clamp volume to max 150
            const clampedVolume = Math.min(150, this.smoothedVolume);
            const frameIndex = Math.floor((clampedVolume / 150) * 20);
            const paddedIndex = frameIndex.toString().padStart(2, '0');

            // Update avatar image
            const newSrc = `images/listening/frame_${paddedIndex}.png`;
            avatarElement.src = newSrc;

            // Update debug panel (show smoothed volume)
            const frameDisplay = `frame_${paddedIndex}`;
            this.updateDebugPanel(this.smoothedVolume, frameDisplay, null, 'Listening');

            // Log every 30 frames (roughly once per second at 60fps)
            frameCount++;
            if (frameCount % 30 === 0) {
                console.log(`🎤 Listening - Raw: ${rawVolume.toFixed(1)}, Smoothed: ${this.smoothedVolume.toFixed(1)}, Frame: ${paddedIndex}`);

                // Debug: Show data array sample
                if (this.dataArray) {
                    const sample = Array.from(this.dataArray.slice(0, 10));
                    console.log(`   Data sample: [${sample.join(', ')}]`);
                }
            }

            this.animationFrameId = requestAnimationFrame(updateFrame);
        };

        updateFrame();
    }

    stopListeningAnimation() {
        this.isListening = false;
        if (this.animationFrameId) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    // Start volume monitoring without controlling avatar animation
    // Used during WAITING state to detect speech interruptions
    startVolumeMonitoring() {
        if (this.isMonitoringVolume) return;
        this.isMonitoringVolume = true;
        console.log('🔊 Starting volume monitoring (no animation)');

        const monitorVolume = () => {
            if (!this.isMonitoringVolume) return;

            const volume = this.getVolume();

            // Check if volume exceeds threshold and notify via callback
            if (this.volumeCallback) {
                this.volumeCallback(volume);
            }

            // Update debug panel
            this.updateDebugPanel(volume, '-', null, 'Waiting');

            this.volumeMonitorFrameId = requestAnimationFrame(monitorVolume);
        };

        monitorVolume();
    }

    stopVolumeMonitoring() {
        this.isMonitoringVolume = false;
        if (this.volumeMonitorFrameId) {
            cancelAnimationFrame(this.volumeMonitorFrameId);
            this.volumeMonitorFrameId = null;
        }
        console.log('🔇 Volume monitoring stopped');
    }

    // Thinking animation - 60 frames PNG sequence at fixed 30 fps
    startThinkingAnimation(avatarElement) {
        if (this.isThinking) return;

        console.log('🤔 Starting thinking animation at fixed 30 fps');
        this.isThinking = true;
        this.thinkingFrame = 0;

        // Fixed 30 fps
        const fps = 30;
        const frameDelay = Math.round(1000 / fps); // 33ms per frame
        let logCounter = 0;

        const animateThinking = () => {
            if (!this.isThinking) return;

            // Format frame number with 3 digits (000-059)
            const paddedFrame = this.thinkingFrame.toString().padStart(3, '0');
            avatarElement.src = `images/thinking/frame_${paddedFrame}.png`;

            // Update debug panel
            const frameDisplay = `frame_${paddedFrame}`;
            this.updateDebugPanel(0, frameDisplay, null, 'Thinking');

            // Move to next frame and loop
            this.thinkingFrame = (this.thinkingFrame + 1) % 60;

            // Log every 30 frames (once per second at 30 fps)
            logCounter++;
            if (logCounter % 30 === 0) {
                console.log(`🤔 Thinking - Fixed 30 fps, Frame: ${paddedFrame}, Loop #${Math.floor(logCounter / 60)}`);
            }

            // Continue animation at fixed rate
            this.animationFrameId = setTimeout(() => animateThinking(), frameDelay);
        };

        console.log('   Expected images: images/thinking/frame_000.png to frame_059.png');
        console.log('   Playing at fixed 30 fps (33ms per frame)');
        animateThinking();
    }

    stopThinkingAnimation() {
        this.isThinking = false;
        if (this.animationFrameId) {
            clearTimeout(this.animationFrameId);
            this.animationFrameId = null;
        }
    }

    // Timer animation - 75 frames at 30fps (2.5 seconds)
    playTimerAnimation(avatarElement, onComplete) {
        console.log('⏱️ Starting custom timer animation (75 frames, 30fps)');
        console.log(`   📁 Loading frames from: images/timer/frame_000.png to frame_074.png`);

        let currentFrame = 0;
        const totalFrames = 75;
        const fps = 30;
        const frameDelay = 1000 / fps; // ~33ms per frame

        const playFrame = () => {
            if (currentFrame < totalFrames) {
                const paddedIndex = currentFrame.toString().padStart(3, '0');
                const imagePath = `images/timer/frame_${paddedIndex}.png`;
                avatarElement.src = imagePath;

                // Log first frame to verify path
                if (currentFrame === 0) {
                    console.log(`   🖼️ First frame: ${imagePath}`);
                }

                currentFrame++;

                // Log progress every 15 frames (~0.5 seconds)
                if (currentFrame % 15 === 0) {
                    const secondsRemaining = ((totalFrames - currentFrame) / fps).toFixed(1);
                    console.log(`⏱️ Timer: ${secondsRemaining}s remaining (frame ${currentFrame}/${totalFrames})`);
                }

                // Store timeout reference so it can be interrupted
                this.timerAnimationTimeout = setTimeout(playFrame, frameDelay);
            } else {
                console.log('✅ Timer animation complete');
                this.timerAnimationTimeout = null;
                if (onComplete) onComplete();
            }
        };

        // Start the animation
        playFrame();
    }

    stopTimerAnimation() {
        if (this.timerAnimationTimeout) {
            clearTimeout(this.timerAnimationTimeout);
            this.timerAnimationTimeout = null;
            console.log('🛑 Timer animation stopped');
        }
    }

    // Create audio context for TTS if not already created
    async ensureAudioContext() {
        if (!this.audioContext) {
            this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }

        // Resume context if suspended (needed for some browsers)
        if (this.audioContext.state === 'suspended') {
            await this.audioContext.resume();
        }
    }

    // Talking animation - 60 frames PNG sequence with dynamic fps based on speaking rate
    async startTalkingAnimation(avatarElement, getRateMultiplier = null) {
        if (this.isTalking) {
            console.warn('⚠️ Talking animation already running!');
            return;
        }

        console.log('🗣️ Starting talking animation with dynamic rate');
        console.log('   Avatar element:', avatarElement);
        console.log('   Current src before starting:', avatarElement.src);
        console.log('   Rate multiplier function:', getRateMultiplier ? 'Provided' : 'Not provided (will use fixed 60fps)');

        this.isTalking = true;
        this.talkingFrame = 0;
        this.loopCount = 0; // Reset loop count

        await this.ensureAudioContext();

        // Base FPS that will be multiplied by speaking rate
        const baseFps = 60;
        const totalFrames = 60; // Updated from 180 to 60 frames
        let logCounter = 0;
        let lastLoggedRate = 1.0;

        const animateTalking = () => {
            if (!this.isTalking) {
                const totalLoops = Math.floor(logCounter / totalFrames);
                console.log(`🗣️ Talking session ended`);
                console.log(`   📊 Total frames played: ${logCounter}`);
                console.log(`   🔄 Animation looped: ${totalLoops} times`);
                return;
            }

            // Get current rate multiplier (1.0 = normal, 0.5 = half speed, 2.0 = double speed)
            const rateMultiplier = getRateMultiplier ? getRateMultiplier() : 1.0;
            const fps = baseFps * rateMultiplier;
            const frameDelay = Math.round(1000 / fps);

            // Format frame number with 3 digits (000-059)
            const paddedFrame = this.talkingFrame.toString().padStart(3, '0');
            const imagePath = `images/talking/frame_${paddedFrame}.png`;
            avatarElement.src = imagePath;

            // Move to next frame and loop
            const previousFrame = this.talkingFrame;
            this.talkingFrame = (this.talkingFrame + 1) % totalFrames;

            // Log when animation loops back to start
            if (previousFrame === (totalFrames - 1) && this.talkingFrame === 0) {
                this.loopCount++;
                console.log(`🔄 Animation looped back to frame 0 (Loop #${this.loopCount})`);
            }

            // Update debug panel with dynamic fps and loop count
            const frameDisplay = `frame_${paddedFrame}`;
            const volume = this.getVolume(); // Still get volume for debug display
            this.updateDebugPanel(volume, frameDisplay, fps, 'Talking', this.loopCount);

            // Log every 60 frames (once per second at base 60 fps)
            logCounter++;
            if (logCounter % 60 === 0 || Math.abs(rateMultiplier - lastLoggedRate) > 0.1) {
                console.log(`🗣️ Talking - Rate: ${rateMultiplier.toFixed(2)}x, FPS: ${fps.toFixed(1)}, Frame: ${paddedFrame}, Loop #${Math.floor(logCounter / totalFrames)}`);
                if (Math.abs(rateMultiplier - lastLoggedRate) > 0.1) {
                    console.log(`   📈 Rate changed: ${lastLoggedRate.toFixed(2)}x → ${rateMultiplier.toFixed(2)}x`);
                    lastLoggedRate = rateMultiplier;
                }
            }

            // Continue animation at dynamic rate
            this.animationFrameId = setTimeout(() => animateTalking(), frameDelay);
        };

        console.log('   Expected images: images/talking/frame_000.png to frame_059.png');
        console.log('   Playing at dynamic fps based on speaking rate');

        animateTalking();
    }

    stopTalkingAnimation(avatarElement) {
        this.isTalking = false;
        if (this.animationFrameId) {
            clearTimeout(this.animationFrameId);
            this.animationFrameId = null;
        }

        // Hide speed display
        const speedDisplay = document.getElementById('speed-display');
        if (speedDisplay) speedDisplay.style.display = 'none';

        // Don't set idle here - let app.js control the state
    }

    updateDebugPanel(volume, frame, fps = null, animationState = null, loopCount = 0) {
        const debugVolume = document.getElementById('debug-volume');
        const debugFrame = document.getElementById('debug-frame');
        const debugSpeed = document.getElementById('debug-speed');
        const speedDisplay = document.getElementById('speed-display');
        const loopDisplay = document.getElementById('loop-display');
        const debugLoops = document.getElementById('debug-loops');
        const debugAnimationState = document.getElementById('debug-animation-state');
        const volumeBar = document.getElementById('volume-bar');

        if (debugVolume) {
            debugVolume.textContent = volume.toFixed(1);
        }

        if (debugFrame) {
            debugFrame.textContent = String(frame);
            // Debug log first few times
            if (animationState === 'Talking' && Math.random() < 0.1) {
                console.log(`🔍 Debug frame display: "${frame}" (element exists: ${!!debugFrame})`);
            }
        } else {
            console.error('❌ debugFrame element not found!');
        }

        // Update animation state
        if (debugAnimationState) {
            debugAnimationState.textContent = animationState || 'Idle';
        } else if (animationState === 'Talking') {
            console.error('❌ debugAnimationState element not found!');
        }

        // Show fps and loop count during talking
        if (fps !== null) {
            if (speedDisplay) speedDisplay.style.display = 'block';
            if (debugSpeed) debugSpeed.textContent = fps.toFixed(1) + ' fps';

            if (loopDisplay) loopDisplay.style.display = 'block';
            if (debugLoops) debugLoops.textContent = loopCount;
        } else {
            if (speedDisplay) speedDisplay.style.display = 'none';
            if (loopDisplay) loopDisplay.style.display = 'none';
        }

        if (volumeBar) {
            // Show percentage based on 0-200 range
            const percentage = Math.min(100, (volume / 200) * 100);
            volumeBar.style.width = `${percentage}%`;
        }
    }

    setVolumeCallback(callback) {
        this.volumeCallback = callback;
        console.log('🔊 Volume callback registered');
    }

    clearVolumeCallback() {
        this.volumeCallback = null;
        console.log('🔇 Volume callback cleared');
    }

    cleanup() {
        console.log('Cleaning up audio resources...');

        this.stopListeningAnimation();
        this.stopVolumeMonitoring();
        this.stopThinkingAnimation();
        this.stopTalkingAnimation();
        this.stopTimerAnimation();
        this.clearVolumeCallback();

        // Stop and close microphone stream
        if (this.microphoneStream) {
            this.microphoneStream.getTracks().forEach(track => track.stop());
            this.microphoneStream = null;
        }

        if (this.microphone) {
            this.microphone.disconnect();
            this.microphone = null;
        }

        if (this.audioContext) {
            this.audioContext.close();
            this.audioContext = null;
        }

        this.analyser = null;
        this.dataArray = null;
        this.isMicrophoneInitialized = false;

        console.log('✅ Audio cleanup complete');
    }
}

// Create global instance
const audioSync = new AudioSync();
