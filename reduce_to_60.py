#!/usr/bin/env python3
"""
Reduce talking animation from 180 frames to 60 frames (every 3rd frame).
"""
import os
import shutil
from pathlib import Path

def reduce_to_60_frames(folder_path):
    """Keep every 3rd frame from 180 frames, resulting in 60 frames."""
    folder = Path(folder_path)

    # Use backup folder if original is already modified
    if (folder.parent / f"{folder.name}_backup").exists():
        source_folder = folder.parent / f"{folder.name}_backup"
        print(f"Using backup folder: {source_folder}")
    else:
        source_folder = folder
        print(f"Using current folder: {source_folder}")

    all_frames = sorted(source_folder.glob('frame_*.png'))
    total_frames = len(all_frames)

    print(f"Found {total_frames} frames")
    print(f"Will keep every 3rd frame (0, 3, 6, 9, ...)")
    print(f"Result: 60 frames total")

    # Create temp folder
    temp_folder = folder.parent / "talking_60_temp"
    temp_folder.mkdir(exist_ok=True)

    # Keep every 3rd frame
    new_frame_index = 0
    for i in range(0, 180, 3):  # 0, 3, 6, 9, ..., 177
        old_frame = source_folder / f"frame_{i:03d}.png"
        if old_frame.exists():
            new_frame_name = f"frame_{new_frame_index:03d}.png"
            new_frame_path = temp_folder / new_frame_name
            shutil.copy2(old_frame, new_frame_path)

            if new_frame_index < 10:
                print(f"  frame_{i:03d}.png -> {new_frame_name}")

            new_frame_index += 1

    print(f"\nCreated {new_frame_index} frames in {temp_folder}")

    # Calculate sizes
    new_size = sum(f.stat().st_size for f in temp_folder.glob('*.png'))
    print(f"New folder size: {new_size / (1024*1024):.1f} MB")

    # Replace original folder
    print(f"\nReplacing {folder} with 60-frame version...")

    # Backup original if not already backed up
    backup_folder = folder.parent / f"{folder.name}_180_backup"
    if not backup_folder.exists():
        print(f"Creating backup: {backup_folder}")
        shutil.copytree(folder, backup_folder)

    # Clear original folder
    for f in folder.glob('*.png'):
        f.unlink()

    # Move new frames
    for new_frame in temp_folder.glob('*.png'):
        shutil.move(str(new_frame), str(folder / new_frame.name))

    # Remove temp
    temp_folder.rmdir()

    print(f"\nSUCCESS! Reduced to 60 frames")
    print(f"Backup: {backup_folder}")
    return 60

if __name__ == '__main__':
    talking_folder = 'images/talking'
    print("="*60)
    print("Reduce Talking Animation: 180 -> 60 frames")
    print("="*60)
    print()

    new_count = reduce_to_60_frames(talking_folder)

    print(f"\nNext: Update audioSync.js to use {new_count} frames")
