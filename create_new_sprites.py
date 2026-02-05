#!/usr/bin/env python3
"""
Create sprite sheets for new thinking and timer animations
"""
from PIL import Image
import os
import json

def create_sprite_sheet(input_folder, output_path, frames_per_row=10):
    """Create a horizontal sprite sheet from individual frames"""
    # Get all PNG files sorted by name
    frames = sorted([f for f in os.listdir(input_folder) if f.endswith('.png')])

    if not frames:
        print(f"No PNG files found in {input_folder}")
        return None

    print(f"Found {len(frames)} frames in {input_folder}")

    # Load first frame to get dimensions
    first_frame = Image.open(os.path.join(input_folder, frames[0]))
    frame_width, frame_height = first_frame.size

    print(f"Frame size: {frame_width}x{frame_height}")

    # Calculate sprite sheet dimensions
    num_rows = (len(frames) + frames_per_row - 1) // frames_per_row
    sheet_width = frame_width * frames_per_row
    sheet_height = frame_height * num_rows

    print(f"Creating sprite sheet: {sheet_width}x{sheet_height} ({frames_per_row} frames/row, {num_rows} rows)")

    # Create sprite sheet
    sprite_sheet = Image.new('RGBA', (sheet_width, sheet_height), (0, 0, 0, 0))

    # Paste each frame
    for i, frame_file in enumerate(frames):
        frame = Image.open(os.path.join(input_folder, frame_file))
        row = i // frames_per_row
        col = i % frames_per_row
        x = col * frame_width
        y = row * frame_height
        sprite_sheet.paste(frame, (x, y))

        if (i + 1) % 10 == 0:
            print(f"  Processed {i + 1}/{len(frames)} frames...")

    # Save sprite sheet
    sprite_sheet.save(output_path, 'PNG', optimize=True)
    print(f"[OK] Saved sprite sheet to {output_path}")

    # Return metadata
    return {
        'totalFrames': len(frames),
        'frameWidth': frame_width,
        'frameHeight': frame_height,
        'framesPerRow': frames_per_row,
        'rows': num_rows
    }

# Create thinking sprite sheet
print("\n=== Creating Thinking Animation Sprite Sheet ===")
thinking_metadata = create_sprite_sheet(
    'images/thinking2/thinkingLoop',
    'images/sprites/thinking_sprite.png',
    frames_per_row=12  # 120 frames = 10 rows of 12
)

# Create timer sprite sheet
print("\n=== Creating Timer Animation Sprite Sheet ===")
timer_metadata = create_sprite_sheet(
    'images/timer2/loadingBar',
    'images/sprites/timer_sprite.png',
    frames_per_row=10  # 80 frames = 8 rows of 10
)

# Save metadata
if thinking_metadata and timer_metadata:
    metadata = {
        'thinking': thinking_metadata,
        'timer': timer_metadata
    }

    with open('images/sprites/sprite_metadata.json', 'w') as f:
        json.dump(metadata, f, indent=2)

    print("\n[OK] All sprite sheets created successfully!")
    print(f"   Thinking: {thinking_metadata['totalFrames']} frames")
    print(f"   Timer: {timer_metadata['totalFrames']} frames")
