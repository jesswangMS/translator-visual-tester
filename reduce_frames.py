#!/usr/bin/env python3
"""
Reduce animation frames by keeping every Nth frame and renumbering.
"""
import os
import shutil
from pathlib import Path

def reduce_frames(folder_path, keep_every_n=2):
    """
    Keep every Nth frame and renumber them sequentially.

    Args:
        folder_path: Path to folder containing frames
        keep_every_n: Keep every Nth frame (2 = keep every 2nd frame)
    """
    folder = Path(folder_path)

    if not folder.exists():
        print(f"Error: Folder not found: {folder}")
        return

    # Get all PNG files (should be frame_000.png to frame_179.png)
    all_frames = sorted(folder.glob('frame_*.png'))
    total_frames = len(all_frames)

    if total_frames == 0:
        print(f"No frame files found in {folder}")
        return

    print(f"Found {total_frames} frames in {folder}")
    print(f"Will keep every {keep_every_n} frame(s)")

    # Create temp folder for new frames
    temp_folder = folder.parent / f"{folder.name}_temp"
    temp_folder.mkdir(exist_ok=True)

    # Keep every Nth frame and copy to temp folder with new numbering
    new_frame_index = 0
    kept_frames = []

    for i, frame_file in enumerate(all_frames):
        if i % keep_every_n == 0:
            # This frame will be kept
            new_frame_name = f"frame_{new_frame_index:03d}.png"
            new_frame_path = temp_folder / new_frame_name

            # Copy to temp folder with new name
            shutil.copy2(frame_file, new_frame_path)
            kept_frames.append((frame_file.name, new_frame_name))

            if new_frame_index < 5 or new_frame_index % 20 == 0:
                print(f"  {frame_file.name} -> {new_frame_name}")

            new_frame_index += 1

    print(f"\nKept {new_frame_index} frames out of {total_frames}")
    print(f"New total: {new_frame_index} frames (frame_000.png to frame_{new_frame_index-1:03d}.png)")

    # Calculate sizes
    original_size = sum(f.stat().st_size for f in all_frames)
    new_size = sum(f.stat().st_size for f in temp_folder.glob('*.png'))
    reduction = ((original_size - new_size) / original_size) * 100

    print(f"\nOriginal size: {original_size / (1024*1024):.1f} MB")
    print(f"New size: {new_size / (1024*1024):.1f} MB")
    print(f"Reduction: {reduction:.1f}%")

    # Ask for confirmation
    print("\n" + "="*60)
    response = input(f"Replace {folder} with reduced frames? (yes/no): ").strip().lower()

    if response == 'yes':
        # Create backup of original
        backup_folder = folder.parent / f"{folder.name}_original_180"
        if backup_folder.exists():
            print(f"\nBackup folder {backup_folder} already exists, skipping backup")
        else:
            print(f"\nCreating backup: {backup_folder}")
            shutil.copytree(folder, backup_folder)

        # Delete original frames
        print(f"Deleting original frames from {folder}")
        for frame_file in all_frames:
            frame_file.unlink()

        # Move new frames from temp to original folder
        print(f"Moving reduced frames to {folder}")
        for new_frame in temp_folder.glob('*.png'):
            shutil.move(str(new_frame), str(folder / new_frame.name))

        # Remove temp folder
        temp_folder.rmdir()

        print("\n" + "="*60)
        print("SUCCESS! Frame reduction complete.")
        print(f"New frame count: {new_frame_index}")
        print(f"Backup saved to: {backup_folder}")
        print("\nNext steps:")
        print("1. Update audioSync.js to use new frame count")
        print("2. Test locally")
        print("3. Commit and push to GitHub")
    else:
        print("\nCancelled. Cleaning up temp folder...")
        shutil.rmtree(temp_folder)
        print("No changes made.")

    return new_frame_index

if __name__ == '__main__':
    talking_folder = 'images/talking'

    print("="*60)
    print("Animation Frame Reducer")
    print("="*60)
    print()

    new_count = reduce_frames(talking_folder, keep_every_n=2)

    if new_count:
        print(f"\nRemember to update audioSync.js:")
        print(f"  Change: const totalFrames = 180;")
        print(f"  To:     const totalFrames = {new_count};")
