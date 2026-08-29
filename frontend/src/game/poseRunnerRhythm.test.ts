import { describe, expect, test } from 'vitest';
import { WONDERS_OF_THE_EARTH_ANALYSIS } from './handRhythmSong';
import {
  POSE_RUNNER_APPROACH_BEATS,
  POSE_RUNNER_PLAYBACK,
  POSE_RUNNER_RHYTHM_EVENTS,
  generatePoseRunnerRhythmEvents,
} from './poseRunnerRhythm';
import { getRhythmNoteTimes } from './rhythmTiming';

describe('pose runner rhythm chart', () => {
  test('places one playable obstacle on the strongest non-silent beat of each selected bar', () => {
    const strongestBeats = new Set(
      WONDERS_OF_THE_EARTH_ANALYSIS.bars
        .filter((bar) => !bar.silent)
        .map((bar) => bar.strongestBeat)
    );

    expect(POSE_RUNNER_RHYTHM_EVENTS.length).toBeGreaterThan(0);
    expect(POSE_RUNNER_RHYTHM_EVENTS.every((event) => strongestBeats.has(event.beat))).toBe(true);
    expect(POSE_RUNNER_RHYTHM_EVENTS.every((event) => (
      !WONDERS_OF_THE_EARTH_ANALYSIS.beats[event.beat]?.silent
    ))).toBe(true);
  });

  test('keeps every obstacle spawn at or after the song starts', () => {
    POSE_RUNNER_RHYTHM_EVENTS.forEach((event) => {
      expect(getRhythmNoteTimes(POSE_RUNNER_PLAYBACK, event).spawnTimeSeconds).toBeGreaterThanOrEqual(0);
    });
  });

  test('supports a different approach duration without admitting early events', () => {
    const events = generatePoseRunnerRhythmEvents(
      WONDERS_OF_THE_EARTH_ANALYSIS,
      POSE_RUNNER_APPROACH_BEATS + 4
    );
    expect(events[0]?.beat).toBeGreaterThanOrEqual(POSE_RUNNER_APPROACH_BEATS + 4);
  });
});
