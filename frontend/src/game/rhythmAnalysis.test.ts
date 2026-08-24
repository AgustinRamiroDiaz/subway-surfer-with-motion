import { describe, expect, test } from 'vitest';
import { WONDERS_OF_THE_EARTH_ANALYSIS } from './handRhythmSong';

describe('Wonders of the Earth musical analysis', () => {
  test('contains normalized beat, bar, onset, and section features', () => {
    const analysis = WONDERS_OF_THE_EARTH_ANALYSIS;
    expect(analysis.beats).toHaveLength(349);
    expect(analysis.bars.length).toBeGreaterThan(80);
    expect(analysis.onsets.length).toBeGreaterThan(300);
    expect(analysis.sections.length).toBeGreaterThan(3);
    analysis.beats.forEach((beat) => {
      [
        beat.loudness,
        beat.onsetStrength,
        beat.lowEnergy,
        beat.midEnergy,
        beat.highEnergy,
        beat.novelty,
        beat.accent,
      ].forEach((value) => {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      });
    });
  });

  test('distinguishes quiet and dense musical regions', () => {
    expect(WONDERS_OF_THE_EARTH_ANALYSIS.beats.some((beat) => beat.silent)).toBe(true);
    expect(WONDERS_OF_THE_EARTH_ANALYSIS.bars.some((bar) => bar.silent)).toBe(true);
    expect(WONDERS_OF_THE_EARTH_ANALYSIS.bars.some((bar) => bar.onsetDensity >= 0.9)).toBe(true);
  });
});
