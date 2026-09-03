#!/usr/bin/env python3
"""Analyze every MP3 in the game's music directory.

Run from the repository root after adding music:
    python3 scripts/analyze-all-beats.py

The generated JSON files are committed alongside the song metadata and keep
music-synchronized levels deterministic at runtime.
"""

from __future__ import annotations

import subprocess
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MUSIC_DIR = ROOT / "frontend" / "public" / "music"
OUTPUT_DIR = ROOT / "frontend" / "src" / "game" / "beatmaps"
ANALYZER = ROOT / "scripts" / "analyze-beats.py"


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    for audio_path in sorted(MUSIC_DIR.glob("*.mp3")):
        output_name = (
            "wonders-of-the-earth.analysis.json"
            if audio_path.name == "grand_project-wonders-of-the-earth-550792.mp3"
            else f"{audio_path.stem}.analysis.json"
        )
        output_path = OUTPUT_DIR / output_name
        subprocess.run(
            ["python3", str(ANALYZER), str(audio_path), "--output", str(output_path)],
            check=True,
        )
        print(f"Wrote {output_path.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
