# Timing Settings Documentation

This document explains the timing parameters used in the translator app and how they affect user experience.

---

## Speech Detection & Recognition

### `volumeThreshold` (audioSync.js, line 20)
**Current Value**: `20`
**Range**: 0-255
**Location**: `audioSync.js`

**Description**:
Controls how sensitive the microphone is to sound. The app monitors audio volume levels and only responds when volume exceeds this threshold.

**What it does**:
- **Lower value (5-15)**: More sensitive, detects quieter speech and background noise
- **Current value (20)**: Balanced sensitivity, filters out most background noise
- **Higher value (25-35)**: Less sensitive, requires louder/clearer speech

**Why it matters**:
Too low → false triggers from ambient noise (fans, typing, etc.)
Too high → app won't detect when you speak
Current value (20) is optimized to ignore background noise while reliably detecting normal speech.

**Recommendation**: Keep at 20. Adjust ±5 based on your microphone and environment.

---

### `noAudioTimeout` (app.js, line 29)
**Current Value**: `5000` ms (5 seconds)
**Range**: 2000-10000 ms
**Location**: `app.js`, line 29

**Description**:
How long the app waits in LISTENING state with no speech detected before automatically returning to IDLE state.

**What it does**:
- When you start a session, the app enters LISTENING state (green listening animation)
- If no speech is detected for this duration, it returns to IDLE to save resources
- Timer resets every time speech is detected

**Why it matters**:
Too short (< 3s) → App returns to IDLE too quickly, feels impatient
Too long (> 7s) → Wastes resources if user walked away
Current value (5s) provides good balance between responsiveness and patience.

**User Experience**:
- User starts session → LISTENING
- No speech for 5 seconds → Returns to IDLE
- If user speaks within 5 seconds → Timer resets, stays in LISTENING

**Recommendation**: Keep at 5000ms. Reduce to 3000ms for faster timeout if preferred.

---

## Translation Flow Timing

### `cooldownDuration` (app.js, line 25)
**Current Value**: `2500` ms (2.5 seconds)
**Type**: Fixed (cannot be reduced without affecting timer animation)
**Location**: `app.js`, line 25

**Description**:
The waiting period after you finish speaking before translation begins. This allows you to continue speaking or correct yourself.

**What it does**:
1. You stop speaking → App enters WAITING state
2. Timer starts counting down from 2.5 seconds
3. If you speak again during this time → Timer resets (you can continue)
4. If timer completes → Translation starts

**Why it's fixed at 2.5 seconds**:
- Timer animation is synchronized: 75 frames at 30 FPS = exactly 2.5 seconds
- Reducing this would require redesigning the timer animation frames
- This duration is industry-standard for voice assistants (Siri, Alexa use similar)

**User Experience Flow**:
```
You speak: "Hello, how are you"
         ↓
[2.5s timer] ← Can add "doing today?" here
         ↓
Timer completes → Translation begins
```

**Benefits of 2.5 second wait**:
- ✅ Allows multi-sentence speech without interruption
- ✅ Lets you correct mistakes mid-sentence
- ✅ Prevents translating incomplete thoughts
- ✅ Natural conversation pacing

**Cannot be changed without**:
- Recreating timer animation sprite sheet with different frame count
- Adjusting frame rate (would affect smoothness)

---

## State Transition Timing

### `interruptWaitingState` setTimeout (app.js, line 704)
**Current Value**: `100` ms
**Range**: 0-200 ms
**Location**: `app.js`, line 704

**Description**:
Brief pause when interrupting the timer to return to LISTENING state. Creates smooth visual transition.

**What it does**:
- When you interrupt the waiting timer by speaking again
- Shows idle image for 100ms before returning to listening animation
- Prevents jarring instant animation switches

**Why it matters**:
0ms → Instant jump, can feel glitchy
100ms → Smooth, natural transition
>200ms → Feels laggy

**Recommendation**: Keep at 100ms for best UX.

---

### `speakWithBrowser` setTimeout (app.js, line 1106)
**Current Value**: `100` ms
**Range**: 50-200 ms
**Location**: `app.js`, line 1106

**Description**:
Delay before starting browser speech synthesis. Ensures previous synthesis is fully cancelled.

**What it does**:
- Calls `synthesis.cancel()` to stop any ongoing speech
- Waits 100ms for cancellation to complete
- Then starts new speech utterance

**Why it matters**:
Too short → Previous speech might not fully cancel, causing overlap
Too long → Unnecessary delay before speaking
100ms is safe buffer for all browsers

**Recommendation**: Keep at 100ms unless experiencing speech overlap issues.

---

## API & Network Timing

### Translation API Call (server.js, line 51)
**Typical Duration**: 200-500 ms
**Type**: Network dependent (cannot be controlled)

**Description**:
Time to call MyMemory translation API and receive response.

**What affects it**:
- Your internet connection speed
- MyMemory API server load
- Geographic distance to API servers
- Text length (longer = slower)

**Optimization**:
Implemented translation caching to return instant results (0ms) for repeated phrases.

---

### Azure Speech TTS API Call (server.js, line 72)
**Typical Duration**: 500-1000 ms
**Type**: Network dependent (cannot be controlled)

**Description**:
Time to synthesize speech audio from text using Azure Speech services.

**What affects it**:
- Your internet connection speed
- Azure server load
- Text length (longer = slower)
- Voice complexity (neural voices slower than standard)

**Optimization**:
Can implement audio caching to return instant results (0ms) for repeated translations.

---

## Complete Flow Timing Breakdown

### Typical user interaction timeline:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. User speaks: "Hello"                                      │
│    Duration: Variable (0.5-3 seconds)                        │
│    State: LISTENING                                          │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 2. Speech recognition finalizes                              │
│    Duration: ~100-300 ms                                     │
│    State: LISTENING → WAITING                                │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 3. Cooldown timer (allows user to continue speaking)        │
│    Duration: 2500 ms (2.5 seconds) ← FIXED                  │
│    State: WAITING                                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 4. Speech validation                                         │
│    Duration: ~5-10 ms                                        │
│    State: WAITING → THINKING                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 5. Translation API call                                      │
│    Duration: 200-500 ms (0 ms if cached)                    │
│    State: THINKING                                           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 6. Translation validation                                    │
│    Duration: ~5-10 ms                                        │
│    State: THINKING                                           │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 7. Azure TTS synthesis                                       │
│    Duration: 500-1000 ms (0 ms if cached)                   │
│    State: THINKING → TALKING                                 │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 8. Avatar speaks translation                                 │
│    Duration: Variable (depends on translation length)       │
│    State: TALKING                                            │
└─────────────────────────────────────────────────────────────┘
                           ↓
┌─────────────────────────────────────────────────────────────┐
│ 9. Return to IDLE                                            │
│    Duration: ~50 ms                                          │
│    State: TALKING → IDLE                                     │
└─────────────────────────────────────────────────────────────┘

TOTAL TIME (Speech end → Translation spoken):
- First time: ~3.3-4.2 seconds
- Cached: ~2.6-2.7 seconds (if translation + audio cached)
```

---

## Optimization Summary

### ✅ Already Optimized:
- Volume threshold tuned to filter noise (20)
- State transitions minimized (100ms)
- No-audio timeout reasonable (5s)

### ⚠️ Cannot Optimize (Fixed):
- **Cooldown timer (2.5s)** - Fixed by animation design
- Network latency - Depends on internet speed
- Speech recognition processing - Browser limitation

### 🚀 Can Be Optimized:
- Add translation caching (instant repeated phrases)
- Add TTS audio caching (instant repeated audio)
- Reduce no-audio timeout to 3s (if desired)

---

## For Developers: Adjusting Timings

### To change cooldown duration (requires animation redesign):
1. Modify `cooldownDuration` in app.js (line 25)
2. Recreate timer sprite sheet:
   - New frame count = (new duration in seconds) × 30 fps
   - Example: 1.5s = 45 frames, 2.0s = 60 frames
3. Update `totalFrames` in timer animation logic

### To change no-audio timeout:
```javascript
// app.js, line 29
this.noAudioTimeout = 3000; // Change from 5000 to 3000ms
```

### To change volume threshold:
```javascript
// audioSync.js, line 20
this.volumeThreshold = 15; // Change from 20 (more sensitive)
// OR
this.volumeThreshold = 25; // Change from 20 (less sensitive)
```

---

## Recommended Settings by Use Case

### **Quiet Office Environment**
```javascript
volumeThreshold = 15        // More sensitive
noAudioTimeout = 3000       // Faster timeout
cooldownDuration = 2500     // Keep standard
```

### **Noisy Environment**
```javascript
volumeThreshold = 25        // Less sensitive
noAudioTimeout = 5000       // Longer patience
cooldownDuration = 2500     // Keep standard
```

### **Demo/Presentation Mode**
```javascript
volumeThreshold = 20        // Balanced
noAudioTimeout = 10000      // Very patient
cooldownDuration = 2500     // Keep standard
```

### **Fast-Paced Conversation**
```javascript
volumeThreshold = 20        // Balanced
noAudioTimeout = 3000       // Quick timeout
cooldownDuration = 2500     // Keep standard (cannot reduce)
```

---

## User-Facing Explanations

If you need to explain these to end users:

### "Why does the translator wait 2.5 seconds?"
"The translator waits 2.5 seconds after you stop speaking to make sure you're finished. This allows you to pause between sentences or correct yourself without the app interrupting you. It's similar to how Siri or Alexa work!"

### "Can I make it faster?"
"The 2.5-second wait time is designed to match the visual timer animation and provides the best user experience for natural conversation. While we can't reduce this particular delay, we've optimized everything else to make the overall experience as fast as possible!"

### "Why does it sometimes not respond to me?"
"The app filters out background noise to avoid false triggers. If it's not detecting your voice, try speaking a bit louder or check your microphone settings. You can also adjust the sensitivity in the settings."

---

## Questions?

For technical questions about timing implementation:
- Check code comments in `app.js` and `audioSync.js`
- Review state machine flow diagram (if available)
- Test timing changes in development environment before deployment
