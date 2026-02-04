#!/usr/bin/env python3
"""
Create sprite sheets from animation frames for better web performance.
Combines multiple frames into a single image to reduce HTTP requests.
"""
import os
from pathlib import Path
from PIL import Image
import math

def create_sprite_sheet(frames_folder, output_path, frames_per_row=10):
    """
    Create a sprite sheet from a folder of frame images.

    Args:
        frames_folder: Path to folder containing frame images
        output_path: Path to save the sprite sheet
        frames_per_row: Number of frames per row in the grid

    Returns:
        dict with metadata about the sprite sheet
    """
    folder = Path(frames_folder)

    if not folder.exists():
        print(f"[ERROR] Folder not found: {folder}")
        return None

    # Get all PNG files sorted by name
    frame_files = sorted(folder.glob('frame_*.png'))
    total_frames = len(frame_files)

    if total_frames == 0:
        print(f"[ERROR] No frame files found in {folder}")
        return None

    print(f"[*] Creating sprite sheet for {folder.name}")
    print(f"    Frames: {total_frames}")

    # Load first frame to get dimensions
    first_frame = Image.open(frame_files[0])
    frame_width, frame_height = first_frame.size
    print(f"    Frame size: {frame_width}x{frame_height}")

    # Calculate grid dimensions
    frames_per_row = min(frames_per_row, total_frames)
    num_rows = math.ceil(total_frames / frames_per_row)

    sprite_width = frame_width * frames_per_row
    sprite_height = frame_height * num_rows

    print(f"    Grid: {frames_per_row}x{num_rows}")
    print(f"    Sprite size: {sprite_width}x{sprite_height}")

    # Create blank sprite sheet
    sprite_sheet = Image.new('RGBA', (sprite_width, sprite_height), (0, 0, 0, 0))

    # Paste each frame into the sprite sheet
    for i, frame_file in enumerate(frame_files):
        frame = Image.open(frame_file)

        # Calculate position in grid
        col = i % frames_per_row
        row = i // frames_per_row
        x = col * frame_width
        y = row * frame_height

        # Paste frame
        sprite_sheet.paste(frame, (x, y))

        if (i + 1) % 10 == 0 or i == total_frames - 1:
            print(f"    Progress: {i + 1}/{total_frames} frames", end='\r')

    print()  # New line after progress

    # Save sprite sheet
    output_path = Path(output_path)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    sprite_sheet.save(output_path, 'PNG', optimize=True)

    file_size = output_path.stat().st_size / 1024  # KB
    print(f"    [OK] Saved: {output_path}")
    print(f"    Size: {file_size:.1f} KB")

    # Return metadata
    metadata = {
        'frameWidth': frame_width,
        'frameHeight': frame_height,
        'totalFrames': total_frames,
        'framesPerRow': frames_per_row,
        'numRows': num_rows,
        'spriteWidth': sprite_width,
        'spriteHeight': sprite_height
    }

    return metadata

def create_all_sprite_sheets():
    """Create sprite sheets for all animations."""

    print("=" * 60)
    print("Sprite Sheet Generator")
    print("=" * 60)
    print()

    animations = [
        {
            'name': 'talking',
            'folder': 'images/talking',
            'output': 'images/sprites/talking_sprite.png',
            'frames_per_row': 10
        },
        {
            'name': 'thinking',
            'folder': 'images/thinking',
            'output': 'images/sprites/thinking_sprite.png',
            'frames_per_row': 10
        },
        {
            'name': 'timer',
            'folder': 'images/timer',
            'output': 'images/sprites/timer_sprite.png',
            'frames_per_row': 10
        },
        {
            'name': 'listening',
            'folder': 'images/listening',
            'output': 'images/sprites/listening_sprite.png',
            'frames_per_row': 7  # 21 frames -> 3 rows of 7
        }
    ]

    metadata_all = {}

    for anim in animations:
        metadata = create_sprite_sheet(
            anim['folder'],
            anim['output'],
            anim['frames_per_row']
        )

        if metadata:
            metadata_all[anim['name']] = metadata

        print()

    # Save metadata as JSON
    import json
    metadata_path = Path('images/sprites/metadata.json')
    with open(metadata_path, 'w') as f:
        json.dump(metadata_all, f, indent=2)

    print("=" * 60)
    print("[SUCCESS] All sprite sheets created!")
    print(f"Metadata saved to: {metadata_path}")
    print()
    print("Next steps:")
    print("1. The sprite sheets are in images/sprites/")
    print("2. audioSync.js will be updated to use sprite sheets")
    print("3. Individual frame files can be kept as backup")
    print("=" * 60)

if __name__ == '__main__':
    create_all_sprite_sheets()
