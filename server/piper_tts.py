import sys
import os
import wave
import argparse
from piper import PiperVoice

def main():
    parser = argparse.ArgumentParser(description="Piper TTS Offline Synthesizer")
    parser.add_argument("--model", required=True, help="Path to .onnx model file")
    parser.add_argument("--output", required=True, help="Path to output .wav file")
    parser.add_argument("--text", help="Text to synthesize")
    parser.add_argument("--file", help="Path to text file to synthesize")
    parser.add_argument("--length-scale", type=float, default=1.0, help="Speech rate adjustment")
    args = parser.parse_args()

    text = ""
    if args.file and os.path.exists(args.file):
        with open(args.file, "r", encoding="utf-8") as f:
            text = f.read()
    elif args.text:
        text = args.text
    else:
        text = sys.stdin.read()

    text = text.strip()
    if not text:
        print("Error: Empty text provided", file=sys.stderr)
        sys.exit(1)

    voice = PiperVoice.load(args.model)
    with wave.open(args.output, "wb") as wav_file:
        voice.synthesize_wav(text, wav_file, length_scale=args.length_scale)

if __name__ == "__main__":
    main()
