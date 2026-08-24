#!/usr/bin/env python3
"""Estimate a fixed-tempo quarter-beat grid from an audio file.

The script intentionally depends only on Python, NumPy, and FFmpeg so it can be
kept as a lightweight authoring tool in this repository.
"""

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

import numpy as np


SAMPLE_RATE = 22_050
HOP_LENGTH = 256
FRAME_LENGTH = 1_024


def decode_audio(path: Path) -> np.ndarray:
    result = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-ac",
            "1",
            "-ar",
            str(SAMPLE_RATE),
            "-f",
            "f32le",
            "pipe:1",
        ],
        check=True,
        stdout=subprocess.PIPE,
    )
    return np.frombuffer(result.stdout, dtype="<f4")


def onset_envelope(audio: np.ndarray) -> np.ndarray:
    if len(audio) < FRAME_LENGTH:
        raise ValueError("Audio is too short to analyze")

    frame_count = 1 + (len(audio) - FRAME_LENGTH) // HOP_LENGTH
    frames = np.lib.stride_tricks.as_strided(
        audio,
        shape=(frame_count, FRAME_LENGTH),
        strides=(audio.strides[0] * HOP_LENGTH, audio.strides[0]),
        writeable=False,
    )
    spectrum = np.abs(np.fft.rfft(frames * np.hanning(FRAME_LENGTH), axis=1))
    spectrum = np.log1p(10 * spectrum)
    flux = np.maximum(0, np.diff(spectrum, axis=0)).mean(axis=1)
    flux = np.concatenate(([0.0], flux))

    # Subtract a local mean so sustained loud sections do not dominate beats.
    local_window = max(3, round(0.35 * SAMPLE_RATE / HOP_LENGTH))
    local_mean = np.convolve(flux, np.ones(local_window) / local_window, mode="same")
    envelope = np.maximum(0, flux - local_mean)
    scale = np.percentile(envelope, 95)
    return envelope / scale if scale > 0 else envelope


def estimate_tempo(envelope: np.ndarray, min_bpm: float, max_bpm: float) -> tuple[float, float]:
    frame_rate = SAMPLE_RATE / HOP_LENGTH
    centered = envelope - envelope.mean()
    correlation = np.correlate(centered, centered, mode="full")[len(centered) - 1 :]
    min_lag = max(1, round(frame_rate * 60 / max_bpm))
    max_lag = min(len(correlation) - 1, round(frame_rate * 60 / min_bpm))
    lags = np.arange(min_lag, max_lag + 1)

    # Favor the musically common middle of the requested range while retaining
    # the actual autocorrelation peak. Harmonics at 2x/0.5x otherwise dominate.
    bpms = 60 * frame_rate / lags
    prior = np.exp(-0.5 * (np.log2(bpms / 120) / 0.7) ** 2)
    scores = correlation[lags] * prior
    best_index = int(np.argmax(scores))
    best_lag = int(lags[best_index])

    # Parabolic peak interpolation yields a less quantized BPM estimate.
    fractional_lag = float(best_lag)
    if 0 < best_lag < len(correlation) - 1:
        left, center, right = correlation[best_lag - 1 : best_lag + 2]
        denominator = left - 2 * center + right
        if denominator != 0:
            fractional_lag += float(0.5 * (left - right) / denominator)

    confidence = float(correlation[best_lag] / max(correlation[0], 1e-9))
    return 60 * frame_rate / fractional_lag, confidence


def estimate_phase(envelope: np.ndarray, bpm: float) -> float:
    frame_rate = SAMPLE_RATE / HOP_LENGTH
    period_frames = frame_rate * 60 / bpm
    phase_candidates = np.linspace(0, period_frames, 512, endpoint=False)
    beat_indices = np.arange(len(envelope), dtype=float)

    # Fold onset energy into one beat period, with a narrow Gaussian tolerance.
    sigma = max(1.0, period_frames * 0.055)
    scores = []
    for phase in phase_candidates:
        distance = np.abs((beat_indices - phase + period_frames / 2) % period_frames - period_frames / 2)
        scores.append(float(np.sum(envelope * np.exp(-0.5 * (distance / sigma) ** 2))))

    phase_frames = float(phase_candidates[int(np.argmax(scores))])
    return phase_frames / frame_rate


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("audio", type=Path)
    parser.add_argument("--min-bpm", type=float, default=70)
    parser.add_argument("--max-bpm", type=float, default=180)
    parser.add_argument("--bpm", type=float, help="Use a known fixed BPM after estimating the beat phase")
    parser.add_argument("--offset", type=float, help="Override the detected first-beat offset in seconds")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()

    audio = decode_audio(args.audio)
    envelope = onset_envelope(audio)
    estimated_bpm, confidence = estimate_tempo(envelope, args.min_bpm, args.max_bpm)
    bpm = args.bpm if args.bpm is not None else estimated_bpm
    estimated_beat_offset = estimate_phase(envelope, bpm)
    beat_offset = args.offset if args.offset is not None else estimated_beat_offset
    duration = len(audio) / SAMPLE_RATE
    seconds_per_beat = 60 / bpm
    beat_times = np.arange(beat_offset, duration, seconds_per_beat)

    result = {
        "source": args.audio.name,
        "durationSeconds": round(duration, 6),
        "bpm": round(bpm, 6),
        "estimatedBpm": round(estimated_bpm, 6),
        "beatOffsetSeconds": round(beat_offset, 6),
        "estimatedBeatOffsetSeconds": round(estimated_beat_offset, 6),
        "confidence": round(confidence, 6),
        "beatTimesSeconds": [round(float(value), 6) for value in beat_times],
    }
    rendered = json.dumps(result, indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered, encoding="utf-8")
    else:
        print(rendered, end="")


if __name__ == "__main__":
    main()
