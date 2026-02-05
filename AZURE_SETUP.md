# Azure Speech Setup Guide

## Overview
Your translator app now uses **Azure Speech Services** for everything:
- ✅ **Speech Recognition** - Recognizes spoken words
- ✅ **Speech Translation** - Translates speech in real-time
- ✅ **Text-to-Speech** - Speaks the translation with natural voices

**Claude API has been removed** - Azure Speech handles all functionality.

---

## Step 1: Get Your Azure Speech API Key

### Create Azure Speech Resource

1. **Go to Azure Portal**: https://portal.azure.com/

2. **Sign in** (or create free account - no credit card required for free tier)

3. **Create Speech Resource**:
   - Click "Create a resource" (top left)
   - Search for "Speech"
   - Click "Create" on "Speech" service

4. **Fill in the form**:
   - **Subscription**: Select your subscription
   - **Resource group**: Create new (e.g., "translator-rg") or use existing
   - **Region**: Select closest region (e.g., `eastus`, `westus2`, `westeurope`)
   - **Name**: Give it a name (e.g., "my-translator-speech")
   - **Pricing tier**: Select **F0 (Free)**
     - Free tier includes: 5 hours audio/month, 500K characters TTS/month

5. **Click**: "Review + Create" → "Create"

6. **Wait** for deployment (1-2 minutes)

### Get Your API Key

1. Go to your new Speech resource

2. Click **"Keys and Endpoint"** in the left menu

3. You'll see:
   - **KEY 1** - Copy this! (32-character string like `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6`)
   - **KEY 2** - Backup key
   - **Location/Region** - Note this! (e.g., `eastus`)

---

## Step 2: Configure Your .env File

1. **Open** the `.env` file in your project root

2. **Replace** the placeholder values:

```env
# Azure Speech API Configuration
AZURE_SPEECH_KEY=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6
AZURE_SPEECH_REGION=eastus
```

Replace:
- `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6` with your actual KEY 1
- `eastus` with your actual region

3. **Save** the file

---

## Step 3: Start the Server

Open terminal in your project directory and run:

```bash
npm start
```

You should see:
```
============================================================
🚀 Azure Speech Translator Server Started
============================================================
📍 Server running on: http://localhost:3000
🔍 Health check: http://localhost:3000/api/health
🎙️ Speech token endpoint: http://localhost:3000/api/speech-token

✅ Azure Speech key configured (Region: eastus)
============================================================
```

---

## Step 4: Open the App

1. Open your browser (Chrome or Edge recommended)

2. Go to: **http://localhost:3000**

3. The app will now use Azure Speech for everything!

---

## How It Works

### Old Architecture (Removed)
❌ Browser Speech Recognition → Claude/Gemini API → Browser/Azure TTS

### New Architecture (Current)
✅ **Azure Speech Recognition** → **Azure Speech Translation** → **Azure Speech TTS**

Everything happens through one service with one API key!

---

## Testing

1. Click **"Start Session"**
2. Allow microphone access
3. Speak in English or Chinese
4. The app will:
   - Recognize your speech (Azure)
   - Detect language automatically (Azure)
   - Translate to the other language (Azure)
   - Speak the translation (Azure)

---

## Free Tier Limits

Azure Speech Free Tier (F0):
- **5 hours** of audio input per month
- **500,000 characters** of text-to-speech per month
- **Unlimited** speech translation (included in audio hours)

This is plenty for personal use and testing!

---

## Troubleshooting

### "Azure Speech key not configured"
- Check your `.env` file has the correct key
- Make sure you saved the `.env` file
- Restart the server (`npm start`)

### "Failed to get speech token"
- Check the server is running (`npm start`)
- Check the server logs for errors
- Verify your key is correct in `.env`

### Microphone not working
- Use Chrome or Edge browser
- Allow microphone permissions when prompted
- Check browser microphone settings

### Poor recognition quality
- Speak clearly and at normal pace
- Reduce background noise
- Try adjusting microphone position

---

## What Changed in the Code

### Files Modified:
1. **`.env`** - Now uses Azure Speech key instead of Claude key
2. **`server.js`** - Simplified to serve static files and provide secure token endpoint
3. **`translator.js`** - Simplified (Azure handles translation now)
4. **`index.html`** - Updated UI to reflect Azure Speech

### Files Added:
1. **`azureSpeech.js`** - New module for Azure Speech Translation
2. **`AZURE_SETUP.md`** - This guide

### Files Removed:
- None (but Claude API code removed from `server.js` and `translator.js`)

---

## Cost Comparison

| Service | Free Tier | Paid Tier |
|---------|-----------|-----------|
| **Azure Speech** (Current) | 5 hrs/month | $1/hour |
| Claude API (Removed) | $0 (limited) | $3-$15/1M tokens |
| Gemini API (Removed) | Free quota | Varies |

**Benefit**: Single service, consistent quality, no multiple API keys to manage!

---

## Additional Resources

- Azure Speech Documentation: https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/
- Azure Speech Pricing: https://azure.microsoft.com/en-us/pricing/details/cognitive-services/speech-services/
- Supported Languages: https://docs.microsoft.com/en-us/azure/cognitive-services/speech-service/language-support

---

## Questions?

If you encounter issues:
1. Check the browser console (F12) for error messages
2. Check the server terminal for logs
3. Verify your API key and region in `.env`
4. Make sure you're using Chrome or Edge browser

Enjoy your Azure-powered translator! 🎉
