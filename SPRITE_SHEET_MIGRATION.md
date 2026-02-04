# Sprite Sheet Migration Summary

## What Changed

Migrated from individual frame files to sprite sheets for better web performance.

## Performance Improvements

### Before (Individual Frames)
- **Talking**: 60 files × ~360KB = 22MB, 60 HTTP requests
- **Thinking**: 60 files, 60 HTTP requests
- **Timer**: 75 files, 75 HTTP requests
- **Listening**: 21 files, 21 HTTP requests
- **TOTAL**: 216 HTTP requests

### After (Sprite Sheets)
- **Talking**: 1 file (20.9MB), 1 HTTP request
- **Thinking**: 1 file (765KB), 1 HTTP request
- **Timer**: 1 file (1.05MB), 1 HTTP request
- **Listening**: 1 file (2.2MB), 1 HTTP request
- **TOTAL**: 4 HTTP requests

**Result**: 98% fewer HTTP requests! Much faster loading on GitHub Pages.

## Files Created

1. **create_sprite_sheets.py** - Script to generate sprite sheets
2. **images/sprites/** - Directory containing sprite sheets:
   - `talking_sprite.png` (10×6 grid, 60 frames)
   - `thinking_sprite.png` (10×6 grid, 60 frames)
   - `timer_sprite.png` (10×8 grid, 75 frames)
   - `listening_sprite.png` (7×3 grid, 21 frames)
   - `metadata.json` - Frame dimensions and layout info

## Files Modified

1. **audioSync.js** - Updated to use sprite sheets:
   - Changed from `preloadedImages` arrays to `spriteSheets` object
   - Added `drawSpriteFrame()` method for rendering from sprite sheets
   - Updated all animation methods to use sprite rendering
   - Preloading now loads 4 images instead of 216

## How It Works

Each sprite sheet is a grid of frames:
```
[Frame 0][Frame 1][Frame 2]...[Frame 9]
[Frame 10][Frame 11]...
...
```

The canvas renders the correct frame by:
1. Calculating row/column from frame index
2. Using `drawImage()` with source rectangle to clip the right frame
3. Drawing to canvas at full size

## Testing

To test locally:
1. Run `npm start` to start the server
2. Open http://localhost:3000
3. Check browser console for "Using sprite sheet" messages
4. Verify animations play smoothly

## Regenerating Sprite Sheets

If you update animation frames:
```bash
python create_sprite_sheets.py
```

This will recreate all sprite sheets in `images/sprites/`.

## Original Frames

Original frame files are still in:
- `images/talking/`
- `images/thinking/`
- `images/timer/`
- `images/listening/`

These can be kept as backups or removed to save space (not needed for the app).
