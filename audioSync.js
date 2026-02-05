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
        this.volumeThreshold = 20; // Threshold to detect speech (lower = more sensitive, higher = less sensitive)
        this.loopCount = 0; // Track animation loops
        this.smoothedVolume = 0; // Smoothed volume for listening animation
        this.volumeSmoothingFactor = 0.8; // Higher = faster response to volume changes (0-1, higher is faster)
        this.allFramesPreloaded = false; // Track if all animation frames are preloaded
        this.spriteSheets = {
            listening: null,
            thinking: null,
            timer: null,
            talking: null,
            idle: null
        }; // Sprite sheet images
        this.spriteMetadata = null; // Metadata for sprite sheets
        this.canvas = null;
        this.ctx = null;
        this.avatarScale = 0.4; // Avatar scale (0.2 to 1.0), default 40%
    }

    // Initialize canvas context
    initCanvas(canvasElement) {
        this.canvas = canvasElement;
        this.ctx = this.canvas.getContext('2d', { alpha: true });
        console.log('🎨 Canvas initialized for rendering');
    }

    // Draw an image to the canvas
    drawToCanvas(image) {
        if (!this.ctx || !this.canvas) {
            console.error('Canvas not initialized');
            return;
        }

        // Use configurable avatar scale
        const scale = this.avatarScale;
        const destWidth = this.canvas.width * scale;
        const destHeight = this.canvas.height * scale;
        const x = (this.canvas.width - destWidth) / 2;
        const y = (this.canvas.height - destHeight) / 2;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(image, x, y, destWidth, destHeight);
    }

    // Draw a specific frame from a sprite sheet
    drawSpriteFrame(spriteSheet, frameIndex, metadata) {
        if (!this.ctx || !this.canvas) {
            console.error('Canvas not initialized');
            return;
        }

        const { frameWidth, frameHeight, framesPerRow } = metadata;

        // Calculate position in sprite sheet
        const col = frameIndex % framesPerRow;
        const row = Math.floor(frameIndex / framesPerRow);
        const sx = col * frameWidth;
        const sy = row * frameHeight;

        // Use configurable avatar scale
        const scale = this.avatarScale;
        const destWidth = this.canvas.width * scale;
        const destHeight = this.canvas.height * scale;
        const x = (this.canvas.width - destWidth) / 2;
        const y = (this.canvas.height - destHeight) / 2;

        // Clear and draw the frame centered and scaled
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.ctx.drawImage(
            spriteSheet,
            sx, sy, frameWidth, frameHeight,  // Source rectangle
            x, y, destWidth, destHeight  // Destination rectangle (centered and scaled)
        );
    }

    // Preload essential sprite sheets at session start (idle, listening, thinking, timer)
    async preloadEssentialFrames() {
        if (this.allFramesPreloaded) {
            console.log('✅ Essential sprite sheets already preloaded');
            return;
        }

        console.log('📦 Preloading sprite sheets (fast loading!)...');

        // Load metadata first
        try {
            const metadataResponse = await fetch('images/sprites/metadata.json');
            this.spriteMetadata = await metadataResponse.json();
            console.log('   ✅ Metadata loaded');
        } catch (error) {
            console.error('   ❌ Failed to load sprite metadata:', error);
            throw error;
        }

        // Preload idle.png
        console.log('📥 Preloading idle.png...');
        const idleImg = new Image();
        await new Promise((resolve, reject) => {
            idleImg.onload = () => {
                console.log('   ✅ idle.png loaded');
                this.spriteSheets.idle = idleImg;
                resolve();
            };
            idleImg.onerror = () => {
                console.error('   ❌ Failed to load idle.png');
                reject(new Error('Failed to load idle.png'));
            };
            idleImg.src = 'images/idle.png';
        });

        // Preload sprite sheets for listening, thinking, and timer (NOT talking - done during THINKING)
        const spritesToLoad = ['listening', 'thinking', 'timer'];

        for (const name of spritesToLoad) {
            console.log(`📥 Preloading ${name} sprite sheet...`);
            const img = new Image();

            await new Promise((resolve, reject) => {
                img.onload = () => {
                    const metadata = this.spriteMetadata[name];
                    const sizeMB = (img.width * img.height * 4 / (1024 * 1024)).toFixed(1);
                    console.log(`   ✅ ${name} sprite loaded (${metadata.totalFrames} frames in 1 image)`);
                    this.spriteSheets[name] = img;
                    resolve();
                };
                img.onerror = () => {
                    console.error(`   ❌ Failed to load ${name} sprite sheet`);
                    reject(new Error(`Failed to load ${name} sprite sheet`));
                };
                img.src = `images/sprites/${name}_sprite.png`;
            });
        }

        this.allFramesPreloaded = true;
        console.log('✅ Essential sprite sheets preloaded successfully!');
        console.log('   Using sprite sheets = Much faster loading over network!');
    }

    // Preload talking sprite sheet during THINKING state
    async preloadTalkingFrames() {
        if (this.spriteSheets.talking) {
            console.log('✅ Talking sprite already preloaded');
            return;
        }

        console.log('📦 Preloading talking sprite sheet...');

        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = () => {
                const metadata = this.spriteMetadata.talking;
                console.log(`✅ Talking sprite loaded (${metadata.totalFrames} frames in 1 image)`);
                this.spriteSheets.talking = img;
                resolve();
            };
            img.onerror = () => {
                console.error('❌ Failed to load talking sprite sheet');
                reject(new Error('Failed to load talking sprite sheet'));
            };
            img.src = 'images/sprites/talking_sprite.png';
        });
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
            this.analyser.smoothingTimeConstant = 0.2; // Low smoothing for fast response (0-1, lower is faster)

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

            // Draw frame from sprite sheet
            if (this.spriteSheets.listening && this.spriteMetadata) {
                this.drawSpriteFrame(this.spriteSheets.listening, frameIndex, this.spriteMetadata.listening);
            }

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

            // Draw frame from sprite sheet
            if (this.spriteSheets.thinking && this.spriteMetadata) {
                this.drawSpriteFrame(this.spriteSheets.thinking, this.thinkingFrame, this.spriteMetadata.thinking);
            }

            // Format frame number with 3 digits (000-059)
            const paddedFrame = this.thinkingFrame.toString().padStart(3, '0');

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

        console.log('   Using sprite sheet: images/sprites/thinking_sprite.png');
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
    playTimerAnimation(avatarElement, duration, onComplete) {
        const totalFrames = 75;
        const frameDelay = duration / totalFrames; // Dynamic frame delay based on duration
        const fps = (1000 / frameDelay).toFixed(1); // Calculate effective FPS

        console.log(`⏱️ Starting timer animation (${totalFrames} frames over ${duration}ms, ${fps} fps)`);
        console.log(`   Frame delay: ${frameDelay.toFixed(1)}ms per frame`);
        console.log(`   Using sprite sheet: images/sprites/timer_sprite.png`);

        let currentFrame = 0;

        const playFrame = () => {
            if (currentFrame < totalFrames) {
                // Draw frame from sprite sheet
                if (this.spriteSheets.timer && this.spriteMetadata) {
                    this.drawSpriteFrame(this.spriteSheets.timer, currentFrame, this.spriteMetadata.timer);
                }

                const paddedIndex = currentFrame.toString().padStart(3, '0');

                // Log first frame to verify
                if (currentFrame === 0) {
                    console.log(`   First frame rendered from sprite sheet`);
                }

                currentFrame++;

                // Log progress every 15 frames
                if (currentFrame % 15 === 0) {
                    const msRemaining = (totalFrames - currentFrame) * frameDelay;
                    const secondsRemaining = (msRemaining / 1000).toFixed(1);
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

    // Talking animation - 60 frames PNG sequence with DYNAMIC speed (1x-10x based on audio)
    async startTalkingAnimation(avatarElement, getRateMultiplier = null) {
        if (this.isTalking) {
            console.warn('⚠️ Talking animation already running!');
            return;
        }

        const useDynamicSpeed = getRateMultiplier !== null;
        console.log(`🗣️ Starting talking animation (${useDynamicSpeed ? 'DYNAMIC 1x-10x speed' : 'constant 15fps'})`);
        console.log('   Using canvas rendering for instant frame updates');

        this.isTalking = true;
        this.talkingFrame = 0;
        this.loopCount = 0; // Reset loop count

        await this.ensureAudioContext();

        // Base settings
        const baseFps = 15;
        const totalFrames = 60;
        const baseFrameDelay = Math.round(1000 / baseFps); // ~67ms per frame
        let logCounter = 0;

        const animateTalking = () => {
            if (!this.isTalking) {
                const totalLoops = Math.floor(logCounter / totalFrames);
                console.log(`🗣️ Talking session ended`);
                console.log(`   📊 Total frames played: ${logCounter}`);
                console.log(`   🔄 Animation looped: ${totalLoops} times`);
                return;
            }

            // Draw frame from sprite sheet for instant rendering
            if (this.spriteSheets.talking && this.spriteMetadata) {
                this.drawSpriteFrame(this.spriteSheets.talking, this.talkingFrame, this.spriteMetadata.talking);
            }

            // Format frame number with 3 digits (000-059)
            const paddedFrame = this.talkingFrame.toString().padStart(3, '0');

            // Move to next frame and loop
            const previousFrame = this.talkingFrame;
            this.talkingFrame = (this.talkingFrame + 1) % totalFrames;

            // Log when animation loops back to start
            if (previousFrame === (totalFrames - 1) && this.talkingFrame === 0) {
                this.loopCount++;
                console.log(`🔄 Animation looped back to frame 0 (Loop #${this.loopCount})`);
            }

            // Get dynamic speed multiplier from audio volume (1x-10x)
            let rateMultiplier = 1.0;
            let currentFps = baseFps;
            let frameDelay = baseFrameDelay;

            if (useDynamicSpeed && getRateMultiplier) {
                rateMultiplier = getRateMultiplier(); // Get current volume-based speed
                currentFps = baseFps * rateMultiplier; // Adjust FPS based on volume
                frameDelay = baseFrameDelay / rateMultiplier; // Faster = shorter delay
            }

            // Update debug panel with current fps and loop count
            const frameDisplay = `frame_${paddedFrame}`;
            const volume = this.getVolume(); // Get volume for debug display
            this.updateDebugPanel(volume, frameDisplay, currentFps, 'Talking', this.loopCount);

            // Log every 15 frames with current speed
            logCounter++;
            if (logCounter % 15 === 0) {
                if (useDynamicSpeed) {
                    console.log(`🗣️ Talking - ${currentFps.toFixed(1)} fps (${rateMultiplier.toFixed(1)}x), Frame: ${paddedFrame}, Loop #${Math.floor(logCounter / totalFrames)}`);
                } else {
                    console.log(`🗣️ Talking - Constant 15 fps, Frame: ${paddedFrame}, Loop #${Math.floor(logCounter / totalFrames)}`);
                }
            }

            // Continue animation with dynamic or constant delay
            this.animationFrameId = setTimeout(() => animateTalking(), frameDelay);
        };

        console.log('   Using sprite sheet: images/sprites/talking_sprite.png');
        if (useDynamicSpeed) {
            console.log('   Speed adjusts 1x-10x based on audio volume (DRAMATIC range)');
        } else {
            console.log('   Playing at constant 15 fps (67ms per frame)');
        }

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
