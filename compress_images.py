#!/usr/bin/env python3
"""
Compress PNG images to reduce file size while maintaining quality.
"""
import os
from pathlib import Path
from PIL import Image

def compress_png(input_path, output_path, quality=85):
    """
    Compress a PNG image.

    Args:
        input_path: Path to input PNG file
        output_path: Path to save compressed PNG
        quality: Quality level (0-100, higher is better)
    """
    try:
        # Open image
        img = Image.open(input_path)

        # Convert RGBA to RGB if needed (for better compression)
        # Keep alpha channel if it exists
        if img.mode == 'RGBA':
            # Check if alpha channel is actually used
            alpha = img.split()[-1]
            if alpha.getextrema() == (255, 255):
                # No transparency, convert to RGB
                img = img.convert('RGB')

        # Save with optimization
        img.save(output_path, 'PNG', optimize=True, compress_level=9)

        return True
    except Exception as e:
        print(f"Error compressing {input_path}: {e}")
        return False

def compress_folder(folder_path, backup=True):
    """
    Compress all PNG images in a folder.

    Args:
        folder_path: Path to folder containing PNG files
        backup: Whether to create backups (default: True)
    """
    folder = Path(folder_path)

    if not folder.exists():
        print(f"Error: Folder not found: {folder}")
        return

    # Get all PNG files
    png_files = sorted(folder.glob('*.png'))
    total_files = len(png_files)

    if total_files == 0:
        print(f"No PNG files found in {folder}")
        return

    print(f"Found {total_files} PNG files to compress")
    print(f"Folder: {folder}")

    # Calculate original size
    original_size = sum(f.stat().st_size for f in png_files)
    print(f"Original total size: {original_size / (1024*1024):.1f} MB")
    print()

    # Create backup folder if requested
    if backup:
        backup_folder = folder.parent / f"{folder.name}_backup"
        backup_folder.mkdir(exist_ok=True)
        print(f"Backups will be saved to: {backup_folder}")

    # Compress each file
    compressed_count = 0
    for i, png_file in enumerate(png_files, 1):
        print(f"[{i}/{total_files}] Compressing {png_file.name}...", end=' ')

        # Backup original if requested
        if backup:
            import shutil
            backup_path = backup_folder / png_file.name
            shutil.copy2(png_file, backup_path)

        # Compress
        temp_output = folder / f"{png_file.stem}_temp.png"
        if compress_png(png_file, temp_output):
            # Replace original with compressed version
            os.replace(temp_output, png_file)

            # Show size reduction
            new_size = png_file.stat().st_size
            original_file_size = (backup_folder / png_file.name).stat().st_size if backup else 0
            if backup:
                reduction = ((original_file_size - new_size) / original_file_size) * 100
                print(f"OK ({new_size/1024:.1f} KB, {reduction:.1f}% smaller)")
            else:
                print(f"OK ({new_size/1024:.1f} KB)")
            compressed_count += 1
        else:
            print("FAILED")
            if temp_output.exists():
                temp_output.unlink()

    print()
    print(f"Compression complete: {compressed_count}/{total_files} files")

    # Calculate new size
    new_size = sum(f.stat().st_size for f in png_files)
    reduction = ((original_size - new_size) / original_size) * 100
    print(f"New total size: {new_size / (1024*1024):.1f} MB")
    print(f"Total reduction: {reduction:.1f}% ({(original_size - new_size) / (1024*1024):.1f} MB saved)")

    if backup:
        print()
        print(f"Original files backed up to: {backup_folder}")

if __name__ == '__main__':
    import sys

    # Compress talking folder
    talking_folder = 'images/talking'

    print("=" * 60)
    print("PNG Image Compressor")
    print("=" * 60)
    print()

    compress_folder(talking_folder, backup=True)

    print()
    print("Done! The compressed images are ready to push to GitHub.")
