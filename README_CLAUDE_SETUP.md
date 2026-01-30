# Claude API Setup Guide

This guide explains how to set up and use the Claude API for translation in your interpreter app.

## Why a Backend Server?

The Claude API cannot be called directly from the browser due to CORS (Cross-Origin Resource Sharing) restrictions. We use a simple Node.js backend server to:
- Proxy requests to the Claude API
- Keep your API key secure (never exposed to the browser)
- Handle authentication properly

## Setup Instructions

### 1. Get Your Claude API Key

1. Go to https://console.anthropic.com/settings/keys
2. Sign up or log in to your Anthropic account
3. Click "Create Key" to generate a new API key
4. Copy your API key (starts with `sk-ant-`)

### 2. Install Dependencies

Open a terminal in this project directory and run:

```bash
npm install
```

This installs:
- `express` - Web server framework
- `cors` - Handles cross-origin requests
- `dotenv` - Loads environment variables

### 3. Configure Your API Key

Create a `.env` file in the project root:

```bash
# Copy the example file
copy .env.example .env
```

Edit `.env` and add your API key:

```
CLAUDE_API_KEY=sk-ant-your-actual-api-key-here
```

**Important:** Never commit the `.env` file to git! It's already in `.gitignore`.

### 4. Start the Server

```bash
npm start
```

You should see:

```
🚀 Translation Server Started
📍 Server running on: http://localhost:3000
✅ Claude API key configured
```

### 5. Open Your App

With the server running, open your app in a browser:

```
http://localhost:3000
```

The app will automatically detect the backend server and use Claude for translations!

## How It Works

1. **Frontend** (translator.js) checks if backend is available
2. **Backend** (server.js) receives translation requests
3. **Backend** calls Claude API with your secure API key
4. **Backend** returns translation to frontend
5. **Frontend** displays the translated text

## API Endpoints

### Translation
```
POST http://localhost:3000/api/translate
Body: { "text": "Hello", "sourceLang": "en-US", "targetLang": "zh-CN" }
Response: { "translation": "你好" }
```

### Health Check
```
GET http://localhost:3000/api/health
Response: { "status": "ok", "apiKeyConfigured": true }
```

## Troubleshooting

### "Backend server not running"
- Make sure you ran `npm start`
- Check that port 3000 is available
- Look for errors in the terminal

### "CLAUDE_API_KEY not set in .env"
- Create a `.env` file in the project root
- Add `CLAUDE_API_KEY=sk-ant-...` with your actual key
- Restart the server

### "Claude API error"
- Check that your API key is valid
- Verify you have API credits in your Anthropic account
- Check the server terminal for detailed error messages

## Fallback Options

If the backend server isn't running, the app automatically falls back to:
1. **Gemini API** - If you provide a Gemini key in the UI
2. **Free API** - MyMemory translation (no key required)

## Deployment Options

For production, you can deploy the backend to:
- **Vercel** - Add a `vercel.json` configuration
- **Netlify Functions** - Convert to serverless function
- **Railway/Render** - Deploy the full Express server
- **Your own server** - Run `npm start` on any Node.js host

Would you like help deploying to a specific platform?

## Security Notes

- ✅ API key is stored server-side in `.env`
- ✅ `.env` is in `.gitignore` (never committed)
- ✅ Backend validates all requests
- ⚠️ For production, add rate limiting and authentication
