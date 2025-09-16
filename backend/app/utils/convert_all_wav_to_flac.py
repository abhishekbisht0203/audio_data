import os
import subprocess
import shutil

# Path to the folder with WAV files (current folder)
folder = os.getcwd()

# Ensure ffmpeg is available
ffmpeg_cmd = shutil.which("ffmpeg")
if ffmpeg_cmd is None:
    print("❌ ffmpeg not found. Please install it and add to PATH.")
    exit(1)

# Track if any files were converted
converted = False

for filename in os.listdir(folder):
    if filename.lower().endswith(".wav"):
        wav_path = os.path.join(folder, filename)
        flac_filename = os.path.splitext(filename)[0] + ".flac"
        flac_path = os.path.join(folder, flac_filename)

        print(f"🎵 Converting: {filename} → {flac_filename}")
        
        command = [ffmpeg_cmd, "-y", "-i", wav_path, flac_path]  # -y overwrites

        try:
            subprocess.run(command, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.STDOUT)
            converted = True
        except subprocess.CalledProcessError as e:
            print(f"❌ Failed to convert {filename}: {e}")

if not converted:
    print("ℹ️ No .wav files found in the folder.")
else:
    print("✅ All conversions complete.")
