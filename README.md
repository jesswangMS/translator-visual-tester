# English-Chinese Voice Translator

A voice-activated two-way translator with animated avatar that syncs to audio input and output.

## Quick Start

1. Add your images to the `images/` folder (see structure below)
2. **Windows:** Double-click `serve.bat`
3. **Mac/Linux:** Run `./serve.sh` in Terminal
4. Open `http://localhost:8000` in Chrome or Edge
5. Click "Start Session" and allow microphone (only needed once!)

## Setup Instructions

### 1. Add Your Images

Place your PNG files in the following structure:

```
images/
├── idle.png                    # Single image for idle state
├── listening/
│   ├── frame_00.png           # 21 frames total (00-20)
│   ├── frame_01.png
│   ├── frame_02.png
│   ├── ...
│   └── frame_20.png
├── thinking/
│   ├── frame_000.png          # 60 frames total (000-059)
│   ├── frame_001.png
│   ├── frame_002.png
│   ├── ...
│   └── frame_059.png
└── talking/
    ├── frame_000.png          # 180 frames total (000-179)
    ├── frame_001.png
    ├── frame_002.png
    ├── ...
    └── frame_179.png
```

**Important naming conventions:**
- Listening frames MUST be named `frame_00.png` through `frame_20.png` (two digits with leading zero)
- Thinking frames MUST be named `frame_000.png` through `frame_059.png` (three digits with leading zeros)
- Talking frames MUST be named `frame_000.png` through `frame_179.png` (three digits with leading zeros)

### 2. Open the Translator

**IMPORTANT:** To save microphone permissions between sessions, you MUST serve the page over HTTP (not open the file directly).

#### Easy Method (Recommended):

**Windows:**
1. Double-click `serve.bat`
2. Open your browser and go to `http://localhost:8000`
3. Grant microphone permission once - it will be remembered!

**Mac/Linux:**
1. Open Terminal in this folder
2. Run `./serve.sh` (or `bash serve.sh`)
3. Open your browser and go to `http://localhost:8000`
4. Grant microphone permission once - it will be remembered!

#### Alternative Methods:

**If you have Node.js:**
```bash
npx http-server -p 8000
```

**If you have Python:**
```bash
python -m http.server 8000
```

Then open `http://localhost:8000` in your browser.

#### Why not open index.html directly?
Browsers don't save permissions for local files (`file://` protocol) for security reasons. Serving over HTTP allows the browser to remember your microphone permission.

### 3. Using the Translator

1. **Optional - Add API Keys**:

   **Translation API (for better translation quality):**
   - **Google Gemini API (Recommended - Works in Browser):**
     - Get free key at https://aistudio.google.com/app/apikey
     - Key format: `AIza...`
     - Free tier: 1,500 requests/day
   - **Claude API:** Requires backend server (CORS restrictions)
     - Get one at https://console.anthropic.com/settings/keys
     - Key format: `sk-ant-api03-...`
   - Leave empty to use free MyMemory translation API

   **Text-to-Speech API (for real-time audio analysis & better lip-sync):**
   - **Azure Speech Services (Recommended):**
     - Get free key at https://portal.azure.com/ (create Speech resource)
     - Key format: 32-character hexadecimal string
     - Free tier: 500K characters/month
     - Provides real audio stream for perfect animation sync
     - Excellent English and Chinese neural voices
   - Leave empty to use browser's built-in speech synthesis

   **Note:** Gemini and Azure APIs work directly from the browser. Claude API requires a backend server due to CORS (Cross-Origin Resource Sharing) security policies.

2. **Start Translating**:
   - Click "Start Session"
   - Allow microphone access when prompted
   - Speak clearly in either English or Chinese
   - The translator will **automatically detect** your language and translate to the other
   - The avatar will:
     - Listen with mouth movements synced to your voice
     - Think (animated PNG sequence)
     - Speak the translation with synced animation
     - Return to listening mode automatically
   - Continue speaking for more translations
   - Click "Stop Session" to end

3. **Optional - Manual Language Mode**:
   - Click the language button to toggle between modes:
     - **AUTO** (automatic language detection - default)
       - Best for mixed conversations
       - Speech recognition set to Chinese (can recognize both languages)
       - Automatically detects and translates to the opposite language
     - **EN → ZH** (English to Chinese only)
       - Forces English input, translates to Chinese
     - **ZH → EN** (Chinese to English only)
       - Forces Chinese input, translates to English

## How It Works

### States

1. **Idle**: Shows static idle.png (only before starting session or after stopping)
2. **Listening**: Cycles through 21 frames (0-20) based on your voice volume
3. **Thinking**: Animates through 60 PNG frames at ~30fps while translating
4. **Talking**: Animates through 180 PNG frames with playback speed synced to speech audio
5. **Continuous Mode**: After talking, returns to listening automatically until you stop the session

### Technologies Used

- **Web Speech API**: For speech recognition and browser text-to-speech fallback
- **Web Audio API**: For analyzing audio volume to sync animations in real-time
- **Google Gemini API**: AI-powered translation (browser-compatible, optional)
- **Azure Speech Services**: High-quality neural TTS with real audio stream analysis (optional)
- **MyMemory API**: Free fallback translation service
- **Claude API**: Available with backend server only (CORS restrictions)

## Browser Compatibility

- **Best**: Chrome, Edge (full support)
- **Limited**: Firefox (no speech recognition yet)
- **Partial**: Safari (limited Web Speech API support)

## Troubleshooting

### Microphone not working
- Allow microphone permissions in your browser
- Check browser settings for microphone access

### Translation not working
- Check your internet connection
- If using Claude API, verify your API key is correct
- Free API has rate limits - wait a moment between translations

### Images not showing
- Verify image files are in the correct folders
- Check file names match exactly (case-sensitive)
- Frame naming requirements:
  - Listening: frame_00.png to frame_20.png (2 digits)
  - Thinking: frame_000.png to frame_059.png (3 digits)
  - Talking: frame_000.png to frame_179.png (3 digits)

### Speech recognition not working
- Use Chrome or Edge browser
- Speak clearly and at normal volume
- Check language setting matches what you're speaking

## File Structure

```
translator/
├── index.html          # Main page
├── styles.css          # Styling and animations
├── app.js             # Main application logic
├── translator.js      # Translation API integration
├── audioSync.js       # Audio-synced animation logic
├── README.md          # This file
└── images/
    └── (your PNG/GIF files)
```

## Privacy

- All processing happens in your browser
- Audio is not recorded or stored
- Translation text is only sent to the chosen translation API
- No data is collected or saved

## Credits

Built with Claude Code
