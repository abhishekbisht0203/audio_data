import sys
import os
from pydub import AudioSegment

def convert_wav_to_flac(input_path, output_path):
    # 1. Check if input file exists
    if not os.path.isfile(input_path):
        print(f"❌ Input file does not exist: {input_path}")
        return 1

    # 2. Check input file extension
    if not input_path.lower().endswith('.wav'):
        print("❌ Input file must be a .wav file")
        return 1

    # 3. Ensure output has .flac extension
    if not output_path.lower().endswith('.flac'):
        output_path += ".flac"

    try:
        # 4. Load the WAV file using pydub
        print(f"📥 Loading WAV file: {input_path}")
        audio = AudioSegment.from_wav(input_path)

        # 5. Export as FLAC
        print(f"📤 Converting and saving to: {output_path}")
        audio.export(output_path, format="flac")

        print("✅ Conversion successful!")
        return 0
    except FileNotFoundError:
        print("❌ ffmpeg not found. Please install it and make sure it’s in PATH.")
        return 1
    except Exception as e:
        print(f"❌ Error during conversion: {e}")
        return 1


if __name__ == "__main__":
    # 6. Check if user provided correct arguments
    if len(sys.argv) != 3:
        print("Usage: python convert.py input.wav output.flac")
        sys.exit(1)

    input_file = sys.argv[1]
    output_file = sys.argv[2]

    exit_code = convert_wav_to_flac(input_file, output_file)
    sys.exit(exit_code)
